import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, lt, ne } from 'drizzle-orm';
import {
  calculatePeriod,
  DEFAULT_RULES,
  effectivePunches,
  localDate,
  resolveExpectedDay,
  type DashboardBadges,
  type DashboardTodayRow,
  addDays,
  localToInstant,
  PRIVACY_NOTICE,
  PRIVACY_NOTICE_VERSION,
  type auditListQuery,
  type AuditEventView,
  type DashboardView,
  type dataRequestCreateSchema,
  type DataRequestView,
  type incidentCreateSchema,
  type incidentListQuery,
  type IncidentView,
  type RetentionPolicyView,
} from '@pontonexo/shared';
import type { z } from 'zod';
import type { Tx } from '../../db/client.js';
import {
  auditEvents,
  correctionRequests,
  dataSubjectRequests,
  employees,
  employers,
  incidents,
  incidentUpdates,
  punchRecords,
  treatments,
  privacyAcknowledgements,
  punchAlerts,
  retentionPolicies,
  users,
  workSessions,
} from '../../db/schema.js';
import { AuditService } from '../../common/audit.service.js';
import type { EmployeeScope, EmployerScope } from '../../common/auth/decorators.js';
import { conflict, notFound } from '../../common/errors.js';
import type { RequestMeta } from '../../common/http.js';
import { TenantDb } from '../../common/tenant.js';
import { offsetOf, toPage } from '../../common/util.js';
import { loadHolidays, loadScheduleContext } from '../escalas/schedules.service.js';
import { PunchService } from '../registrador/punch.service.js';
import { TimeService } from '../time/time.service.js';

const DSR_DAYS = 15; // LGPD, art. 19, II

async function names(tx: Tx, ids: Array<string | null>) {
  const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!list.length) return new Map<string, string>();
  const rows = await tx.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, list));
  return new Map(rows.map((r) => [r.id, r.name]));
}

@Injectable()
export class GovernanceService {
  constructor(
    private readonly tenant: TenantDb,
    private readonly audit: AuditService,
    private readonly punches: PunchService,
    private readonly time: TimeService,
  ) {}

  // ───── Auditoria ─────

  async auditList(scope: EmployerScope, q: z.infer<typeof auditListQuery>) {
    const { employerId, timezone } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const conds = [eq(auditEvents.employerId, employerId)];
      if (q.category !== 'all') conds.push(eq(auditEvents.category, q.category));
      if (q.action) conds.push(eq(auditEvents.action, q.action));
      if (q.from) conds.push(gte(auditEvents.createdAt, localToInstant(q.from, '00:00', timezone)));
      if (q.to) conds.push(lt(auditEvents.createdAt, localToInstant(addDays(q.to, 1), '00:00', timezone)));
      const where = and(...conds);
      const [{ total } = { total: 0 }] = await tx.select({ total: count() }).from(auditEvents).where(where);
      const rows = await tx.select().from(auditEvents).where(where).orderBy(desc(auditEvents.seq)).limit(q.pageSize).offset(offsetOf(q));
      const n = await names(tx, rows.map((r) => r.actorUserId));
      const items: AuditEventView[] = rows.map((r) => ({
        id: r.id,
        seq: r.seq,
        createdAt: r.createdAt.toISOString(),
        category: r.category,
        action: r.action,
        actorName: r.actorUserId ? (n.get(r.actorUserId) ?? null) : null,
        entityType: r.entityType,
        entityId: r.entityId,
        summary: r.summary,
        hash: r.hash,
      }));
      return toPage(items, total, q);
    });
  }

  async verifyIntegrity(scope: EmployerScope) {
    const { employerId } = scope.membership;
    const auditChain = await this.tenant.run(employerId, (tx) => this.audit.verify(tx, employerId));
    const punchChain = await this.punches.verifyChain(employerId);
    await this.tenant.run(employerId, (tx) =>
      this.audit.record(tx, { employerId, category: 'system', action: 'integrity.verified', actorUserId: scope.userId, summary: `Verificação de integridade: auditoria ${auditChain.valid ? 'íntegra' : 'com quebra'}, marcações ${punchChain.valid ? 'íntegras' : 'com quebra'}` }),
    );
    return { audit: auditChain, punches: punchChain };
  }

  // ───── Incidentes ─────

  private async incidentView(tx: Tx, i: typeof incidents.$inferSelect): Promise<IncidentView> {
    const ups = await tx.select().from(incidentUpdates).where(eq(incidentUpdates.incidentId, i.id)).orderBy(incidentUpdates.createdAt);
    const n = await names(tx, [i.createdByUserId, ...ups.map((u) => u.authorUserId)]);
    return {
      id: i.id,
      kind: i.kind,
      severity: i.severity,
      status: i.status,
      title: i.title,
      description: i.description,
      personalDataAffected: i.personalDataAffected,
      source: i.source,
      detectedAt: i.detectedAt.toISOString(),
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
      createdByName: i.createdByUserId ? (n.get(i.createdByUserId) ?? null) : null,
      updates: ups.map((u) => ({ id: u.id, status: u.status, note: u.note, createdAt: u.createdAt.toISOString(), authorName: u.authorUserId ? (n.get(u.authorUserId) ?? null) : null })),
    };
  }

  async incidentList(scope: EmployerScope, q: z.infer<typeof incidentListQuery>) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const conds = [eq(incidents.employerId, employerId)];
      if (q.status !== 'all') conds.push(eq(incidents.status, q.status));
      const where = and(...conds);
      const [{ total } = { total: 0 }] = await tx.select({ total: count() }).from(incidents).where(where);
      const rows = await tx.select().from(incidents).where(where).orderBy(desc(incidents.detectedAt)).limit(q.pageSize).offset(offsetOf(q));
      const items = [];
      for (const r of rows) items.push(await this.incidentView(tx, r));
      return toPage(items, total, q);
    });
  }

  async incidentCreate(scope: EmployerScope, input: z.infer<typeof incidentCreateSchema>, meta: RequestMeta) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const [i] = await tx.insert(incidents).values({ employerId, ...input, source: 'manual', createdByUserId: scope.userId }).returning();
      await tx.insert(incidentUpdates).values({ incidentId: i!.id, employerId, status: 'open', note: 'Incidente registrado.', authorUserId: scope.userId });
      await this.audit.record(tx, { employerId, category: 'security', action: 'incident.opened', actorUserId: scope.userId, entityType: 'incident', entityId: i!.id, summary: `Incidente registrado: ${input.title}`, ip: meta.ip, metadata: { kind: input.kind, severity: input.severity, personalDataAffected: input.personalDataAffected } });
      return this.incidentView(tx, i!);
    });
  }

  async incidentUpdate(scope: EmployerScope, id: string, status: IncidentView['status'], note: string, meta: RequestMeta) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const [i] = await tx.select().from(incidents).where(and(eq(incidents.id, id), eq(incidents.employerId, employerId)));
      if (!i) throw notFound('Incidente');
      if (i.status === 'resolved') throw conflict('INCIDENT_RESOLVED', 'Incidente já resolvido. Registre um novo se o problema voltou.');
      const [updated] = await tx.update(incidents).set({ status, resolvedAt: status === 'resolved' ? new Date() : null }).where(eq(incidents.id, id)).returning();
      await tx.insert(incidentUpdates).values({ incidentId: id, employerId, status, note, authorUserId: scope.userId });
      await this.audit.record(tx, { employerId, category: 'security', action: 'incident.updated', actorUserId: scope.userId, entityType: 'incident', entityId: id, summary: `Incidente atualizado para ${status}`, ip: meta.ip });
      return this.incidentView(tx, updated!);
    });
  }

  // ───── Retenção ─────

  async retention(scope: EmployerScope): Promise<RetentionPolicyView[]> {
    const { employerId } = scope.membership;
    const [coords] = await this.tenant.run(employerId, (tx) => tx.select().from(retentionPolicies).where(and(eq(retentionPolicies.employerId, employerId), eq(retentionPolicies.category, 'punch_coordinates'))));
    return [
      {
        category: 'punch_records',
        retentionDays: 1825,
        action: 'delete',
        legalBasis: 'LC 150/2015, arts. 42 e 43',
        editable: false,
        description: 'Marcações, comprovantes, tratamentos e fechamentos: guarda enquanto não prescreverem (5 anos, até 2 anos após o fim do contrato). Eliminação após o prazo é procedimento manual documentado (docs/03-lgpd.md).',
      },
      {
        category: 'punch_coordinates',
        retentionDays: coords?.retentionDays ?? 395,
        action: 'anonymize',
        legalBasis: 'LGPD, art. 6º, III (necessidade) e art. 16',
        editable: true,
        description: 'Coordenadas e precisão do GPS são apagadas após o prazo; ficam o resultado (dentro/fora do raio), a distância e o resumo criptográfico que mantém a cadeia verificável.',
      },
      {
        category: 'audit_events',
        retentionDays: 1825,
        action: 'delete',
        legalBasis: 'LC 150/2015, art. 42; LGPD, art. 37',
        editable: false,
        description: 'Trilha de auditoria encadeada, mesmo prazo dos registros que documenta.',
      },
      {
        category: 'sessions',
        retentionDays: 180,
        action: 'delete',
        legalBasis: 'Marco Civil da Internet (Lei 12.965/2014), art. 15',
        editable: false,
        description: 'Sessões encerradas (IP e navegador) são apagadas 6 meses após o fim.',
      },
      {
        category: 'password_resets',
        retentionDays: 7,
        action: 'delete',
        legalBasis: 'LGPD, art. 6º, III',
        editable: false,
        description: 'Links de redefinição de senha vencidos.',
      },
    ];
  }

  async updateRetention(scope: EmployerScope, days: number, meta: RequestMeta) {
    const { employerId } = scope.membership;
    await this.tenant.run(employerId, async (tx) => {
      await tx
        .insert(retentionPolicies)
        .values({ employerId, category: 'punch_coordinates', retentionDays: days, updatedByUserId: scope.userId })
        .onConflictDoUpdate({ target: [retentionPolicies.employerId, retentionPolicies.category], set: { retentionDays: days, updatedAt: new Date(), updatedByUserId: scope.userId } });
      await this.audit.record(tx, { employerId, category: 'privileged', action: 'retention.updated', actorUserId: scope.userId, summary: `Retenção de coordenadas ajustada para ${days} dias`, ip: meta.ip, metadata: { days } });
    });
    return this.retention(scope);
  }

  // ───── LGPD: aviso e direitos do titular ─────

  privacyNotice() {
    return { version: PRIVACY_NOTICE_VERSION, sections: PRIVACY_NOTICE };
  }

  async acknowledgePrivacy(scope: EmployerScope, meta: RequestMeta) {
    const { employerId } = scope.membership;
    await this.tenant.run(employerId, async (tx) => {
      await tx.insert(privacyAcknowledgements).values({ userId: scope.userId, employerId, version: PRIVACY_NOTICE_VERSION }).onConflictDoNothing();
      await this.audit.record(tx, { employerId, category: 'data', action: 'privacy.acknowledged', actorUserId: scope.userId, summary: `Ciência do aviso de privacidade (versão ${PRIVACY_NOTICE_VERSION})`, ip: meta.ip });
    });
  }

  private async dsrViews(tx: Tx, rows: Array<typeof dataSubjectRequests.$inferSelect>): Promise<DataRequestView[]> {
    const n = await names(tx, rows.map((r) => r.requesterUserId));
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      details: r.details,
      requesterName: n.get(r.requesterUserId) ?? '',
      createdAt: r.createdAt.toISOString(),
      dueAt: r.dueAt.toISOString(),
      respondedAt: r.respondedAt?.toISOString() ?? null,
      response: r.response,
    }));
  }

  async dataRequestCreate(scope: EmployeeScope, input: z.infer<typeof dataRequestCreateSchema>, meta: RequestMeta) {
    const { employerId, employeeId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const [r] = await tx
        .insert(dataSubjectRequests)
        .values({ employerId, employeeId, requesterUserId: scope.userId, kind: input.kind, details: input.details, dueAt: new Date(Date.now() + DSR_DAYS * 86_400_000) })
        .returning();
      await this.audit.record(tx, { employerId, category: 'data', action: 'dsr.created', actorUserId: scope.userId, entityType: 'data_subject_request', entityId: r!.id, summary: `Pedido do titular registrado (${input.kind})`, ip: meta.ip });
      return (await this.dsrViews(tx, [r!]))[0]!;
    });
  }

  async dataRequestList(scope: EmployerScope, onlyEmployeeId: string | null) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const conds = [eq(dataSubjectRequests.employerId, employerId)];
      if (onlyEmployeeId) conds.push(eq(dataSubjectRequests.employeeId, onlyEmployeeId));
      const rows = await tx.select().from(dataSubjectRequests).where(and(...conds)).orderBy(desc(dataSubjectRequests.createdAt)).limit(200);
      return this.dsrViews(tx, rows);
    });
  }

  async dataRequestRespond(scope: EmployerScope, id: string, status: 'answered' | 'denied', response: string, meta: RequestMeta) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const [r] = await tx.select().from(dataSubjectRequests).where(and(eq(dataSubjectRequests.id, id), eq(dataSubjectRequests.employerId, employerId)));
      if (!r) throw notFound('Pedido');
      if (r.status !== 'open') throw conflict('ALREADY_ANSWERED', 'Pedido já respondido.');
      const [u] = await tx.update(dataSubjectRequests).set({ status, response, respondedAt: new Date(), respondedByUserId: scope.userId }).where(eq(dataSubjectRequests.id, id)).returning();
      await this.audit.record(tx, { employerId, category: 'privileged', action: 'dsr.responded', actorUserId: scope.userId, entityType: 'data_subject_request', entityId: id, summary: `Pedido do titular ${status === 'answered' ? 'atendido' : 'negado com justificativa'}`, ip: meta.ip });
      return (await this.dsrViews(tx, [u!]))[0]!;
    });
  }

  // ───── Painel ─────

  /** Números do sino da barra superior (consulta leve, chamada a cada troca de tela). */
  async badges(scope: EmployerScope): Promise<DashboardBadges> {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const one = async (q: Promise<Array<{ n: number }>>) => (await q)[0]?.n ?? 0;
      return {
        pendingCorrections: await one(tx.select({ n: count() }).from(correctionRequests).where(and(eq(correctionRequests.employerId, employerId), eq(correctionRequests.status, 'pending'), eq(correctionRequests.initiatedBy, 'employee')))),
        openAlerts: await one(tx.select({ n: count() }).from(punchAlerts).where(and(eq(punchAlerts.employerId, employerId), eq(punchAlerts.status, 'open')))),
        overdueDataRequests: await one(tx.select({ n: count() }).from(dataSubjectRequests).where(and(eq(dataSubjectRequests.employerId, employerId), eq(dataSubjectRequests.status, 'open'), lt(dataSubjectRequests.dueAt, new Date())))),
        openIncidents: await one(tx.select({ n: count() }).from(incidents).where(and(eq(incidents.employerId, employerId), ne(incidents.status, 'resolved')))),
      };
    });
  }

  /** Situação de hoje de cada funcionário ativo: estado, entrada, horas até agora e ocorrências. */
  private async todayRows(tx: Tx, employerId: string): Promise<{ rows: DashboardTodayRow[]; punchesToday: number }> {
    const [employer] = await tx.select().from(employers).where(eq(employers.id, employerId));
    const tz = employer!.timezone;
    const now = new Date();
    const today = localDate(now, tz);
    const dayStart = localToInstant(today, '00:00', tz);
    const emps = await tx.select({ id: employees.id, fullName: employees.fullName }).from(employees).where(and(eq(employees.employerId, employerId), eq(employees.status, 'active'))).orderBy(employees.fullName);
    const holidays = await loadHolidays(tx, employerId, today, today);
    const rows: DashboardTodayRow[] = [];
    let punchesToday = 0;
    for (const e of emps) {
      const punches = await tx.select().from(punchRecords).where(and(eq(punchRecords.employeeId, e.id), gte(punchRecords.serverTime, new Date(dayStart.getTime() - 86_400_000))));
      const todays = punches.filter((p) => p.serverTime >= dayStart);
      punchesToday += todays.length;
      const tr = await tx.select().from(treatments).where(eq(treatments.employeeId, e.id));
      const dis = new Set(tr.filter((t) => t.kind === 'disregard' && t.punchRecordId).map((t) => t.punchRecordId!));
      const eff = effectivePunches(punches.map((p) => ({ id: p.id, type: p.type, at: p.serverTime })), dis, []);
      const sched = await loadScheduleContext(tx, e.id);
      const expected = resolveExpectedDay(today, sched.assignments, sched.schedules, holidays);
      const day = calculatePeriod({ dates: [today], tz, punches: eff, expected: () => expected, justifiedDates: new Set(), rules: DEFAULT_RULES, now }).days[0]!;
      const [open] = await tx.select({ state: workSessions.state }).from(workSessions).where(and(eq(workSessions.employeeId, e.id), inArray(workSessions.state, ['working', 'on_break'])));
      const alerts = todays.length ? (await tx.select({ n: count() }).from(punchAlerts).where(inArray(punchAlerts.punchRecordId, todays.map((p) => p.id))))[0]?.n ?? 0 : 0;
      const firstIn = todays.find((p) => p.type === 'clock_in')?.serverTime ?? null;
      const state: DashboardTodayRow['state'] = open
        ? (open.state as 'working' | 'on_break')
        : todays.length
          ? 'done'
          : expected.kind === 'workday' && expected.start && now >= localToInstant(today, expected.start, tz)
            ? 'absent'
            : 'off';
      rows.push({
        employeeId: e.id,
        fullName: e.fullName,
        state,
        firstIn: firstIn?.toISOString() ?? null,
        lastPunchAt: todays.at(-1)?.serverTime.toISOString() ?? null,
        workedSeconds: day.workedSeconds,
        expectedSeconds: expected.expectedSeconds,
        alerts,
      });
    }
    return { rows, punchesToday };
  }

  async dashboard(scope: EmployerScope): Promise<DashboardView> {
    const { employerId } = scope.membership;
    const data = await this.tenant.run(employerId, async (tx) => {
      const working = await tx
        .select({ employeeId: workSessions.employeeId, fullName: employees.fullName, state: workSessions.state, since: workSessions.startedAt })
        .from(workSessions)
        .innerJoin(employees, eq(employees.id, workSessions.employeeId))
        .where(and(eq(workSessions.employerId, employerId), inArray(workSessions.state, ['working', 'on_break']), gte(workSessions.startedAt, new Date(Date.now() - 20 * 3600_000))))
        .orderBy(employees.fullName);
      const one = async (q: Promise<Array<{ n: number }>>) => (await q)[0]?.n ?? 0;
      const { rows, punchesToday } = await this.todayRows(tx, employerId);
      return {
        today: rows,
        punchesToday,
        working: working.map((w) => ({ employeeId: w.employeeId, fullName: w.fullName, state: w.state as 'working' | 'on_break', since: w.since.toISOString() })),
        activeEmployees: await one(tx.select({ n: count() }).from(employees).where(and(eq(employees.employerId, employerId), eq(employees.status, 'active')))),
        openAlerts: await one(tx.select({ n: count() }).from(punchAlerts).where(and(eq(punchAlerts.employerId, employerId), eq(punchAlerts.status, 'open')))),
        pendingCorrections: await one(tx.select({ n: count() }).from(correctionRequests).where(and(eq(correctionRequests.employerId, employerId), eq(correctionRequests.status, 'pending'), eq(correctionRequests.initiatedBy, 'employee')))),
        awaitingEmployee: await one(tx.select({ n: count() }).from(correctionRequests).where(and(eq(correctionRequests.employerId, employerId), eq(correctionRequests.status, 'pending'), eq(correctionRequests.initiatedBy, 'employer')))),
        openIncidents: await one(tx.select({ n: count() }).from(incidents).where(and(eq(incidents.employerId, employerId), ne(incidents.status, 'resolved')))),
        openDataRequests: await one(tx.select({ n: count() }).from(dataSubjectRequests).where(and(eq(dataSubjectRequests.employerId, employerId), eq(dataSubjectRequests.status, 'open')))),
      };
    });
    const recent = await this.punches.recentForEmployer(employerId, 8);
    return {
      ...data,
      clockStatus: this.time.status().status,
      recentPunches: recent.map((p) => ({ id: p.id, employeeName: p.employeeName, type: p.type, serverTime: p.serverTime, geoStatus: p.geoStatus, hasAlerts: p.alerts.length > 0 })),
    };
  }
}
