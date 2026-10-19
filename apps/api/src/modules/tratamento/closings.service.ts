import { Injectable } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';
import { localDate } from '@pontonexo/shared';
import { closingAcknowledgements, correctionRequests, monthlyClosings } from '../../db/schema.js';
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
