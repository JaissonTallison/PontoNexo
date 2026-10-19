import { describe, expect, it } from 'vitest';
import { resolveExpectedDay, type ScheduleDef } from './escala.js';
import { calculatePeriod, compensate, DEFAULT_RULES, effectivePunches, type EffectivePunch } from './jornada.js';
import type { PunchType } from './tipos.js';

const TZ = 'America/Sao_Paulo'; // UTC-3, sem horário de verão desde 2019
const at = (local: string) => new Date(`${local}:00-03:00`);
let seq = 0;
const p = (type: PunchType, local: string): EffectivePunch => ({ ref: `p${++seq}`, type, at: at(local), source: 'original' });

const weekly: ScheduleDef = {
  id: 's1',
  kind: 'weekly',
  days: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '08:00', end: '17:00', breakMinutes: 60 })),
  cycleAnchorDate: null,
  cycleStart: null,
  cycleEnd: null,
  cycleBreakMinutes: null,
};
const schedules = new Map([[weekly.id, weekly]]);
const assignments = [{ scheduleId: 's1', validFrom: '2026-01-01', validTo: null }];
const expectedWeekly = (holidays: Array<{ date: string; name: string }> = []) => (date: string) =>
  resolveExpectedDay(date, assignments, schedules, holidays);
const NOW = at('2026-10-31T12:00');

describe('calculatePeriod', () => {
  it('soma corretamente vários intervalos no mesmo dia', () => {
    // segunda-feira 19/10/2026
    const punches = [
      p('clock_in', '2026-10-19T08:00'),
      p('break_start', '2026-10-19T10:00'),
      p('break_end', '2026-10-19T10:15'),
      p('break_start', '2026-10-19T12:00'),
      p('break_end', '2026-10-19T13:00'),
      p('clock_out', '2026-10-19T17:15'),
    ];
    const r = calculatePeriod({ dates: ['2026-10-19'], tz: TZ, punches, expected: expectedWeekly(), justifiedDates: new Set(), rules: DEFAULT_RULES, now: NOW });
    const d = r.days[0]!;
    expect(d.workedSeconds).toBe(8 * 3600);
    expect(d.breakSeconds).toBe(75 * 60);
    expect(d.overtimeSeconds).toBe(0);
    expect(d.deficitSeconds).toBe(0);
    expect(d.issues.map((i) => i.code)).toEqual(['multiple_breaks']);
  });

  it('atribui a jornada que vira o dia à data de entrada e calcula a hora noturna reduzida', () => {
    const punches = [
      p('clock_in', '2026-10-20T22:00'),
      p('break_start', '2026-10-21T02:00'),
      p('break_end', '2026-10-21T03:00'),
      p('clock_out', '2026-10-21T06:00'),
    ];
    const r = calculatePeriod({ dates: ['2026-10-20', '2026-10-21'], tz: TZ, punches, expected: () => resolveExpectedDay('x', [], new Map(), []), justifiedDates: new Set(), rules: DEFAULT_RULES, now: NOW });
    const [d20, d21] = r.days;
    expect(d20!.workedSeconds).toBe(7 * 3600);
    expect(d20!.nightSeconds).toBe(6 * 3600); // 22–02 e 03–05
    expect(d20!.nightBonusSeconds).toBe(Math.round((6 * 3600 * 8) / 7) - 6 * 3600);
    expect(d21!.workedSeconds).toBe(0);
  });

  it('aponta menos de 11 h entre jornadas', () => {
    const punches = [
      p('clock_in', '2026-10-19T14:00'),
      p('break_start', '2026-10-19T18:00'),
      p('break_end', '2026-10-19T19:00'),
      p('clock_out', '2026-10-19T23:00'),
      p('clock_in', '2026-10-20T08:00'),
      p('break_start', '2026-10-20T12:00'),
      p('break_end', '2026-10-20T13:00'),
      p('clock_out', '2026-10-20T17:00'),
    ];
    const r = calculatePeriod({ dates: ['2026-10-19', '2026-10-20'], tz: TZ, punches, expected: expectedWeekly(), justifiedDates: new Set(), rules: DEFAULT_RULES, now: NOW });
    expect(r.days[1]!.issues.find((i) => i.code === 'rest_between_shifts')?.detail).toBe('9h 00min');
    // 22h–23h é noturno: o acréscimo da hora reduzida vira excedente
    expect(r.days[0]!.nightSeconds).toBe(3600);
    expect(r.days[0]!.overtimeSeconds).toBe(r.days[0]!.nightBonusSeconds);
  });

  it('registra ausência em dia útil passado e respeita o abono', () => {
    const base = { tz: TZ, punches: [], expected: expectedWeekly(), rules: DEFAULT_RULES, now: NOW };
    const sem = calculatePeriod({ ...base, dates: ['2026-10-21'], justifiedDates: new Set() });
    expect(sem.days[0]!.absent).toBe(true);
    expect(sem.days[0]!.deficitSeconds).toBe(8 * 3600);
    const com = calculatePeriod({ ...base, dates: ['2026-10-21'], justifiedDates: new Set(['2026-10-21']) });
    expect(com.days[0]!.absent).toBe(false);
    expect(com.days[0]!.deficitSeconds).toBe(0);
    expect(com.days[0]!.justifiedSeconds).toBe(8 * 3600);
  });

  it('não aponta falta em dia futuro', () => {
    const r = calculatePeriod({ dates: ['2026-11-03'], tz: TZ, punches: [], expected: expectedWeekly(), justifiedDates: new Set(), rules: DEFAULT_RULES, now: NOW });
    expect(r.days[0]!.absent).toBe(false);
    expect(r.days[0]!.deficitSeconds).toBe(0);
  });

  it('separa trabalho em feriado', () => {
    const punches = [p('clock_in', '2026-11-02T08:00'), p('clock_out', '2026-11-02T12:00')];
    const r = calculatePeriod({ dates: ['2026-11-02'], tz: TZ, punches, expected: expectedWeekly([{ date: '2026-11-02', name: 'Finados' }]), justifiedDates: new Set(), rules: DEFAULT_RULES, now: at('2026-11-03T12:00') });
    expect(r.days[0]!.expected.kind).toBe('holiday');
    expect(r.days[0]!.restOrHolidaySeconds).toBe(4 * 3600);
    expect(r.days[0]!.overtimeSeconds).toBe(0);
    expect(r.days[0]!.issues.map((i) => i.code)).toContain('worked_on_rest_day');
  });

  it('marca jornada esquecida aberta e marcação fora de sequência', () => {
    const punches = [p('break_end', '2026-10-22T09:00'), p('clock_in', '2026-10-22T10:00')];
    const r = calculatePeriod({ dates: ['2026-10-22'], tz: TZ, punches, expected: expectedWeekly(), justifiedDates: new Set(), rules: DEFAULT_RULES, now: NOW });
    const codes = r.days[0]!.issues.map((i) => i.code);
    expect(codes).toContain('missing_clock_out');
    expect(codes).toContain('orphan_punch');
  });

  it('aponta intervalo abaixo do mínimo e aceita 30 min com acordo', () => {
    const punches = [
      p('clock_in', '2026-10-23T08:00'),
      p('break_start', '2026-10-23T12:00'),
      p('break_end', '2026-10-23T12:30'),
      p('clock_out', '2026-10-23T16:30'),
    ];
    const args = { dates: ['2026-10-23'], tz: TZ, punches, expected: expectedWeekly(), justifiedDates: new Set<string>(), now: NOW };
    expect(calculatePeriod({ ...args, rules: DEFAULT_RULES }).days[0]!.issues.map((i) => i.code)).toContain('break_below_minimum');
    expect(calculatePeriod({ ...args, rules: { ...DEFAULT_RULES, breakReductionAgreement: true } }).days[0]!.issues).toEqual([]);
  });

  it('valida divisão de intervalo de quem reside no local', () => {
    const punches = [
      p('clock_in', '2026-10-26T07:00'),
      p('break_start', '2026-10-26T10:00'),
      p('break_end', '2026-10-26T11:00'),
      p('break_start', '2026-10-26T14:00'),
      p('break_end', '2026-10-26T14:30'),
      p('clock_out', '2026-10-26T17:30'),
    ];
    const r = calculatePeriod({ dates: ['2026-10-26'], tz: TZ, punches, expected: expectedWeekly(), justifiedDates: new Set(), rules: { ...DEFAULT_RULES, residesAtWorkplace: true }, now: NOW });
    expect(r.days[0]!.issues.map((i) => i.code)).toContain('break_split_irregular');
  });

  it('considera desconsiderações e inclusões de tratamento', () => {
    const originals = [
      { id: 'a', type: 'clock_in' as const, at: at('2026-10-27T08:30') },
      { id: 'b', type: 'clock_out' as const, at: at('2026-10-27T17:00') },
    ];
    const eff = effectivePunches(originals, new Set(['a']), [{ id: 't1', type: 'clock_in', at: at('2026-10-27T08:00') }]);
    expect(eff.map((e) => e.ref)).toEqual(['t1', 'b']);
  });
});

describe('escala 12x36', () => {
  const cycle: ScheduleDef = { id: 'c', kind: 'cycle_12x36', days: [], cycleAnchorDate: '2026-10-01', cycleStart: '19:00', cycleEnd: '07:00', cycleBreakMinutes: 60 };
  const map = new Map([['c', cycle]]);
  const asg = [{ scheduleId: 'c', validFrom: '2026-10-01', validTo: null }];
  it('alterna plantão e folga e considera feriado compensado', () => {
    expect(resolveExpectedDay('2026-10-01', asg, map, []).kind).toBe('workday');
    expect(resolveExpectedDay('2026-10-02', asg, map, []).kind).toBe('rest');
    const fer = resolveExpectedDay('2026-10-03', asg, map, [{ date: '2026-10-03', name: 'X' }]);
    expect(fer.kind).toBe('workday');
    expect(fer.holidayCompensated).toBe(true);
    expect(fer.expectedSeconds).toBe(11 * 3600);
  });
  it('respeita a vigência da escala', () => {
    expect(resolveExpectedDay('2026-09-30', asg, map, []).kind).toBe('no_schedule');
  });
});

describe('compensação LC 150', () => {
  it('paga as primeiras 40 h com dedução e leva o restante ao banco', () => {
    const r = compensate('lc150_bank', 50 * 3600, 5 * 3600);
    expect(r.paidOvertimeSeconds).toBe(35 * 3600);
    expect(r.bankSeconds).toBe(10 * 3600);
  });
  it('sem acordo, todo excedente é extra', () => {
    expect(compensate('none', 3 * 3600, 0).paidOvertimeSeconds).toBe(3 * 3600);
  });
});
