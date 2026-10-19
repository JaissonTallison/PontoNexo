import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, exists, gte, lt } from 'drizzle-orm';
import { ALERT_LABEL, type alertListQuery, type punchListQuery } from '@pontonexo/shared';
import type { z } from 'zod';
import { employees, punchAlerts, punchRecords } from '../../db/schema.js';
import { AuditService } from '../../common/audit.service.js';
import type { EmployerScope } from '../../common/auth/decorators.js';
import { conflict, notFound } from '../../common/errors.js';
import type { RequestMeta } from '../../common/http.js';
import { TenantDb } from '../../common/tenant.js';
import { offsetOf, toPage } from '../../common/util.js';
import { localToInstant, addDays } from '@pontonexo/shared';
import { punchViews } from './punch-views.js';

@Injectable()
export class PunchAdminService {
  constructor(
    private readonly tenant: TenantDb,
    private readonly audit: AuditService,
  ) {}

  async list(scope: EmployerScope, q: z.infer<typeof punchListQuery>) {
    const { employerId, timezone } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const conds = [eq(punchRecords.employerId, employerId)];
      if (q.employeeId) conds.push(eq(punchRecords.employeeId, q.employeeId));
      if (q.from) conds.push(gte(punchRecords.serverTime, localToInstant(q.from, '00:00', timezone)));
      if (q.to) conds.push(lt(punchRecords.serverTime, localToInstant(addDays(q.to, 1), '00:00', timezone)));
      if (q.withAlerts === 'only') conds.push(exists(tx.select({ x: punchAlerts.id }).from(punchAlerts).where(eq(punchAlerts.punchRecordId, punchRecords.id))));
      const where = and(...conds);
      const [{ total } = { total: 0 }] = await tx.select({ total: count() }).from(punchRecords).where(where);
      const rows = await tx.select().from(punchRecords).where(where).orderBy(desc(punchRecords.serverTime)).limit(q.pageSize).offset(offsetOf(q));
      return toPage(await punchViews(tx, rows), total, q);
    });
  }

  async alerts(scope: EmployerScope, q: z.infer<typeof alertListQuery>) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const conds = [eq(punchAlerts.employerId, employerId)];
      if (q.status !== 'all') conds.push(eq(punchAlerts.status, q.status));
      if (q.employeeId) conds.push(eq(punchAlerts.employeeId, q.employeeId));
      const where = and(...conds);
      const [{ total } = { total: 0 }] = await tx.select({ total: count() }).from(punchAlerts).where(where);
      const rows = await tx
        .select({ a: punchAlerts, p: { id: punchRecords.id, nsr: punchRecords.nsr, type: punchRecords.type, serverTime: punchRecords.serverTime, justification: punchRecords.justification, locationName: punchRecords.locationName }, employeeName: employees.fullName })
        .from(punchAlerts)
        .innerJoin(punchRecords, eq(punchRecords.id, punchAlerts.punchRecordId))
        .innerJoin(employees, eq(employees.id, punchAlerts.employeeId))
        .where(where)
        .orderBy(desc(punchAlerts.createdAt))
        .limit(q.pageSize)
        .offset(offsetOf(q));
      return toPage(
        rows.map(({ a, p, employeeName }) => ({
          id: a.id,
          code: a.code,
          label: ALERT_LABEL[a.code],
          detail: a.detail,
          status: a.status,
          reviewNote: a.reviewNote,
          reviewedAt: a.reviewedAt?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
          employeeId: a.employeeId,
          employeeName,
          punch: { id: p.id, nsr: p.nsr, type: p.type, serverTime: p.serverTime.toISOString(), justification: p.justification, locationName: p.locationName },
        })),
        total,
        q,
      );
    });
  }

  /** Revisão humana registra a análise; não altera a marcação nem aplica penalidade. */
  async review(scope: EmployerScope, alertId: string, note: string, meta: RequestMeta) {
    const { employerId } = scope.membership;
    await this.tenant.run(employerId, async (tx) => {
      const [a] = await tx.select().from(punchAlerts).where(and(eq(punchAlerts.id, alertId), eq(punchAlerts.employerId, employerId)));
      if (!a) throw notFound('Ocorrência');
      if (a.status === 'reviewed') throw conflict('ALREADY_REVIEWED', 'Ocorrência já revisada.');
      await tx.update(punchAlerts).set({ status: 'reviewed', reviewNote: note, reviewedAt: new Date(), reviewedByUserId: scope.userId }).where(eq(punchAlerts.id, alertId));
      await this.audit.record(tx, { employerId, category: 'data', action: 'alert.reviewed', actorUserId: scope.userId, entityType: 'punch_alert', entityId: alertId, summary: `Ocorrência revisada: ${ALERT_LABEL[a.code]}`, ip: meta.ip });
    });
  }
}
