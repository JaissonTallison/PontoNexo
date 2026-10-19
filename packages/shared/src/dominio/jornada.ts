/**
 * Cálculo derivado da jornada. Nunca altera marcações: recebe as marcações originais,
 * os tratamentos aprovados e a jornada prevista, e devolve um espelho.
 *
 * Regras de referência (LC 150/2015). Os parâmetros que dependem de interpretação jurídica
 * ficam explícitos em ContractRules e precisam de validação antes do uso oficial:
 * - art. 2º: 8 h/dia e 44 h/semana; § 5º compensação (40 primeiras horas mensais pagas);
 *   § 8º domingos e feriados trabalhados sem compensação são pagos em dobro.
 * - art. 10: 12x36, feriados considerados compensados.
 * - art. 13: intervalo de 1 h a 2 h (redução a 30 min com acordo escrito); quem reside no local
 *   pode dividir em 2 períodos de no mínimo 1 h cada, até 4 h/dia.
 * - art. 14: noturno das 22 h às 5 h, hora de 52 min 30 s.
 * - art. 15: 11 h consecutivas entre jornadas.
 * - Limite de 2 h extras/dia e exigência de intervalo acima de 6 h vêm da CLT (arts. 59 e 71),
 *   aplicada de forma subsidiária (LC 150, art. 19).
 */
import { DateTime } from 'luxon';
import type { ExpectedDay } from './escala.js';
import { STALE_SESSION_HOURS } from './sequencia.js';
import { addDays, localDate } from './tempo.js';
import type { CompensationRegime, ContractRegime, PunchType } from './tipos.js';

export interface EffectivePunch {
  /** id da marcação original ou do tratamento de inclusão */
  ref: string;
  type: PunchType;
  at: Date;
  source: 'original' | 'inclusion';
}

export interface OriginalPunchInput {
  id: string;
  type: PunchType;
  at: Date;
}

export interface InclusionInput {
  id: string;
  type: PunchType;
  at: Date;
}

/** Marcações efetivas = originais não desconsideradas + inclusões aprovadas. */
export function effectivePunches(
  originals: OriginalPunchInput[],
  disregardedIds: ReadonlySet<string>,
  inclusions: InclusionInput[],
): EffectivePunch[] {
  const list: EffectivePunch[] = [
    ...originals.filter((p) => !disregardedIds.has(p.id)).map((p) => ({ ref: p.id, type: p.type, at: p.at, source: 'original' as const })),
    ...inclusions.map((p) => ({ ref: p.id, type: p.type, at: p.at, source: 'inclusion' as const })),
  ];
  return list.sort((a, b) => a.at.getTime() - b.at.getTime() || order(a.type) - order(b.type));
}

const order = (t: PunchType) => ({ clock_in: 0, break_start: 1, break_end: 2, clock_out: 3 })[t];

export interface BuiltBreak {
  start: Date;
  end: Date | null;
}

export interface BuiltSession {
  referenceDate: string;
  start: Date;
  end: Date | null;
  breaks: BuiltBreak[];
  refs: string[];
  /** fechada por saída */
  closed: boolean;
  /** aberta há mais de STALE_SESSION_HOURS ou interrompida por nova entrada */
  missingClockOut: boolean;
  breakClosedByClockOut: boolean;
}

export interface OrphanPunch {
  ref: string;
  type: PunchType;
  at: Date;
  referenceDate: string;
}

export function buildSessions(punches: EffectivePunch[], tz: string, now: Date): { sessions: BuiltSession[]; orphans: OrphanPunch[] } {
  const sessions: BuiltSession[] = [];
  const orphans: OrphanPunch[] = [];
  let current: BuiltSession | null = null;

  const orphan = (p: EffectivePunch) => orphans.push({ ref: p.ref, type: p.type, at: p.at, referenceDate: localDate(p.at, tz) });

  for (const p of punches) {
    const lastBreak: BuiltBreak | undefined = current?.breaks[current.breaks.length - 1];
    const onBreak = lastBreak !== undefined && lastBreak.end === null;
    switch (p.type) {
      case 'clock_in':
        if (current) {
          current.missingClockOut = true;
          sessions.push(current);
        }
        current = {
          referenceDate: localDate(p.at, tz),
          start: p.at,
          end: null,
          breaks: [],
          refs: [p.ref],
          closed: false,
          missingClockOut: false,
          breakClosedByClockOut: false,
        };
        break;
      case 'break_start':
        if (!current || onBreak) orphan(p);
        else {
          current.breaks.push({ start: p.at, end: null });
          current.refs.push(p.ref);
        }
        break;
      case 'break_end':
        if (!current || !onBreak || !lastBreak) orphan(p);
        else {
          lastBreak.end = p.at;
          current.refs.push(p.ref);
        }
        break;
      case 'clock_out':
        if (!current) orphan(p);
        else {
          if (onBreak && lastBreak) {
            lastBreak.end = p.at;
            current.breakClosedByClockOut = true;
          }
          current.end = p.at;
          current.closed = true;
          current.refs.push(p.ref);
          sessions.push(current);
          current = null;
        }
        break;
    }
  }
  if (current) {
    if (now.getTime() - current.start.getTime() > STALE_SESSION_HOURS * 3600_000) current.missingClockOut = true;
    sessions.push(current);
  }
  return { sessions, orphans };
}

interface Interval {
  start: number;
  end: number;
}

function overlap(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/** Intervalos trabalhados (sessão menos intervalos), em ms. Sessão aberta conta até `until`. */
export function workedIntervals(session: BuiltSession, until: Date): Interval[] {
  const end = (session.end ?? until).getTime();
  const start = session.start.getTime();
  if (end <= start) return [];
  const breaks = session.breaks
    .map((b) => ({ start: Math.max(start, b.start.getTime()), end: Math.min(end, (b.end ?? until).getTime()) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  let cursor = start;
  for (const b of breaks) {
    if (b.start > cursor) out.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (end > cursor) out.push({ start: cursor, end });
  return out;
}

/** Segundos dentro da faixa noturna (22 h – 5 h, hora local). */
export function nightSeconds(intervals: Interval[], tz: string): number {
  let total = 0;
  for (const iv of intervals) {
    const firstDay = localDate(new Date(iv.start), tz);
    const lastDay = localDate(new Date(iv.end), tz);
    for (let d = addDays(firstDay, -1); d <= lastDay; d = addDays(d, 1)) {
      const ws = DateTime.fromISO(`${d}T22:00`, { zone: tz }).toMillis();
      const we = DateTime.fromISO(`${addDays(d, 1)}T05:00`, { zone: tz }).toMillis();
      total += overlap(iv, { start: ws, end: we });
    }
  }
  return Math.round(total / 1000);
}

/** Acréscimo pela hora noturna reduzida: 52 min 30 s valem 60 min (fator 8/7). */
export function nightReductionBonus(nightSecs: number): number {
  return Math.round((nightSecs * 8) / 7) - nightSecs;
}

export interface ContractRules {
  regime: ContractRegime;
  residesAtWorkplace: boolean;
  breakReductionAgreement: boolean;
  compensation: CompensationRegime;
  /** Acima disso (min trabalhados) exige-se o intervalo mínimo. Padrão 360 (CLT art. 71, subsidiária). */
  breakRequiredAfterMinutes: number;
}

export const DEFAULT_RULES: ContractRules = {
  regime: 'full_time',
  residesAtWorkplace: false,
  breakReductionAgreement: false,
  compensation: 'none',
  breakRequiredAfterMinutes: 360,
};

export const DAY_ISSUES = [
  'missing_clock_out',
  'orphan_punch',
  'break_not_closed',
  'break_below_minimum',
  'break_above_maximum',
  'break_split_irregular',
  'multiple_breaks',
  'daily_limit_exceeded',
  'rest_between_shifts',
  'absence',
  'in_progress',
  'worked_on_rest_day',
] as const;
export type DayIssueCode = (typeof DAY_ISSUES)[number];

export const DAY_ISSUE_LABEL: Record<DayIssueCode, string> = {
  missing_clock_out: 'Jornada sem saída registrada',
  orphan_punch: 'Marcação fora de sequência',
  break_not_closed: 'Intervalo encerrado pela saída',
  break_below_minimum: 'Intervalo abaixo do mínimo',
  break_above_maximum: 'Intervalo acima do máximo',
  break_split_irregular: 'Divisão de intervalo fora da regra para quem reside no local',
  multiple_breaks: 'Mais de um intervalo no dia',
  daily_limit_exceeded: 'Mais de 2 h além da jornada no dia',
  rest_between_shifts: 'Menos de 11 h de descanso desde a jornada anterior',
  absence: 'Ausência sem justificativa',
  in_progress: 'Jornada em andamento',
  worked_on_rest_day: 'Trabalho em dia de descanso ou feriado',
};

/** Ocorrências informativas não pedem ação; as demais pedem revisão. */
export const INFO_ISSUES: ReadonlySet<DayIssueCode> = new Set(['multiple_breaks', 'in_progress', 'break_not_closed']);

export interface DayIssue {
  code: DayIssueCode;
  detail: string | null;
}

export interface DaySession {
  start: Date;
  end: Date | null;
  breaks: BuiltBreak[];
  refs: string[];
  missingClockOut: boolean;
}

export interface DayResult {
  date: string;
  expected: ExpectedDay;
  sessions: DaySession[];
  orphans: OrphanPunch[];
  workedSeconds: number;
  breakSeconds: number;
  nightSeconds: number;
  nightBonusSeconds: number;
  /** trabalhado + acréscimo noturno */
  computedSeconds: number;
  justifiedSeconds: number;
  overtimeSeconds: number;
  deficitSeconds: number;
  restOrHolidaySeconds: number;
  absent: boolean;
  justified: boolean;
  issues: DayIssue[];
}

export interface PeriodTotals {
  workedSeconds: number;
  computedSeconds: number;
  nightSeconds: number;
  nightBonusSeconds: number;
  expectedSeconds: number;
  justifiedSeconds: number;
  overtimeSeconds: number;
  deficitSeconds: number;
  restOrHolidaySeconds: number;
  absences: number;
  justifiedAbsences: number;
  daysWithIssues: number;
}

export interface CompensationResult {
  regime: CompensationRegime;
  /** horas pagas como extras no mês */
  paidOvertimeSeconds: number;
  /** saldo levado ao banco (pode ser negativo) */
  bankSeconds: number;
  note: string;
}

export interface PeriodResult {
  days: DayResult[];
  totals: PeriodTotals;
  compensation: CompensationResult;
}

export interface PeriodInput {
  dates: string[];
  tz: string;
  punches: EffectivePunch[];
  expected: (date: string) => ExpectedDay;
  justifiedDates: ReadonlySet<string>;
  rules: ContractRules;
  now: Date;
}

const H = 3600;
const LC150_PAID_CAP_SECONDS = 40 * H;

export function calculatePeriod(input: PeriodInput): PeriodResult {
  const { tz, rules, now } = input;
  const today = localDate(now, tz);
  const { sessions, orphans } = buildSessions(input.punches, tz, now);
  const sorted = [...sessions].sort((a, b) => a.start.getTime() - b.start.getTime());

  const days: DayResult[] = input.dates.map((date) => {
    const expected = input.expected(date);
    const daySessions = sorted.filter((s) => s.referenceDate === date);
    const dayOrphans = orphans.filter((o) => o.referenceDate === date);
    const issues: DayIssue[] = [];
    const add = (code: DayIssueCode, detail: string | null = null) => issues.push({ code, detail });

    let worked = 0;
    let breaks = 0;
    let night = 0;
    const breakDurations: number[] = [];

    for (const s of daySessions) {
      const inProgress = !s.closed && !s.missingClockOut;
      if (s.missingClockOut) {
        add('missing_clock_out');
        continue;
      }
      if (inProgress) add('in_progress');
      if (s.breakClosedByClockOut) add('break_not_closed');
      const ivs = workedIntervals(s, now);
      worked += Math.round(ivs.reduce((a, iv) => a + (iv.end - iv.start), 0) / 1000);
      night += nightSeconds(ivs, tz);
      for (const b of s.breaks) {
        const d = Math.round(((b.end ?? now).getTime() - b.start.getTime()) / 1000);
        breakDurations.push(d);
        breaks += d;
      }
      const idx = sorted.indexOf(s);
      const prev = idx > 0 ? sorted[idx - 1] : undefined;
      if (prev?.end && s.start.getTime() - prev.end.getTime() < 11 * H * 1000) {
        const gap = Math.round((s.start.getTime() - prev.end.getTime()) / 60000);
        add('rest_between_shifts', `${Math.floor(gap / 60)}h ${String(gap % 60).padStart(2, '0')}min`);
      }
    }
    if (dayOrphans.length) add('orphan_punch', String(dayOrphans.length));

    // Intervalos
    const closedWork = daySessions.some((s) => s.closed);
    if (closedWork) {
      const minBreak = (rules.breakReductionAgreement ? 30 : 60) * 60;
      if (worked > rules.breakRequiredAfterMinutes * 60 && breaks < minBreak) add('break_below_minimum');
      if (rules.residesAtWorkplace && breakDurations.length > 1) {
        const irregular = breakDurations.length > 2 || breakDurations.some((d) => d < H) || breaks > 4 * H;
        if (irregular) add('break_split_irregular');
      } else {
        if (breaks > 2 * H) add('break_above_maximum');
        if (breakDurations.length > 1) add('multiple_breaks');
      }
    }

    const nightBonus = nightReductionBonus(night);
    const computed = worked + nightBonus;
    const justified = input.justifiedDates.has(date);
    const isPastOrToday = date <= today;
    const isPast = date < today;

    let overtime = 0;
    let deficit = 0;
    let restOrHoliday = 0;
    let justifiedSeconds = 0;
    let absent = false;

    if (expected.kind === 'workday') {
      if (justified) justifiedSeconds = Math.max(0, expected.expectedSeconds - computed);
      const diff = computed + justifiedSeconds - expected.expectedSeconds;
      overtime = Math.max(0, diff);
      if (isPast) deficit = Math.max(0, -diff);
      if (isPast && daySessions.length === 0 && !justified) {
        absent = true;
        add('absence');
      }
      const limit = rules.regime === 'shift_12x36' ? 12 * H : Math.max(expected.expectedSeconds, 8 * H) + 2 * H;
      if (computed > limit) add('daily_limit_exceeded');
    } else if (expected.kind === 'rest' || expected.kind === 'holiday') {
      restOrHoliday = computed;
      if (computed > 0) add('worked_on_rest_day', expected.holidayName);
    } else if (isPastOrToday && computed > 10 * H) {
      add('daily_limit_exceeded');
    }

    return {
      date,
      expected,
      sessions: daySessions.map((s) => ({ start: s.start, end: s.end, breaks: s.breaks, refs: s.refs, missingClockOut: s.missingClockOut })),
      orphans: dayOrphans,
      workedSeconds: worked,
      breakSeconds: breaks,
      nightSeconds: night,
      nightBonusSeconds: nightBonus,
      computedSeconds: computed,
      justifiedSeconds,
      overtimeSeconds: overtime,
      deficitSeconds: deficit,
      restOrHolidaySeconds: restOrHoliday,
      absent,
      justified,
      issues,
    };
  });

  const sum = (f: (d: DayResult) => number) => days.reduce((a, d) => a + f(d), 0);
  const totals: PeriodTotals = {
    workedSeconds: sum((d) => d.workedSeconds),
    computedSeconds: sum((d) => d.computedSeconds),
    nightSeconds: sum((d) => d.nightSeconds),
    nightBonusSeconds: sum((d) => d.nightBonusSeconds),
    expectedSeconds: sum((d) => d.expected.expectedSeconds),
    justifiedSeconds: sum((d) => d.justifiedSeconds),
    overtimeSeconds: sum((d) => d.overtimeSeconds),
    deficitSeconds: sum((d) => d.deficitSeconds),
    restOrHolidaySeconds: sum((d) => d.restOrHolidaySeconds),
    absences: days.filter((d) => d.absent).length,
    justifiedAbsences: days.filter((d) => d.justified && d.expected.kind === 'workday').length,
    daysWithIssues: days.filter((d) => d.issues.some((i) => !INFO_ISSUES.has(i.code))).length,
  };

  return { days, totals, compensation: compensate(rules.compensation, totals.overtimeSeconds, totals.deficitSeconds) };
}

/**
 * LC 150, art. 2º, § 5º: no regime de compensação, as primeiras 40 h excedentes do mês são pagas
 * como extras, delas podendo ser deduzidas as horas não trabalhadas; o saldo acima de 40 h vai
 * para compensação em até 1 ano. Cálculo de referência: validar com o contador.
 */
export function compensate(regime: CompensationRegime, overtime: number, deficit: number): CompensationResult {
  if (regime === 'none') {
    return {
      regime,
      paidOvertimeSeconds: overtime,
      bankSeconds: 0,
      note: 'Sem acordo de compensação: todo excedente é hora extra (mínimo de 50%, LC 150, art. 2º, § 1º).',
    };
  }
  const first = Math.min(overtime, LC150_PAID_CAP_SECONDS);
  const paid = Math.max(0, first - deficit);
  const remainingDeficit = Math.max(0, deficit - first);
  const bank = Math.max(0, overtime - LC150_PAID_CAP_SECONDS) - remainingDeficit;
  return {
    regime,
    paidOvertimeSeconds: paid,
    bankSeconds: bank,
    note: 'Primeiras 40 h excedentes pagas como extras, com dedução das horas não trabalhadas; saldo compensável em até 1 ano (LC 150, art. 2º, § 5º).',
  };
}
