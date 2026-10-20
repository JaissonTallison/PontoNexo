import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { addDays, localDate, localToInstant, resolveExpectedDay } from '@pontonexo/shared';
import type { Env } from '../../config/env.js';
import type { Database, Tx } from '../../db/client.js';
import { employees, employers, punchRecords, remindersSent, userRoles, workSessions } from '../../db/schema.js';
import { TenantDb } from '../../common/tenant.js';
import { DB, ENV } from '../../common/tokens.js';
import { loadHolidays, loadScheduleContext } from '../escalas/schedules.service.js';
import { activeContract } from '../funcionarios/employees.service.js';
import { PushService } from './push.service.js';

const GRACE_MS = 15 * 60_000;
const WINDOW_MS = 4 * 3600_000;

/**
 * Lembretes pela escala: "não registrou a entrada" (15 min após o início previsto) e
 * "não registrou a saída" (15 min após o fim previsto, com jornada aberta). No máximo 1 de cada por dia.
 */
@Injectable()
export class RemindersJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Lembretes');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly tenant: TenantDb,
    private readonly push: PushService,
  ) {}

  onModuleInit() {
    if (!this.env.JOBS_ENABLED || !this.env.REMINDERS_ENABLED || !this.push.enabled) return;
    this.timer = setInterval(() => void this.run().catch((e: unknown) => this.logger.error('Falha nos lembretes', { error: String(e) })), 5 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Retorna quantos lembretes foram enviados. `now` permite testar horários. */
  async run(now = new Date()): Promise<number> {
    const ids = await this.db.execute<{ pn_employer_ids: string }>(sql`select pn_employer_ids()`);
    let sent = 0;
    for (const { pn_employer_ids: employerId } of ids) sent += await this.runEmployer(employerId, now);
    return sent;
  }

  private async runEmployer(employerId: string, now: Date): Promise<number> {
    const roles = await this.db.select({ employeeId: userRoles.employeeId, userId: userRoles.userId }).from(userRoles).where(and(eq(userRoles.employerId, employerId), eq(userRoles.roleCode, 'employee'), eq(userRoles.active, true)));
    const subscribed = await this.push.hasSubscription(roles.map((r) => r.userId));
    const targets = roles.filter((r) => r.employeeId && subscribed.has(r.userId));
    if (!targets.length) return 0;

    const plan = await this.tenant.run(employerId, async (tx) => {
      const [employer] = await tx.select().from(employers).where(eq(employers.id, employerId));
      const tz = employer!.timezone;
      const today = localDate(now, tz);
      const holidays = await loadHolidays(tx, employerId, addDays(today, -1), today);
      const out: Array<{ userId: string; employeeId: string; date: string; kind: 'missing_clock_in' | 'missing_clock_out' }> = [];
      for (const t of targets) {
        const employeeId = t.employeeId!;
        const [emp] = await tx.select({ status: employees.status }).from(employees).where(eq(employees.id, employeeId));
        if (emp?.status !== 'active' || !(await activeContract(tx, employeeId, today))) continue;
        const sched = await loadScheduleContext(tx, employeeId);
        // entrada: escala de hoje
        const exp = resolveExpectedDay(today, sched.assignments, sched.schedules, holidays);
        if (exp.kind === 'workday' && exp.start) {
          const start = localToInstant(today, exp.start, tz).getTime();
          if (now.getTime() > start + GRACE_MS && now.getTime() < start + WINDOW_MS && !(await this.punchedSince(tx, employeeId, localToInstant(today, '00:00', tz)))) {
            out.push({ userId: t.userId, employeeId, date: today, kind: 'missing_clock_in' });
          }
        }
        // saída: jornada de hoje ou que começou ontem (vira o dia)
        const open = await tx.select({ id: workSessions.id }).from(workSessions).where(and(eq(workSessions.employeeId, employeeId), inArray(workSessions.state, ['working', 'on_break'])));
        if (open.length) {
          for (const d of [addDays(today, -1), today]) {
            const e = resolveExpectedDay(d, sched.assignments, sched.schedules, holidays);
            if (e.kind !== 'workday' || !e.start || !e.end) continue;
            const endDate = e.end <= e.start ? addDays(d, 1) : d;
            const end = localToInstant(endDate, e.end, tz).getTime();
            if (now.getTime() > end + GRACE_MS && now.getTime() < end + WINDOW_MS) out.push({ userId: t.userId, employeeId, date: d, kind: 'missing_clock_out' });
          }
        }
      }
      // registra antes de enviar: o índice único garante um lembrete por tipo e dia
      const claimed = [];
      for (const o of out) {
        const r = await tx.insert(remindersSent).values({ employerId, employeeId: o.employeeId, date: o.date, kind: o.kind }).onConflictDoNothing().returning({ id: remindersSent.id });
        if (r.length) claimed.push(o);
      }
      return claimed;
    });

    let sent = 0;
    for (const p of plan) {
      sent += await this.push.sendToUser(
        p.userId,
        p.kind === 'missing_clock_in'
          ? { title: 'Você ainda não registrou a entrada', body: 'Se já começou a trabalhar, toque aqui para marcar o ponto.', url: '/app', tag: 'lembrete-entrada' }
          : { title: 'Não esqueça de registrar a saída', body: 'Seu horário previsto já terminou. Toque aqui para marcar a saída.', url: '/app', tag: 'lembrete-saida' },
      );
    }
    return sent;
  }

  private async punchedSince(tx: Tx, employeeId: string, from: Date) {
    const [p] = await tx.select({ id: punchRecords.id }).from(punchRecords).where(and(eq(punchRecords.employeeId, employeeId), gte(punchRecords.serverTime, from))).limit(1);
    return Boolean(p);
  }
}
