import { Injectable } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';
import { localDate, monthDays, type ClosingBatchResult, type MonthSummaryRow, type MonthSummaryView } from '@pontonexo/shared';
import { closingAcknowledgements, correctionRequests, employees, employmentContracts, monthlyClosings } from '../../db/schema.js';
import { gte, isNull, lte, or } from 'drizzle-orm';
import { AppError } from '../../common/errors.js';
import { AuditService } from '../../common/audit.service.js';
import type { EmployeeScope, EmployerScope } from '../../common/auth/decorators.js';
import { canonicalJson, sha256 } from '../../common/crypto.js';
import { conflict, notFound } from '../../common/errors.js';
import type { RequestMeta } from '../../common/http.js';
import { enqueueEvent } from '../../common/outbox.js';
import { TenantDb } from '../../common/tenant.js';
import { closedMonth, closingView, TimesheetService } from './timesheet.service.js';

@Injectable()
export class ClosingsService {
  constructor(
    private readonly tenant: TenantDb,
    private readonly audit: AuditService,
    private readonly timesheets: TimesheetService,
  ) {}

  async list(scope: EmployerScope, month: string | null, employeeId: string | null) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const conds = [eq(monthlyClosings.employerId, employerId)];
      if (month) conds.push(eq(monthlyClosings.month, month));
      if (employeeId) conds.push(eq(monthlyClosings.employeeId, employeeId));
      const rows = await tx.select().from(monthlyClosings).where(and(...conds)).orderBy(desc(monthlyClosings.closedAt)).limit(200);
      const out = [];
      for (const r of rows) out.push(await closingView(tx, r));
      return out;
    });
  }

  /** Funcionários com contrato em algum dia do mês. */
  private async employeesInMonth(tx: Parameters<Parameters<TenantDb['run']>[1]>[0], employerId: string, month: string) {
    const days = monthDays(month);
    const first = days[0]!;
    const last = days[days.length - 1]!;
    const rows = await tx
      .selectDistinct({ id: employees.id, fullName: employees.fullName })
      .from(employees)
      .innerJoin(employmentContracts, eq(employmentContracts.employeeId, employees.id))
      .where(and(eq(employees.employerId, employerId), lte(employmentContracts.startDate, last), or(isNull(employmentContracts.endDate), gte(employmentContracts.endDate, first))));
    return rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  /** Resumo do mês de todos os funcionários (para o fechamento e o contador). */
  async summary(scope: EmployerScope, month: string): Promise<MonthSummaryView> {
    const { employerId, timezone } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const rows: MonthSummaryRow[] = [];
      for (const e of await this.employeesInMonth(tx, employerId, month)) {
        const t = await this.timesheets.compute(tx, employerId, e.id, month);
        const [pending] = await tx.select({ n: count() }).from(correctionRequests).where(and(eq(correctionRequests.employeeId, e.id), eq(correctionRequests.status, 'pending')));
        rows.push({
          employeeId: e.id,
          fullName: e.fullName,
          workedSeconds: t.totals.workedSeconds,
          expectedSeconds: t.totals.expectedSeconds,
          overtimeSeconds: t.totals.overtimeSeconds,
          restOrHolidaySeconds: t.totals.restOrHolidaySeconds,
          deficitSeconds: t.totals.deficitSeconds,
          absences: t.totals.absences,
          nightSeconds: t.totals.nightSeconds,
          paidOvertimeSeconds: t.compensation.paidOvertimeSeconds,
          bankSeconds: t.compensation.bankSeconds,
          daysWithIssues: t.totals.daysWithIssues,
          pendingCorrections: pending?.n ?? 0,
          closing: t.closing ? { id: t.closing.id, status: t.closing.status, acknowledged: Boolean(t.closing.acknowledgedAt) } : null,
        });
      }
      return { month, ended: month < localDate(new Date(), timezone).slice(0, 7), rows };
    });
  }

  /** Fecha o mês de todos os funcionários prontos; informa quem ficou de fora e por quê. */
  async closeAll(scope: EmployerScope, month: string, meta: RequestMeta): Promise<ClosingBatchResult> {
    const s = await this.summary(scope, month);
    if (!s.ended) throw new AppError(409, 'MONTH_NOT_ENDED', 'Só é possível fechar meses já encerrados.');
    let closed = 0;
    const skipped: ClosingBatchResult['skipped'] = [];
    for (const r of s.rows) {
      if (r.closing?.status === 'closed') continue;
      if (r.pendingCorrections) {
        skipped.push({ employeeId: r.employeeId, fullName: r.fullName, reason: r.pendingCorrections === 1 ? 'Há 1 pedido de ajuste para decidir' : `Há ${r.pendingCorrections} pedidos de ajuste para decidir` });
        continue;
      }
      try {
        await this.close(scope, r.employeeId, month, meta);
        closed++;
      } catch (e) {
        skipped.push({ employeeId: r.employeeId, fullName: r.fullName, reason: e instanceof Error ? e.message : 'Não foi possível fechar' });
      }
    }
    return { closed, skipped };
  }

  /** Fotografia do espelho com hash. Só para meses encerrados e sem correções pendentes. */
  async close(scope: EmployerScope, employeeId: string, month: string, meta: RequestMeta) {
    const { employerId, timezone } = scope.membership;
    const currentMonth = localDate(new Date(), timezone).slice(0, 7);
    if (month >= currentMonth) throw conflict('MONTH_NOT_ENDED', 'Só é possível fechar meses já encerrados.');
    return this.tenant.run(employerId, async (tx) => {
      if (await closedMonth(tx, employeeId, month)) throw conflict('ALREADY_CLOSED', 'Este mês já está fechado.');
      const [pending] = await tx.select({ n: count() }).from(correctionRequests).where(and(eq(correctionRequests.employeeId, employeeId), eq(correctionRequests.status, 'pending')));
      if ((pending?.n ?? 0) > 0) throw conflict('PENDING_CORRECTIONS', 'Há solicitações de correção pendentes para este funcionário. Decida-as antes de fechar.');
      const snapshot = await this.timesheets.compute(tx, employerId, employeeId, month);
      const { closing: _ignored, ...frozen } = snapshot;
      const snapshotHash = sha256(canonicalJson(frozen));
      const [row] = await tx.insert(monthlyClosings).values({ employerId, employeeId, month, closedByUserId: scope.userId, snapshot: frozen, snapshotHash }).returning();
      await this.audit.record(tx, {
        employerId,
        category: 'privileged',
        action: 'closing.closed',
        actorUserId: scope.userId,
        entityType: 'monthly_closing',
        entityId: row!.id,
        summary: `Mês ${month} fechado`,
        ip: meta.ip,
        metadata: { employeeId, month, snapshotHash },
      });
      await enqueueEvent(tx, employerId, 'closing.closed', { closingId: row!.id, employeeId, month, snapshotHash });
      return closingView(tx, row!);
    });
  }

  async reopen(scope: EmployerScope, id: string, reason: string, meta: RequestMeta) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const [row] = await tx.select().from(monthlyClosings).where(and(eq(monthlyClosings.id, id), eq(monthlyClosings.employerId, employerId)));
      if (!row) throw notFound('Fechamento');
      if (row.status !== 'closed') throw conflict('NOT_CLOSED', 'Este fechamento já foi reaberto.');
      const [updated] = await tx.update(monthlyClosings).set({ status: 'reopened', reopenedAt: new Date(), reopenedByUserId: scope.userId, reopenReason: reason }).where(eq(monthlyClosings.id, id)).returning();
      await this.audit.record(tx, { employerId, category: 'privileged', action: 'closing.reopened', actorUserId: scope.userId, entityType: 'monthly_closing', entityId: id, summary: `Mês ${row.month} reaberto`, ip: meta.ip, metadata: { reason } });
      return closingView(tx, updated!);
    });
  }

  async snapshot(scope: EmployerScope, id: string) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const [row] = await tx.select().from(monthlyClosings).where(and(eq(monthlyClosings.id, id), eq(monthlyClosings.employerId, employerId)));
      if (!row) throw notFound('Fechamento');
      if (scope.membership.role === 'employee' && row.employeeId !== scope.membership.employeeId) throw notFound('Fechamento');
      const recomputed = sha256(canonicalJson(row.snapshot));
      return { closing: await closingView(tx, row), snapshot: row.snapshot, integrity: recomputed === row.snapshotHash };
    });
  }

  async mine(scope: EmployeeScope) {
    const { employerId, employeeId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const rows = await tx.select().from(monthlyClosings).where(eq(monthlyClosings.employeeId, employeeId)).orderBy(desc(monthlyClosings.closedAt));
      const out = [];
      for (const r of rows) out.push(await closingView(tx, r));
      return out;
    });
  }

  async acknowledge(scope: EmployeeScope, id: string, agree: boolean, note: string | null, meta: RequestMeta) {
    const { employerId, employeeId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const [row] = await tx.select().from(monthlyClosings).where(and(eq(monthlyClosings.id, id), eq(monthlyClosings.employeeId, employeeId)));
      if (!row) throw notFound('Fechamento');
      if (row.status !== 'closed') throw conflict('NOT_CLOSED', 'Este fechamento foi reaberto; aguarde o novo fechamento.');
      const [exists] = await tx.select({ id: closingAcknowledgements.id }).from(closingAcknowledgements).where(eq(closingAcknowledgements.closingId, id));
      if (exists) throw conflict('ALREADY_ACKNOWLEDGED', 'Ciência já registrada.');
      await tx.insert(closingAcknowledgements).values({ employerId, closingId: id, employeeId, agree, note });
      await this.audit.record(tx, {
        employerId,
        category: 'data',
        action: agree ? 'closing.acknowledged' : 'closing.contested',
        actorUserId: scope.userId,
        entityType: 'monthly_closing',
        entityId: id,
        summary: agree ? `Funcionário registrou ciência do mês ${row.month}` : `Funcionário contestou o mês ${row.month}`,
        ip: meta.ip,
      });
      return closingView(tx, row);
    });
  }
}
