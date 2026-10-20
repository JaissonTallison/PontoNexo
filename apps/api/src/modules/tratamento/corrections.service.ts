import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import {
  CORRECTION_KIND_LABEL,
  localDate,
  type correctionCreateSchema,
  type correctionListQuery,
  type CorrectionView,
  type TreatmentKind,
} from '@pontonexo/shared';
import type { z } from 'zod';
import type { Tx } from '../../db/client.js';
import { correctionReads, correctionRequests, employees, employerCounters, punchRecords, treatments, users } from '../../db/schema.js';
import { PushService } from '../notificacoes/push.service.js';
import { AuditService } from '../../common/audit.service.js';
import type { AuthContext } from '../../common/auth/context.js';
import type { EmployerScope } from '../../common/auth/decorators.js';
import { chainHash } from '../../common/crypto.js';
import { AppError, conflict, forbidden, notFound, unprocessable } from '../../common/errors.js';
import type { RequestMeta } from '../../common/http.js';
import { enqueueEvent } from '../../common/outbox.js';
import { TenantDb } from '../../common/tenant.js';
import { offsetOf, toPage } from '../../common/util.js';
import { closedMonth } from './timesheet.service.js';

type RequestRow = typeof correctionRequests.$inferSelect;

interface NewTreatment {
  kind: TreatmentKind;
  punchRecordId?: string | null;
  punchType?: RequestRow['proposedType'];
  effectiveTime?: Date | null;
  absenceDate?: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}

/**
 * Correções nunca alteram a marcação original: geram tratamentos (inclusão, desconsideração, abono).
 * Regra das duas partes: quem pede não decide. Pedido do funcionário é decidido pelo empregador;
 * proposta do empregador precisa da concordância do funcionário.
 */
@Injectable()
export class CorrectionsService {
  constructor(
    private readonly tenant: TenantDb,
    private readonly audit: AuditService,
    private readonly push: PushService,
  ) {}

  /** Funcionário abriu "Meus pedidos": as decisões passam a contar como vistas (sino). */
  async markSeen(scope: EmployerScope) {
    const { employerId, employeeId } = scope.membership;
    if (!employeeId) return;
    await this.tenant.run(employerId, async (tx) => {
      const decided = await tx
        .select({ id: correctionRequests.id })
        .from(correctionRequests)
        .where(and(eq(correctionRequests.employeeId, employeeId), eq(correctionRequests.initiatedBy, 'employee'), inArray(correctionRequests.status, ['approved', 'rejected'])));
      if (decided.length) await tx.insert(correctionReads).values(decided.map((d) => ({ employerId, correctionRequestId: d.id, userId: scope.userId }))).onConflictDoNothing();
    });
  }

  /** Avisos no celular do funcionário; falha de envio nunca desfaz a operação. */
  private notify(employerId: string, employeeId: string, title: string, body: string) {
    void this.push.sendToEmployee(employerId, employeeId, { title, body, url: '/app/correcoes', tag: 'pedidos' }).catch(() => 0);
  }

  private async views(tx: Tx, rows: RequestRow[], auth: AuthContext): Promise<CorrectionView[]> {
    if (!rows.length) return [];
    const userIds = [...new Set(rows.flatMap((r) => [r.requestedByUserId, r.decidedByUserId].filter((x): x is string => Boolean(x))))];
    const names = await tx.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds));
    const emps = await tx.select({ id: employees.id, fullName: employees.fullName }).from(employees).where(inArray(employees.id, [...new Set(rows.map((r) => r.employeeId))]));
    const targetIds = rows.map((r) => r.targetPunchId).filter((x): x is string => Boolean(x));
    const targets = targetIds.length ? await tx.select().from(punchRecords).where(inArray(punchRecords.id, targetIds)) : [];
    const nameOf = (id: string | null) => names.find((n) => n.id === id)?.name ?? null;
    return rows.map((r) => {
      const t = targets.find((p) => p.id === r.targetPunchId);
      return {
        id: r.id,
        kind: r.kind,
        status: r.status,
        employeeId: r.employeeId,
        employeeName: emps.find((e) => e.id === r.employeeId)?.fullName ?? '',
        initiatedBy: r.initiatedBy,
        requestedByName: nameOf(r.requestedByUserId) ?? '',
        requestedAt: r.createdAt.toISOString(),
        reason: r.reason,
        targetPunch: t ? { id: t.id, nsr: t.nsr, type: t.type, serverTime: t.serverTime.toISOString() } : null,
        proposedType: r.proposedType,
        proposedTime: r.proposedTime?.toISOString() ?? null,
        absenceDate: r.absenceDate,
        decidedByName: nameOf(r.decidedByUserId),
        decidedAt: r.decidedAt?.toISOString() ?? null,
        decisionReason: r.decisionReason,
        canDecide: r.status === 'pending' && this.canDecide(r, auth),
      };
    });
  }

  private canDecide(r: RequestRow, auth: AuthContext): boolean {
    if (r.requestedByUserId === auth.userId || !auth.membership) return false;
    if (r.initiatedBy === 'employee') return auth.permissions.has('corrections.decide');
    return auth.membership.role === 'employee' && auth.membership.employeeId === r.employeeId;
  }

  async list(scope: EmployerScope, q: z.infer<typeof correctionListQuery>, onlyEmployeeId: string | null) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const conds = [eq(correctionRequests.employerId, employerId)];
      const employeeId = onlyEmployeeId ?? q.employeeId;
      if (employeeId) conds.push(eq(correctionRequests.employeeId, employeeId));
      if (q.status !== 'all') conds.push(eq(correctionRequests.status, q.status));
      const where = and(...conds);
      const [{ total } = { total: 0 }] = await tx.select({ total: count() }).from(correctionRequests).where(where);
      const rows = await tx.select().from(correctionRequests).where(where).orderBy(desc(correctionRequests.createdAt)).limit(q.pageSize).offset(offsetOf(q));
      return toPage(await this.views(tx, rows, scope), total, q);
    });
  }

  async create(scope: EmployerScope, input: z.infer<typeof correctionCreateSchema>, meta: RequestMeta) {
    const { employerId, timezone, role } = scope.membership;
    const fromEmployee = role === 'employee';
    if (!fromEmployee && !scope.permissions.has('corrections.propose')) throw forbidden();
    const employeeId = fromEmployee ? scope.membership.employeeId : input.employeeId;
    if (!employeeId) throw unprocessable('VALIDATION', 'Escolha o funcionário.', { employeeId: 'Obrigatório.' });

    return this.tenant.run(employerId, async (tx) => {
      const [emp] = await tx.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.employerId, employerId)));
      if (!emp) throw notFound('Funcionário');
      let target: typeof punchRecords.$inferSelect | undefined;
      if (input.targetPunchId) {
        [target] = await tx.select().from(punchRecords).where(and(eq(punchRecords.id, input.targetPunchId), eq(punchRecords.employeeId, employeeId)));
        if (!target) throw unprocessable('TARGET', 'Marcação não encontrada para este funcionário.', { targetPunchId: 'Marcação inválida.' });
        const [dis] = await tx.select({ id: treatments.id }).from(treatments).where(and(eq(treatments.kind, 'disregard'), eq(treatments.punchRecordId, target.id)));
        if (dis) throw conflict('ALREADY_DISREGARDED', 'Esta marcação já foi desconsiderada.');
      }
      const proposedTime = input.proposedTime ? new Date(input.proposedTime) : null;
      if (proposedTime && proposedTime.getTime() > Date.now()) throw unprocessable('FUTURE', 'O horário proposto não pode estar no futuro.', { proposedTime: 'Horário no futuro.' });
      const affected = this.affectedDates(input.absenceDate ?? null, proposedTime, target?.serverTime ?? null, timezone);
      for (const d of affected) await this.assertOpenMonth(tx, employeeId, d);

      const [dup] = await tx
        .select({ id: correctionRequests.id })
        .from(correctionRequests)
        .where(and(eq(correctionRequests.employeeId, employeeId), eq(correctionRequests.status, 'pending'), input.targetPunchId ? eq(correctionRequests.targetPunchId, input.targetPunchId) : eq(correctionRequests.kind, input.kind), ...(input.absenceDate ? [eq(correctionRequests.absenceDate, input.absenceDate)] : [])));
      if (dup && (input.targetPunchId || input.absenceDate)) throw conflict('DUPLICATE_REQUEST', 'Já existe uma solicitação pendente para este item.');

      const [req] = await tx
        .insert(correctionRequests)
        .values({
          employerId,
          employeeId,
          kind: input.kind,
          initiatedBy: fromEmployee ? 'employee' : 'employer',
          requestedByUserId: scope.userId,
          targetPunchId: input.targetPunchId ?? null,
          proposedType: input.kind === 'replace_time' ? (target?.type ?? null) : (input.proposedType ?? null),
          proposedTime,
          absenceDate: input.absenceDate ?? null,
          reason: input.reason,
        })
        .returning();
      await this.audit.record(tx, {
        employerId,
        category: 'data',
        action: 'correction.requested',
        actorUserId: scope.userId,
        entityType: 'correction_request',
        entityId: req!.id,
        summary: `${fromEmployee ? 'Funcionário solicitou' : 'Empregador propôs'}: ${CORRECTION_KIND_LABEL[input.kind]}`,
        ip: meta.ip,
        metadata: { kind: input.kind, employeeId, targetNsr: target?.nsr ?? null },
      });
      const [view] = await this.views(tx, [req!], scope);
      return view!;
    }).then((view) => {
      if (!fromEmployee) this.notify(employerId, employeeId, 'Seu empregador pediu um ajuste', 'Toque para ver e responder se concorda.');
      return view;
    });
  }

  private affectedDates(absence: string | null, proposed: Date | null, target: Date | null, tz: string): string[] {
    const out = new Set<string>();
    if (absence) out.add(absence);
    if (proposed) out.add(localDate(proposed, tz));
    if (target) out.add(localDate(target, tz));
    return [...out];
  }

  private async assertOpenMonth(tx: Tx, employeeId: string, date: string) {
    if (await closedMonth(tx, employeeId, date.slice(0, 7))) {
      throw conflict('MONTH_CLOSED', `O mês ${date.slice(5, 7)}/${date.slice(0, 4)} está fechado. O titular precisa reabri-lo antes do ajuste.`);
    }
  }

  async decide(scope: EmployerScope, id: string, decision: 'approve' | 'reject', reason: string, meta: RequestMeta) {
    const { employerId, timezone } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const [req] = await tx.select().from(correctionRequests).where(and(eq(correctionRequests.id, id), eq(correctionRequests.employerId, employerId))).for('update');
      if (!req) throw notFound('Solicitação');
      if (req.status !== 'pending') throw conflict('ALREADY_DECIDED', 'Esta solicitação já foi decidida.');
      if (req.requestedByUserId === scope.userId) throw forbidden('Quem fez a solicitação não pode decidi-la.');
      if (!this.canDecide(req, scope)) {
        throw forbidden(req.initiatedBy === 'employee' ? 'Somente o empregador ou gestor pode decidir.' : 'Somente o funcionário pode responder a esta proposta.');
      }

      let created: string[] = [];
      if (decision === 'approve') {
        const target = req.targetPunchId ? (await tx.select().from(punchRecords).where(eq(punchRecords.id, req.targetPunchId)))[0] : undefined;
        for (const d of this.affectedDates(req.absenceDate, req.proposedTime, target?.serverTime ?? null, timezone)) await this.assertOpenMonth(tx, req.employeeId, d);
        created = await this.applyTreatments(tx, req, target, scope.userId, reason);
      }
      await tx
        .update(correctionRequests)
        .set({ status: decision === 'approve' ? 'approved' : 'rejected', decidedByUserId: scope.userId, decidedAt: new Date(), decisionReason: reason })
        .where(eq(correctionRequests.id, id));
      await this.audit.record(tx, {
        employerId,
        category: 'privileged',
        action: decision === 'approve' ? 'correction.approved' : 'correction.rejected',
        actorUserId: scope.userId,
        entityType: 'correction_request',
        entityId: id,
        summary: `${CORRECTION_KIND_LABEL[req.kind]} ${decision === 'approve' ? 'aprovada' : 'recusada'}`,
        ip: meta.ip,
        metadata: { treatments: created },
      });
      for (const tId of created) await enqueueEvent(tx, employerId, 'treatment.created', { treatmentId: tId, correctionRequestId: id, employeeId: req.employeeId, kind: req.kind });
      const [row] = await tx.select().from(correctionRequests).where(eq(correctionRequests.id, id));
      const [view] = await this.views(tx, [row!], scope);
      return view!;
    }).then((view) => {
      if (view.initiatedBy === 'employee') {
        this.notify(employerId, view.employeeId, decision === 'approve' ? 'Seu pedido foi aprovado' : 'Seu pedido foi recusado', 'Toque para ver a resposta do empregador.');
      }
      return view;
    });
  }

  private async applyTreatments(tx: Tx, req: RequestRow, target: typeof punchRecords.$inferSelect | undefined, deciderId: string, decisionReason: string): Promise<string[]> {
    const items: NewTreatment[] = [];
    const targetSnapshot = target ? { nsr: target.nsr, type: target.type, serverTime: target.serverTime.toISOString() } : null;
    switch (req.kind) {
      case 'include_punch':
        items.push({ kind: 'inclusion', punchType: req.proposedType, effectiveTime: req.proposedTime, previousValue: null, newValue: { type: req.proposedType, time: req.proposedTime?.toISOString() } });
        break;
      case 'disregard_punch':
        if (!target) throw new AppError(409, 'TARGET', 'Marcação alvo não encontrada.');
        items.push({ kind: 'disregard', punchRecordId: target.id, previousValue: targetSnapshot, newValue: { disregarded: true } });
        break;
      case 'replace_time':
        if (!target || !req.proposedTime) throw new AppError(409, 'TARGET', 'Marcação alvo não encontrada.');
        items.push({ kind: 'disregard', punchRecordId: target.id, previousValue: targetSnapshot, newValue: { replacedBy: req.proposedTime.toISOString() } });
        items.push({ kind: 'inclusion', punchType: target.type, effectiveTime: req.proposedTime, previousValue: targetSnapshot, newValue: { type: target.type, time: req.proposedTime.toISOString() } });
        break;
      case 'justify_absence':
        items.push({ kind: 'absence_justification', absenceDate: req.absenceDate, previousValue: { status: 'ausência' }, newValue: { status: 'abonada' } });
        break;
    }
    const [counter] = await tx.select().from(employerCounters).where(eq(employerCounters.employerId, req.employerId)).for('update');
    let prev = counter!.lastTreatmentHash;
    const ids: string[] = [];
    for (const item of items) {
      const id = randomUUID();
      const createdAt = new Date();
      const reason = `${req.reason} — Decisão: ${decisionReason}`;
      const body = {
        id,
        employerId: req.employerId,
        employeeId: req.employeeId,
        correctionRequestId: req.id,
        kind: item.kind,
        punchRecordId: item.punchRecordId ?? null,
        punchType: item.punchType ?? null,
        effectiveTime: item.effectiveTime?.toISOString() ?? null,
        absenceDate: item.absenceDate ?? null,
        previousValue: item.previousValue,
        newValue: item.newValue,
        reason,
        createdByUserId: deciderId,
        createdAt: createdAt.toISOString(),
      };
      const hash = chainHash(prev, body);
      await tx.insert(treatments).values({
        id,
        employerId: req.employerId,
        employeeId: req.employeeId,
        correctionRequestId: req.id,
        kind: item.kind,
        punchRecordId: item.punchRecordId ?? null,
        punchType: item.punchType ?? null,
        effectiveTime: item.effectiveTime ?? null,
        absenceDate: item.absenceDate ?? null,
        previousValue: item.previousValue,
        newValue: item.newValue,
        reason,
        createdByUserId: deciderId,
        createdAt,
        prevHash: prev,
        hash,
      });
      prev = hash;
      ids.push(id);
    }
    await tx.update(employerCounters).set({ lastTreatmentHash: prev }).where(eq(employerCounters.employerId, req.employerId));
    return ids;
  }

  async cancel(scope: EmployerScope, id: string, meta: RequestMeta) {
    const { employerId } = scope.membership;
    await this.tenant.run(employerId, async (tx) => {
      const [req] = await tx.select().from(correctionRequests).where(and(eq(correctionRequests.id, id), eq(correctionRequests.employerId, employerId)));
      if (!req) throw notFound('Solicitação');
      if (req.requestedByUserId !== scope.userId) throw forbidden('Só quem fez a solicitação pode cancelá-la.');
      if (req.status !== 'pending') throw conflict('ALREADY_DECIDED', 'Esta solicitação já foi decidida.');
      await tx.update(correctionRequests).set({ status: 'cancelled', decidedAt: new Date(), decisionReason: 'Cancelada pelo solicitante' }).where(eq(correctionRequests.id, id));
      await this.audit.record(tx, { employerId, category: 'data', action: 'correction.cancelled', actorUserId: scope.userId, entityType: 'correction_request', entityId: id, summary: 'Solicitação cancelada pelo solicitante', ip: meta.ip });
    });
  }
}
