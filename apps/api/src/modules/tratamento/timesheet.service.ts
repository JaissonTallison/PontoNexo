import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import {
  addDays,
  calculatePeriod,
  COMPENSATION_LABEL,
  CONTRACT_REGIME_LABEL,
  DEFAULT_RULES,
  effectivePunches,
  localDate,
  formatCpf,
  maskCpf,
  monthDays,
  monthRange,
  resolveExpectedDay,
  type ContractRules,
  type ClosingView,
  type TimesheetView,
  type TreatmentView,
} from '@pontonexo/shared';
import type { Tx } from '../../db/client.js';
import {
  closingAcknowledgements,
  employees,
  employers,
  employmentContracts,
  jobRoles,
  monthlyClosings,
  punchRecords,
  treatments,
  users,
} from '../../db/schema.js';
import { notFound } from '../../common/errors.js';
import { TenantDb } from '../../common/tenant.js';
import { loadHolidays, loadScheduleContext } from '../escalas/schedules.service.js';

type TreatmentRow = typeof treatments.$inferSelect;

export async function treatmentViews(tx: Tx, rows: TreatmentRow[]): Promise<TreatmentView[]> {
  const ids = [...new Set(rows.map((r) => r.createdByUserId))];
  const names = ids.length ? await tx.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
  return rows.map((t) => ({
    id: t.id,
    kind: t.kind,
    punchRecordId: t.punchRecordId,
    punchType: t.punchType,
    effectiveTime: t.effectiveTime?.toISOString() ?? null,
    absenceDate: t.absenceDate,
    previousValue: (t.previousValue as Record<string, unknown> | null) ?? null,
    newValue: (t.newValue as Record<string, unknown> | null) ?? null,
    reason: t.reason,
    correctionRequestId: t.correctionRequestId,
    createdByName: names.find((n) => n.id === t.createdByUserId)?.name ?? '',
    createdAt: t.createdAt.toISOString(),
  }));
}

export async function closingView(tx: Tx, c: typeof monthlyClosings.$inferSelect): Promise<ClosingView> {
  const [emp] = await tx.select({ fullName: employees.fullName }).from(employees).where(eq(employees.id, c.employeeId));
  const [by] = await tx.select({ name: users.name }).from(users).where(eq(users.id, c.closedByUserId));
  const [ack] = await tx.select().from(closingAcknowledgements).where(eq(closingAcknowledgements.closingId, c.id));
  return {
    id: c.id,
    employeeId: c.employeeId,
    employeeName: emp?.fullName ?? '',
    month: c.month,
    status: c.status,
    closedAt: c.closedAt.toISOString(),
    closedByName: by?.name ?? '',
    snapshotHash: c.snapshotHash,
    reopenedAt: c.reopenedAt?.toISOString() ?? null,
    reopenReason: c.reopenReason,
    acknowledgedAt: ack?.createdAt.toISOString() ?? null,
    acknowledgementNote: ack ? `${ack.agree ? 'De acordo' : 'Em desacordo'}${ack.note ? `: ${ack.note}` : ''}` : null,
  };
}

/** Fechamento vigente (não reaberto) do mês, se houver. */
export async function closedMonth(tx: Tx, employeeId: string, month: string) {
  const [c] = await tx.select().from(monthlyClosings).where(and(eq(monthlyClosings.employeeId, employeeId), eq(monthlyClosings.month, month), eq(monthlyClosings.status, 'closed')));
  return c ?? null;
}

@Injectable()
export class TimesheetService {
  constructor(private readonly tenant: TenantDb) {}

  run(employerId: string, employeeId: string, month: string): Promise<TimesheetView> {
    return this.tenant.run(employerId, (tx) => this.compute(tx, employerId, employeeId, month));
  }

  /**
   * Espelho do mês: jornada prevista (escalas), marcações originais, tratamentos aprovados e cálculo derivado.
   * Nada é gravado; o mesmo cálculo serve para tela, exportação e fotografia do fechamento.
   */
  async compute(tx: Tx, employerId: string, employeeId: string, month: string): Promise<TimesheetView> {
    const [employer] = await tx.select().from(employers).where(eq(employers.id, employerId));
    const [emp] = await tx.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.employerId, employerId)));
    if (!employer || !emp) throw notFound('Funcionário');
    const tz = employer.timezone;
    const [role] = emp.jobRoleId ? await tx.select({ name: jobRoles.name }).from(jobRoles).where(eq(jobRoles.id, emp.jobRoleId)) : [];
    const jobRole = role?.name ?? null;
    const dates = monthDays(month);
    const first = dates[0]!;
    const lastDay = dates[dates.length - 1]!;
    const { from, to } = monthRange(month, tz);
    // janela estendida: jornada que começou no dia anterior (interjornada) e que termina no dia seguinte
    const windowFrom = new Date(from.getTime() - 2 * 86_400_000);
    const windowTo = new Date(to.getTime() + 86_400_000);

    const [contract] = await tx
      .select()
      .from(employmentContracts)
      .where(and(eq(employmentContracts.employeeId, employeeId), lte(employmentContracts.startDate, lastDay), or(isNull(employmentContracts.endDate), gte(employmentContracts.endDate, first))))
      .orderBy(desc(employmentContracts.startDate))
      .limit(1);
    const rules: ContractRules = contract
      ? { ...DEFAULT_RULES, regime: contract.regime, residesAtWorkplace: contract.residesAtWorkplace, breakReductionAgreement: contract.breakReductionAgreement, compensation: contract.compensation }
      : DEFAULT_RULES;

    const originals = await tx
      .select()
      .from(punchRecords)
      .where(and(eq(punchRecords.employeeId, employeeId), gte(punchRecords.serverTime, windowFrom), lt(punchRecords.serverTime, windowTo)));
    const allTreatments = await tx.select().from(treatments).where(eq(treatments.employeeId, employeeId));
    const disregarded = new Set(allTreatments.filter((t) => t.kind === 'disregard' && t.punchRecordId).map((t) => t.punchRecordId!));
    const inclusions = allTreatments
      .filter((t) => t.kind === 'inclusion' && t.effectiveTime && t.effectiveTime >= windowFrom && t.effectiveTime < windowTo)
      .map((t) => ({ id: t.id, type: t.punchType!, at: t.effectiveTime! }));
    const justified = new Set(allTreatments.filter((t) => t.kind === 'absence_justification' && t.absenceDate).map((t) => t.absenceDate!));

    // início do ponto: dia da primeira marcação (original ou incluída por ajuste aprovado).
    // Antes dele, dia de trabalho sem registro não é falta: o funcionário ainda não usava o sistema.
    const [firstPunch] = await tx.select({ at: sql<Date | null>`min(${punchRecords.serverTime})` }).from(punchRecords).where(eq(punchRecords.employeeId, employeeId));
    const firstInclusion = allTreatments.filter((t) => t.kind === 'inclusion' && t.effectiveTime).reduce<Date | null>((m, t) => (!m || t.effectiveTime! < m ? t.effectiveTime! : m), null);
    const firstAt = [firstPunch?.at ? new Date(firstPunch.at) : null, firstInclusion].filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0];
    const trackingStart = firstAt ? localDate(firstAt, tz) : localDate(new Date(), tz);

    const sched = await loadScheduleContext(tx, employeeId);
    const holidays = await loadHolidays(tx, employerId, addDays(first, -2), addDays(lastDay, 1));
    // dias fora do contrato não têm jornada prevista
    const inContract = (d: string) => !contract || (d >= contract.startDate && (contract.endDate === null || d <= contract.endDate));
    const expected = (d: string) => {
      const e = resolveExpectedDay(d, sched.assignments, sched.schedules, holidays);
      if (!inContract(d)) return { ...e, kind: 'no_schedule' as const, expectedSeconds: 0 };
      if (e.kind === 'workday' && d < trackingStart) return { ...e, kind: 'not_started' as const, expectedSeconds: 0 };
      return e;
    };

    const eff = effectivePunches(
      originals.map((p) => ({ id: p.id, type: p.type, at: p.serverTime })),
      disregarded,
      inclusions,
    );
    const result = calculatePeriod({ dates, tz, punches: eff, expected, justifiedDates: justified, rules, now: new Date() });

    const nsrOf = new Map(originals.map((p) => [p.id, p.nsr]));
    const monthTreatments = allTreatments.filter((t) => {
      const date = t.absenceDate ?? (t.effectiveTime ? localDate(t.effectiveTime, tz) : null);
      const target = t.punchRecordId ? originals.find((p) => p.id === t.punchRecordId) : undefined;
      const targetDate = target ? localDate(target.serverTime, tz) : null;
      return (date && date >= first && date <= lastDay) || (targetDate && targetDate >= first && targetDate <= lastDay);
    });

    const [closingRow] = await tx.select().from(monthlyClosings).where(and(eq(monthlyClosings.employeeId, employeeId), eq(monthlyClosings.month, month))).orderBy(desc(monthlyClosings.closedAt)).limit(1);

    return {
      employee: { id: emp.id, fullName: emp.fullName, cpfMasked: maskCpf(emp.cpf), cpf: formatCpf(emp.cpf), jobRole },
      employer: {
        name: employer.legalName,
        displayName: employer.displayName,
        document: formatCpf(employer.documentCpf),
        address: [employer.addressLine, [employer.city, employer.state].filter(Boolean).join('/')].filter(Boolean).join(' · ') || null,
      },
      month,
      timezone: tz,
      contract: contract
        ? { regime: CONTRACT_REGIME_LABEL[contract.regime], weeklyHours: contract.weeklyMinutes / 60, compensation: COMPENSATION_LABEL[contract.compensation] }
        : null,
      days: result.days.map((d) => {
        const refs = new Set(d.sessions.flatMap((s) => s.refs));
        const dayEff = eff.filter((p) => refs.has(p.ref) || d.orphans.some((o) => o.ref === p.ref));
        return {
          ...d,
          sessions: d.sessions.map((s) => ({
            start: s.start.toISOString(),
            end: s.end?.toISOString() ?? null,
            breaks: s.breaks.map((b) => ({ start: b.start.toISOString(), end: b.end?.toISOString() ?? null })),
            missingClockOut: s.missingClockOut,
          })),
          orphans: d.orphans.map((o) => ({ type: o.type, at: o.at.toISOString() })),
          punches: dayEff.map((p) => ({ ref: p.ref, type: p.type, at: p.at.toISOString(), source: p.source, nsr: nsrOf.get(p.ref) ?? null })),
          disregarded: originals
            .filter((p) => disregarded.has(p.id) && localDate(p.serverTime, tz) === d.date)
            .map((p) => ({ id: p.id, nsr: p.nsr, type: p.type, at: p.serverTime.toISOString() })),
        };
      }),
      totals: result.totals,
      compensation: result.compensation,
      treatments: await treatmentViews(tx, monthTreatments),
      closing: closingRow ? await closingView(tx, closingRow) : null,
      generatedAt: new Date().toISOString(),
    };
  }
}
