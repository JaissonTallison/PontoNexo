import { daysBetween, isoWeekday, minutesOfDay } from './tempo.js';

export interface ScheduleDay {
  /** 1 = segunda … 7 = domingo */
  weekday: number;
  start: string;
  end: string;
  breakMinutes: number;
}

export interface ScheduleDef {
  id: string;
  kind: 'weekly' | 'cycle_12x36';
  days: ScheduleDay[];
  cycleAnchorDate: string | null;
  cycleStart: string | null;
  cycleEnd: string | null;
  cycleBreakMinutes: number | null;
}

export interface ScheduleAssignment {
  scheduleId: string;
  validFrom: string;
  validTo: string | null;
}

export interface HolidayDef {
  date: string;
  name: string;
}

export type ExpectedKind = 'workday' | 'rest' | 'holiday' | 'no_schedule';

export interface ExpectedDay {
  date: string;
  kind: ExpectedKind;
  expectedSeconds: number;
  start: string | null;
  end: string | null;
  breakMinutes: number;
  holidayName: string | null;
  scheduleId: string | null;
  /** Em 12x36, feriados são considerados compensados (LC 150, art. 10, § 1º). */
  holidayCompensated: boolean;
}

export function shiftSeconds(start: string, end: string, breakMinutes: number): number {
  let minutes = minutesOfDay(end) - minutesOfDay(start);
  if (minutes <= 0) minutes += 24 * 60;
  return Math.max(0, minutes - breakMinutes) * 60;
}

export function activeAssignment(assignments: ScheduleAssignment[], date: string): ScheduleAssignment | null {
  const valid = assignments.filter((a) => a.validFrom <= date && (a.validTo === null || a.validTo >= date));
  valid.sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
  return valid[0] ?? null;
}

export function resolveExpectedDay(
  date: string,
  assignments: ScheduleAssignment[],
  schedules: Map<string, ScheduleDef>,
  holidays: HolidayDef[],
): ExpectedDay {
  const holiday = holidays.find((h) => h.date === date) ?? null;
  const base: ExpectedDay = {
    date,
    kind: 'no_schedule',
    expectedSeconds: 0,
    start: null,
    end: null,
    breakMinutes: 0,
    holidayName: holiday?.name ?? null,
    scheduleId: null,
    holidayCompensated: false,
  };
  const assignment = activeAssignment(assignments, date);
  const schedule = assignment ? schedules.get(assignment.scheduleId) : undefined;
  if (!schedule) return base;
  base.scheduleId = schedule.id;

  if (schedule.kind === 'cycle_12x36') {
    if (!schedule.cycleAnchorDate || !schedule.cycleStart || !schedule.cycleEnd) return base;
    const offset = daysBetween(schedule.cycleAnchorDate, date);
    const onDuty = offset >= 0 ? offset % 2 === 0 : Math.abs(offset) % 2 === 0;
    if (!onDuty) return { ...base, kind: 'rest' };
    const br = schedule.cycleBreakMinutes ?? 60;
    return {
      ...base,
      kind: 'workday',
      expectedSeconds: shiftSeconds(schedule.cycleStart, schedule.cycleEnd, br),
      start: schedule.cycleStart,
      end: schedule.cycleEnd,
      breakMinutes: br,
      holidayCompensated: holiday !== null,
    };
  }

  if (holiday) return { ...base, kind: 'holiday' };
  const day = schedule.days.find((d) => d.weekday === isoWeekday(date));
  if (!day) return { ...base, kind: 'rest' };
  return {
    ...base,
    kind: 'workday',
    expectedSeconds: shiftSeconds(day.start, day.end, day.breakMinutes),
    start: day.start,
    end: day.end,
    breakMinutes: day.breakMinutes,
  };
}

/** Soma semanal prevista (para conferir o limite de 44 h ou 25 h do contrato). */
export function weeklyScheduledSeconds(schedule: ScheduleDef): number {
  if (schedule.kind === 'cycle_12x36') return 0;
  return schedule.days.reduce((acc, d) => acc + shiftSeconds(d.start, d.end, d.breakMinutes), 0);
}
