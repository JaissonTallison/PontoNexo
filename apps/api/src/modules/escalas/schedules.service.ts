import { Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import {
  nationalHolidays,
  weeklyScheduledSeconds,
  type HolidayDef,
  type holidayCreateSchema,
  type ScheduleAssignment,
  type scheduleCreateSchema,
  type ScheduleDef,
} from '@pontonexo/shared';
import type { z } from 'zod';
import type { Tx } from '../../db/client.js';
import { employeeSchedules, holidays, workScheduleDays, workSchedules } from '../../db/schema.js';
import { AuditService } from '../../common/audit.service.js';
import type { EmployerScope } from '../../common/auth/decorators.js';
import { notFound } from '../../common/errors.js';
import type { RequestMeta } from '../../common/http.js';
import { TenantDb } from '../../common/tenant.js';

type ScheduleRow = typeof workSchedules.$inferSelect;
type DayRow = typeof workScheduleDays.$inferSelect;

const toDef = (s: ScheduleRow, days: DayRow[]): ScheduleDef => ({
  id: s.id,
  kind: s.kind,
  days: days.filter((d) => d.scheduleId === s.id).map((d) => ({ weekday: d.weekday, start: d.start, end: d.end, breakMinutes: d.breakMinutes })),
  cycleAnchorDate: s.cycleAnchorDate,
  cycleStart: s.cycleStart,
  cycleEnd: s.cycleEnd,
  cycleBreakMinutes: s.cycleBreakMinutes,
});

/** Atribuições e definições de escala do funcionário (para o cálculo do espelho). */
export async function loadScheduleContext(tx: Tx, employeeId: string): Promise<{ assignments: ScheduleAssignment[]; schedules: Map<string, ScheduleDef> }> {
  const asg = await tx.select().from(employeeSchedules).where(eq(employeeSchedules.employeeId, employeeId));
  const ids = [...new Set(asg.map((a) => a.scheduleId))];
  if (!ids.length) return { assignments: [], schedules: new Map() };
  const scheds = await tx.select().from(workSchedules).where(inArray(workSchedules.id, ids));
  const days = await tx.select().from(workScheduleDays).where(inArray(workScheduleDays.scheduleId, ids));
  return {
    assignments: asg.map((a) => ({ scheduleId: a.scheduleId, validFrom: a.validFrom, validTo: a.validTo })),
    schedules: new Map(scheds.map((s) => [s.id, toDef(s, days)])),
  };
}

/** Feriados nacionais (código) + do empregador (banco) no intervalo. */
export async function loadHolidays(tx: Tx, employerId: string, from: string, to: string): Promise<HolidayDef[]> {
  const years = new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]);
  const national = [...years].flatMap((y) => nationalHolidays(y)).filter((h) => h.date >= from && h.date <= to);
  const own = await tx
    .select({ date: holidays.date, name: holidays.name })
    .from(holidays)
    .where(and(eq(holidays.employerId, employerId), gte(holidays.date, from), lte(holidays.date, to)));
  return [...national, ...own];
}

@Injectable()
export class SchedulesService {
  constructor(
    private readonly tenant: TenantDb,
    private readonly audit: AuditService,
  ) {}

  async list(scope: EmployerScope) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const scheds = await tx.select().from(workSchedules).where(eq(workSchedules.employerId, employerId)).orderBy(asc(workSchedules.name));
      const days = scheds.length ? await tx.select().from(workScheduleDays).where(inArray(workScheduleDays.scheduleId, scheds.map((s) => s.id))) : [];
      return scheds.map((s) => {
        const def = toDef(s, days);
        return { ...def, name: s.name, notes: s.notes, active: s.active, weeklySeconds: weeklyScheduledSeconds(def), createdAt: s.createdAt.toISOString() };
      });
    });
  }

  /** Escalas não são editadas: cria-se uma nova e atribui-se com nova vigência, preservando o histórico. */
  async create(scope: EmployerScope, input: z.infer<typeof scheduleCreateSchema>, meta: RequestMeta) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const [s] = await tx
        .insert(workSchedules)
        .values({
          employerId,
          name: input.name,
          kind: input.kind,
          cycleAnchorDate: input.kind === 'cycle_12x36' ? (input.cycleAnchorDate ?? null) : null,
          cycleStart: input.kind === 'cycle_12x36' ? (input.cycleStart ?? null) : null,
          cycleEnd: input.kind === 'cycle_12x36' ? (input.cycleEnd ?? null) : null,
          cycleBreakMinutes: input.kind === 'cycle_12x36' ? (input.cycleBreakMinutes ?? 60) : null,
          notes: input.notes ?? null,
        })
        .returning();
      if (input.kind === 'weekly' && input.days.length) {
        await tx.insert(workScheduleDays).values(input.days.map((d) => ({ employerId, scheduleId: s!.id, ...d })));
      }
      await this.audit.record(tx, { employerId, category: 'data', action: 'schedule.created', actorUserId: scope.userId, entityType: 'work_schedule', entityId: s!.id, summary: `Escala "${input.name}" criada`, ip: meta.ip, metadata: { kind: input.kind } });
      return { id: s!.id };
    });
  }

  async setActive(scope: EmployerScope, id: string, active: boolean, meta: RequestMeta) {
    const { employerId } = scope.membership;
    await this.tenant.run(employerId, async (tx) => {
      const res = await tx.update(workSchedules).set({ active }).where(and(eq(workSchedules.id, id), eq(workSchedules.employerId, employerId))).returning({ id: workSchedules.id });
      if (!res.length) throw notFound('Escala');
      await this.audit.record(tx, { employerId, category: 'data', action: active ? 'schedule.activated' : 'schedule.archived', actorUserId: scope.userId, entityType: 'work_schedule', entityId: id, summary: active ? 'Escala reativada' : 'Escala arquivada', ip: meta.ip });
    });
  }

  async listHolidays(scope: EmployerScope, year: number) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const own = await tx
        .select()
        .from(holidays)
        .where(and(eq(holidays.employerId, employerId), gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`)));
      const list = [
        ...nationalHolidays(year).map((h) => ({ id: null, date: h.date, name: h.name, scope: 'national' as const, removable: false })),
        ...own.map((h) => ({ id: h.id, date: h.date, name: h.name, scope: h.scope, removable: true })),
      ];
      return list.sort((a, b) => a.date.localeCompare(b.date));
    });
  }

  async createHoliday(scope: EmployerScope, input: z.infer<typeof holidayCreateSchema>, meta: RequestMeta) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const [h] = await tx.insert(holidays).values({ employerId, ...input, createdByUserId: scope.userId }).returning({ id: holidays.id });
      await this.audit.record(tx, { employerId, category: 'data', action: 'holiday.created', actorUserId: scope.userId, entityType: 'holiday', entityId: h!.id, summary: `Feriado ${input.date} "${input.name}" cadastrado`, ip: meta.ip });
      return { id: h!.id };
    });
  }

  async deleteHoliday(scope: EmployerScope, id: string, meta: RequestMeta) {
    const { employerId } = scope.membership;
    await this.tenant.run(employerId, async (tx) => {
      const [h] = await tx.delete(holidays).where(and(eq(holidays.id, id), eq(holidays.employerId, employerId))).returning();
      if (!h) throw notFound('Feriado');
      await this.audit.record(tx, { employerId, category: 'data', action: 'holiday.deleted', actorUserId: scope.userId, entityType: 'holiday', entityId: id, summary: `Feriado ${h.date} "${h.name}" removido`, ip: meta.ip });
    });
  }
}
