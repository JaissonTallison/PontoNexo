import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import {
  allowedNext,
  checkSequence,
  DEVICE_CLOCK_TOLERANCE_SECONDS,
  evaluateGeofence,
  formatLocalDateTime,
  localDate,
  MIN_SECONDS_BETWEEN_PUNCHES,
  monthRange,
  STALE_SESSION_HOURS,
  stateAfter,
  type AlertCode,
  type AuthorizedLocationView,
  type PunchContextView,
  type PunchCreateInput,
  type PunchResultView,
  type ReceiptPayload,
  type ReceiptVerification,
  type SessionState,
} from '@pontonexo/shared';
import { sql } from 'drizzle-orm';
import type { Env } from '../../config/env.js';
import type { Database, Tx } from '../../db/client.js';
import {
  correctionRequests,
  employeeWorkLocations,
  employerCounters,
  employers,
  employees,
  monthlyClosings,
  closingAcknowledgements,
  punchAlerts,
  punchRecords,
  receipts,
  workLocations,
  workSessions,
} from '../../db/schema.js';
import { AuditService } from '../../common/audit.service.js';
import type { EmployeeScope } from '../../common/auth/decorators.js';
import { canonicalJson, chainHash, randomCode, ReceiptSigner, sha256 } from '../../common/crypto.js';
import { AppError, conflict, forbidden, notFound, unprocessable } from '../../common/errors.js';
import type { RequestMeta } from '../../common/http.js';
import { enqueueEvent } from '../../common/outbox.js';
import { TenantDb } from '../../common/tenant.js';
import { DB, ENV } from '../../common/tokens.js';
import { activeContract } from '../funcionarios/employees.service.js';
import { activeGeofence, round6 } from '../locais/locations.service.js';
import { TimeService } from '../time/time.service.js';
import { lastPunch, punchesBetween, punchViews, receiptView } from './punch-views.js';

type PunchRow = typeof punchRecords.$inferSelect;

/** Ocorrências que exigem justificativa do funcionário para a marcação ser aceita. */
const NEEDS_JUSTIFICATION: ReadonlySet<AlertCode> = new Set(['outside_geofence', 'low_accuracy', 'gps_unavailable', 'gps_denied', 'unlisted_location']);

/** Campos cobertos pelo hash encadeado da marcação. */
export const punchHashBody = (p: Omit<PunchRow, 'hash' | 'lat' | 'lng' | 'accuracyM' | 'coordinatesPurgedAt' | 'ipAddress' | 'userAgent'>) => ({
  id: p.id,
  employerId: p.employerId,
  employeeId: p.employeeId,
  nsr: p.nsr,
  type: p.type,
  serverTime: p.serverTime.toISOString(),
  deviceTime: p.deviceTime ? p.deviceTime.toISOString() : null,
  origin: p.origin,
  clockStatus: p.clockStatus,
  locationId: p.locationId,
  geofenceId: p.geofenceId,
  positionOutcome: p.positionOutcome,
  geoStatus: p.geoStatus,
  distanceM: p.distanceM,
  geoDigest: p.geoDigest,
  clientRequestId: p.clientRequestId,
  justification: p.justification,
  createdByUserId: p.createdByUserId,
});

export const geoDigestOf = (lat: number | null, lng: number | null, acc: number | null) => sha256(`${lat ?? '-'}|${lng ?? '-'}|${acc ?? '-'}`);

type Validation =
  | { ok: true; result: PunchResultView }
  | { ok: false; error: AppError; audit: { summary: string; metadata: Record<string, unknown> } };

@Injectable()
export class PunchService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly tenant: TenantDb,
    private readonly audit: AuditService,
    private readonly signer: ReceiptSigner,
    private readonly time: TimeService,
  ) {}

  // ───────────── Contexto do app ─────────────

  async authorizedLocations(tx: Tx, employeeId: string, date: string): Promise<AuthorizedLocationView[]> {
    const rows = await tx
      .select({ id: workLocations.id, name: workLocations.name, kind: workLocations.kind })
      .from(employeeWorkLocations)
      .innerJoin(workLocations, eq(workLocations.id, employeeWorkLocations.locationId))
      .where(
        and(
          eq(employeeWorkLocations.employeeId, employeeId),
          isNull(employeeWorkLocations.revokedAt),
          eq(workLocations.active, true),
          lte(employeeWorkLocations.validFrom, date),
          or(isNull(employeeWorkLocations.validTo), gte(employeeWorkLocations.validTo, date)),
        ),
      )
      // residência primeiro, depois locais externos, viagem por último
      .orderBy(asc(workLocations.kind), asc(workLocations.name));
    const unique = [...new Map(rows.map((r) => [r.id, r])).values()];
    const out: AuthorizedLocationView[] = [];
    for (const l of unique) {
      const fence = await activeGeofence(tx, l.id, date);
      out.push({ ...l, geofence: fence ? { lat: fence.centerLat, lng: fence.centerLng, radiusM: fence.radiusM } : null });
    }
    return out;
  }

  private async openSession(tx: Tx, employeeId: string) {
    const [s] = await tx.select().from(workSessions).where(and(eq(workSessions.employeeId, employeeId), inArray(workSessions.state, ['working', 'on_break']))).limit(1);
    return s ?? null;
  }

  private isStale(session: { startedAt: Date } | null, now: Date) {
    return session !== null && now.getTime() - session.startedAt.getTime() > STALE_SESSION_HOURS * 3600_000;
  }

  async context(scope: EmployeeScope): Promise<PunchContextView> {
    const { employerId, employeeId, timezone, employerName } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const [emp] = await tx.select().from(employees).where(eq(employees.id, employeeId));
      if (!emp) throw notFound('Funcionário');
      const now = this.time.now();
      const today = localDate(now, timezone);
      const session = await this.openSession(tx, employeeId);
      const stale = this.isStale(session, now);
      const state: SessionState = session && !stale ? (session.state as SessionState) : 'none';
      // marcações da jornada atual e do dia local
      const since = session && !stale ? new Date(Math.min(session.startedAt.getTime(), now.getTime() - 86_400_000)) : new Date(now.getTime() - 86_400_000);
      const recent = await punchesBetween(tx, employeeId, since, new Date(now.getTime() + 1000));
      const todays = recent.filter((p) => localDate(p.serverTime, timezone) === today || (session && p.workSessionId === session.id));
      const [pending] = await tx.select({ n: count() }).from(correctionRequests).where(and(eq(correctionRequests.employeeId, employeeId), eq(correctionRequests.status, 'pending'), eq(correctionRequests.initiatedBy, 'employee')));
      const [awaiting] = await tx.select({ n: count() }).from(correctionRequests).where(and(eq(correctionRequests.employeeId, employeeId), eq(correctionRequests.status, 'pending'), eq(correctionRequests.initiatedBy, 'employer')));
      const closings = await tx
        .select({ id: monthlyClosings.id, ack: closingAcknowledgements.id })
        .from(monthlyClosings)
        .leftJoin(closingAcknowledgements, eq(closingAcknowledgements.closingId, monthlyClosings.id))
        .where(and(eq(monthlyClosings.employeeId, employeeId), eq(monthlyClosings.status, 'closed')));
      const contract = await activeContract(tx, employeeId, today);
      return {
        employee: { id: emp.id, fullName: emp.fullName },
        employerName,
        timezone,
        serverTime: now.toISOString(),
        clockStatus: this.time.status().status,
        state,
        allowedNext: allowedNext(state),
        staleSession: stale,
        today: await punchViews(tx, todays),
        locations: await this.authorizedLocations(tx, employeeId, today),
        hasActiveContract: contract !== null && emp.status === 'active',
        pendingCorrections: pending?.n ?? 0,
        pendingAcknowledgements: (awaiting?.n ?? 0) + closings.filter((c) => !c.ack).length,
      };
    });
  }

  // ───────────── Marcação ─────────────

  async create(scope: EmployeeScope, input: PunchCreateInput, meta: RequestMeta): Promise<PunchResultView> {
    const { employerId } = scope.membership;
    const outcome = await this.tenant.run(employerId, (tx) => this.validateAndInsert(tx, scope, input, meta));
    if (!outcome.ok) {
      // recusa registrada fora da transação revertida, para não perder o rastro
      await this.tenant.run(employerId, (tx) =>
        this.audit.record(tx, {
          employerId,
          category: 'data',
          action: 'punch.rejected',
          actorUserId: scope.userId,
          entityType: 'employee',
          entityId: scope.membership.employeeId,
          summary: outcome.audit.summary,
          ip: meta.ip,
          metadata: outcome.audit.metadata,
        }),
      );
      throw outcome.error;
    }
    return outcome.result;
  }

  private async validateAndInsert(tx: Tx, scope: EmployeeScope, input: PunchCreateInput, meta: RequestMeta): Promise<Validation> {
    const { employerId, employeeId, timezone } = scope.membership;

    // 1) serializa as marcações do empregador (NSR e cadeia de hash)
    const [counter] = await tx.select().from(employerCounters).where(eq(employerCounters.employerId, employerId)).for('update');
    if (!counter) throw new AppError(500, 'COUNTER_MISSING', 'Empregador sem contador de registros.');

    // 2) idempotência: o mesmo pedido devolve a mesma marcação
    const [existing] = await tx.select().from(punchRecords).where(and(eq(punchRecords.employeeId, employeeId), eq(punchRecords.clientRequestId, input.clientRequestId)));
    if (existing) {
      const [rec] = await tx.select().from(receipts).where(eq(receipts.punchRecordId, existing.id));
      const [view] = await punchViews(tx, [existing]);
      return { ok: true, result: { punch: view!, receipt: receiptView(rec!), replayed: true } };
    }

    const now = this.time.now();
    const today = localDate(now, timezone);
    const [emp] = await tx.select().from(employees).where(eq(employees.id, employeeId));
    if (!emp || emp.status !== 'active') throw forbidden('Cadastro de funcionário inativo. Fale com o empregador.');
    const contract = await activeContract(tx, employeeId, today);
    if (!contract) throw forbidden('Não há contrato de trabalho vigente hoje. Fale com o empregador.');

    // 3) sequência
    let session = await this.openSession(tx, employeeId);
    const stale = this.isStale(session, now);
    const state: SessionState = session && !stale ? (session.state as SessionState) : 'none';
    const seq = checkSequence(state, input.type);
    if (!seq.ok) {
      return {
        ok: false,
        error: conflict('SEQUENCE_INVALID', seq.message, { allowedNext: allowedNext(state) }),
        audit: { summary: `Marcação recusada: sequência inválida (${input.type} com estado ${state})`, metadata: { type: input.type, state, clientRequestId: input.clientRequestId } },
      };
    }
    const last = await lastPunch(tx, employeeId);
    if (last && (now.getTime() - last.serverTime.getTime()) / 1000 < MIN_SECONDS_BETWEEN_PUNCHES) {
      return {
        ok: false,
        error: conflict('TOO_SOON', `Uma marcação foi registrada há menos de ${MIN_SECONDS_BETWEEN_PUNCHES} segundos. Confira o histórico antes de marcar de novo.`),
        audit: { summary: 'Marcação recusada: possível duplicidade', metadata: { type: input.type, clientRequestId: input.clientRequestId } },
      };
    }

    // 4) local e localização
    const alerts: Array<{ code: AlertCode; detail: string | null }> = [];
    const authorized = await this.authorizedLocations(tx, employeeId, today);
    let locationId: string | null = null;
    let locationName: string | null = null;
    let fence: Awaited<ReturnType<typeof activeGeofence>> = null;
    if (input.locationId) {
      const auth = authorized.find((l) => l.id === input.locationId);
      const [loc] = await tx.select().from(workLocations).where(and(eq(workLocations.id, input.locationId), eq(workLocations.employerId, employerId)));
      if (!loc) throw unprocessable('LOCATION', 'Local não encontrado.', { locationId: 'Local inválido.' });
      locationId = loc.id;
      locationName = loc.name;
      fence = loc.kind === 'travel' ? null : await activeGeofence(tx, loc.id, today);
      if (!auth) alerts.push({ code: 'unlisted_location', detail: `"${loc.name}" não está autorizado para o funcionário nesta data` });
    } else {
      alerts.push({ code: 'unlisted_location', detail: 'Marcação em local não cadastrado' });
    }

    const position = input.positionOutcome === 'ok' && input.position ? { lat: round6(input.position.lat), lng: round6(input.position.lng), accuracyM: Math.round(input.position.accuracyM * 10) / 10 } : null;
    const outcomeForGeo = position ? input.positionOutcome : input.positionOutcome === 'ok' ? 'unavailable' : input.positionOutcome;
    const geo = evaluateGeofence(outcomeForGeo, position, fence ? { lat: fence.centerLat, lng: fence.centerLng, radiusM: fence.radiusM } : null);
    if (geo.status === 'outside') alerts.push({ code: 'outside_geofence', detail: `${geo.distanceM} m do centro (raio ${fence?.radiusM} m, precisão ${position?.accuracyM} m)` });
    if (geo.status === 'low_accuracy') alerts.push({ code: 'low_accuracy', detail: `Precisão de ${position?.accuracyM} m para raio de ${fence?.radiusM} m` });
    if (geo.status === 'unavailable') alerts.push({ code: 'gps_unavailable', detail: input.positionOutcome === 'timeout' ? 'Tempo esgotado ao obter a posição' : 'Aparelho não informou posição' });
    if (geo.status === 'denied') alerts.push({ code: 'gps_denied', detail: 'Permissão de localização negada no aparelho' });

    // 5) relógios
    const deviceTime = new Date(input.deviceTime);
    const diffS = Math.round((deviceTime.getTime() - now.getTime()) / 1000);
    if (input.offline) {
      alerts.push({ code: 'offline_submission', detail: `Hora informada pelo aparelho: ${formatLocalDateTime(deviceTime, timezone, true)}. Registrada pela hora de recebimento.` });
    } else if (Math.abs(diffS) > DEVICE_CLOCK_TOLERANCE_SECONDS) {
      alerts.push({ code: 'device_clock_divergence', detail: `Aparelho ${diffS > 0 ? 'adiantado' : 'atrasado'} ${Math.round(Math.abs(diffS) / 60)} min` });
    }
    const clock = this.time.status();
    if (clock.status === 'unverified') alerts.push({ code: 'server_clock_unverified', detail: null });
    if (clock.status === 'drift') alerts.push({ code: 'server_clock_drift', detail: `Defasagem ${clock.offsetMs} ms` });
    if (stale && session) alerts.push({ code: 'stale_session_closed', detail: `Jornada iniciada em ${formatLocalDateTime(session.startedAt, timezone)} sem saída` });

    // 6) justificativa obrigatória quando a evidência é fraca
    const justification = input.justification?.trim() || null;
    const needs = alerts.filter((a) => NEEDS_JUSTIFICATION.has(a.code));
    if (needs.length && (!justification || justification.length < 5)) {
      throw unprocessable('JUSTIFICATION_REQUIRED', 'Explique o motivo para registrar esta marcação.', { justification: 'Informe uma justificativa.' }, { alerts: needs });
    }

    // 7) jornada operacional
    if (stale && session) {
      await tx.update(workSessions).set({ state: 'abandoned', updatedAt: now }).where(eq(workSessions.id, session.id));
      session = null;
    }
    let sessionId: string;
    if (input.type === 'clock_in') {
      const [created] = await tx
        .insert(workSessions)
        .values({ employerId, employeeId, referenceDate: today, state: 'working', startedAt: now, lastPunchAt: now })
        .returning({ id: workSessions.id });
      sessionId = created!.id;
    } else {
      if (!session) throw new AppError(500, 'SESSION_MISSING', 'Jornada aberta não encontrada.');
      const next = stateAfter(input.type);
      await tx
        .update(workSessions)
        .set({ state: next === 'none' ? 'closed' : next, lastPunchAt: now, endedAt: next === 'none' ? now : null, updatedAt: now })
        .where(eq(workSessions.id, session.id));
      sessionId = session.id;
    }

    // 8) registro imutável, encadeado
    const nsr = counter.lastNsr + 1;
    const base = {
      id: randomUUID(),
      employerId,
      employeeId,
      workSessionId: sessionId,
      nsr,
      type: input.type,
      serverTime: now,
      deviceTime,
      deviceTimezone: input.deviceTimezone,
      origin: input.offline ? ('offline_sync' as const) : ('online' as const),
      clockStatus: clock.status,
      clockOffsetMs: clock.offsetMs,
      locationId,
      locationName,
      geofenceId: fence?.id ?? null,
      positionOutcome: input.positionOutcome,
      geoStatus: geo.status,
      distanceM: geo.distanceM,
      networkType: input.networkType ?? null,
      clientRequestId: input.clientRequestId,
      justification,
      createdByUserId: scope.userId,
      prevHash: counter.lastPunchHash,
      geoDigest: geoDigestOf(position?.lat ?? null, position?.lng ?? null, position?.accuracyM ?? null),
    };
    const hash = chainHash(base.prevHash, punchHashBody(base));
    const [row] = await tx
      .insert(punchRecords)
      .values({ ...base, hash, lat: position?.lat ?? null, lng: position?.lng ?? null, accuracyM: position?.accuracyM ?? null, ipAddress: meta.ip, userAgent: meta.userAgent })
      .returning();
    await tx.update(employerCounters).set({ lastNsr: nsr, lastPunchHash: hash }).where(eq(employerCounters.employerId, employerId));
    if (alerts.length) await tx.insert(punchAlerts).values(alerts.map((a) => ({ employerId, employeeId, punchRecordId: row!.id, code: a.code, detail: a.detail })));

    // 9) comprovante assinado
    const [employer] = await tx.select().from(employers).where(eq(employers.id, employerId));
    const payload: ReceiptPayload = {
      title: 'Comprovante de Registro de Ponto do Trabalhador',
      version: 1,
      nsr,
      employer: { name: employer!.legalName, document: employer!.documentCpf },
      employee: { name: emp.fullName, cpf: emp.cpf },
      punchType: input.type,
      serverTimeUtc: now.toISOString(),
      localTime: formatLocalDateTime(now, timezone, true),
      timezone,
      location: locationName,
      geoStatus: geo.status,
      origin: base.origin,
      punchHash: hash,
      system: { name: 'PontoNexo', version: this.env.APP_VERSION, modality: 'Registro eletrônico (LC 150/2015, art. 12) — sem certificação REP-P' },
    };
    const canonical = canonicalJson(payload);
    const [rec] = await tx
      .insert(receipts)
      .values({ employerId, punchRecordId: row!.id, code: await this.uniqueCode(tx), payload, hash: sha256(canonical), signature: this.signer.sign(canonical), keyId: this.signer.keyId, issuedAt: now })
      .returning();

    await this.audit.record(tx, {
      employerId,
      category: 'data',
      action: 'punch.accepted',
      actorUserId: scope.userId,
      entityType: 'punch_record',
      entityId: row!.id,
      summary: `Marcação NSR ${nsr} aceita${alerts.length ? ` com ${alerts.length} ocorrência(s)` : ''}`,
      ip: meta.ip,
      metadata: { nsr, type: input.type, geoStatus: geo.status, origin: base.origin, alerts: alerts.map((a) => a.code) },
    });
    await enqueueEvent(tx, employerId, 'punch.accepted', { punchId: row!.id, nsr, employeeId, type: input.type, serverTime: now.toISOString(), geoStatus: geo.status, alerts: alerts.map((a) => a.code) });

    const [view] = await punchViews(tx, [row!]);
    return { ok: true, result: { punch: view!, receipt: receiptView(rec!), replayed: false } };
  }

  private async uniqueCode(tx: Tx): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = randomCode(12);
      const rows = await tx.execute(sql`select 1 from pn_receipt_by_code(${code})`);
      if (rows.length === 0) return code;
    }
    throw new AppError(500, 'RECEIPT_CODE', 'Não foi possível gerar o código do comprovante.');
  }

  // ───────────── Consultas ─────────────

  async myPunches(scope: EmployeeScope, month: string) {
    const { employerId, employeeId, timezone } = scope.membership;
    const { from, to } = monthRange(month, timezone);
    return this.tenant.run(employerId, async (tx) => punchViews(tx, await punchesBetween(tx, employeeId, from, to)));
  }

  async receiptFor(employerId: string, punchId: string, employeeId: string | null) {
    return this.tenant.run(employerId, async (tx) => {
      const [p] = await tx.select().from(punchRecords).where(and(eq(punchRecords.id, punchId), eq(punchRecords.employerId, employerId)));
      if (!p || (employeeId && p.employeeId !== employeeId)) throw notFound('Comprovante');
      const [r] = await tx.select().from(receipts).where(eq(receipts.punchRecordId, p.id));
      if (!r) throw notFound('Comprovante');
      return { ...receiptView(r), publicKeyPem: this.signer.publicKeyPem };
    });
  }

  /** Verificação pública: confere hash e assinatura sem expor CPF. */
  async verify(code: string): Promise<ReceiptVerification> {
    const rows = await this.db.execute<{ code: string; payload: ReceiptPayload; hash: string; signature: string; key_id: string; issued_at: Date | string; punch_hash: string }>(
      sql`select * from pn_receipt_by_code(${code.trim().toUpperCase()})`,
    );
    const r = rows[0];
    if (!r) return { valid: false, reason: 'Comprovante não encontrado.', receipt: null };
    const canonical = canonicalJson(r.payload);
    const hashOk = sha256(canonical) === r.hash;
    const sigOk = r.key_id === this.signer.keyId && this.signer.verify(canonical, r.signature);
    const chainOk = r.payload.punchHash === r.punch_hash;
    const valid = hashOk && sigOk && chainOk;
    return {
      valid,
      reason: valid
        ? 'Comprovante íntegro: conteúdo, assinatura e vínculo com o registro original conferem.'
        : !hashOk
          ? 'Conteúdo do comprovante foi alterado.'
          : !sigOk
            ? 'Assinatura não confere com a chave atual do sistema.'
            : 'Comprovante não corresponde ao registro original.',
      receipt: {
        code: r.code,
        issuedAt: new Date(r.issued_at).toISOString(),
        hash: r.hash,
        keyId: r.key_id,
        nsr: r.payload.nsr,
        punchType: r.payload.punchType,
        localTime: r.payload.localTime,
        employerName: r.payload.employer.name,
      },
    };
  }

  // ───────────── Integridade da cadeia ─────────────

  async verifyChain(employerId: string) {
    return this.tenant.run(employerId, async (tx) => {
      let prev = 'GENESIS';
      let checked = 0;
      let lastNsr = 0;
      for (;;) {
        const batch = await tx.select().from(punchRecords).where(and(eq(punchRecords.employerId, employerId), sql`${punchRecords.nsr} > ${lastNsr}`)).orderBy(asc(punchRecords.nsr)).limit(500);
        if (!batch.length) break;
        for (const p of batch) {
          const ok = p.nsr === lastNsr + 1 && p.prevHash === prev && p.hash === chainHash(prev, punchHashBody(p));
          if (!ok) return { valid: false, checked, firstBrokenNsr: p.nsr };
          if (p.lat !== null && p.geoDigest !== geoDigestOf(p.lat, p.lng, p.accuracyM)) return { valid: false, checked, firstBrokenNsr: p.nsr };
          prev = p.hash;
          lastNsr = p.nsr;
          checked++;
        }
      }
      const [counter] = await tx.select().from(employerCounters).where(eq(employerCounters.employerId, employerId));
      const tailOk = (counter?.lastPunchHash ?? 'GENESIS') === prev && (counter?.lastNsr ?? 0) === lastNsr;
      return { valid: tailOk, checked, firstBrokenNsr: tailOk ? null : lastNsr + 1 };
    });
  }

  async recentForEmployer(employerId: string, limit = 10) {
    return this.tenant.run(employerId, async (tx) => {
      const rows = await tx.select().from(punchRecords).where(eq(punchRecords.employerId, employerId)).orderBy(desc(punchRecords.serverTime)).limit(limit);
      return punchViews(tx, rows);
    });
  }
}
