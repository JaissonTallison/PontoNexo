import { DateTime } from 'luxon';

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** Data local (AAAA-MM-DD) de um instante no fuso informado. */
export function localDate(instant: Date, tz: string): string {
  return DateTime.fromJSDate(instant, { zone: tz }).toISODate() ?? '';
}

/** Instante UTC correspondente a uma data e hora local ("HH:MM") no fuso. */
export function localToInstant(date: string, time: string, tz: string): Date {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: tz });
  if (!dt.isValid) throw new Error(`Data/hora inválida: ${date} ${time}`);
  return dt.toJSDate();
}

export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: 'UTC' }).plus({ days }).toISODate() ?? date;
}

/** Dia da semana ISO: 1 = segunda … 7 = domingo. */
export function isoWeekday(date: string): number {
  return DateTime.fromISO(date, { zone: 'UTC' }).weekday;
}

export function daysBetween(from: string, to: string): number {
  return Math.round(DateTime.fromISO(to, { zone: 'UTC' }).diff(DateTime.fromISO(from, { zone: 'UTC' }), 'days').days);
}

/** Lista as datas de um mês "AAAA-MM". */
export function monthDays(month: string): string[] {
  const start = DateTime.fromISO(`${month}-01`, { zone: 'UTC' });
  if (!start.isValid) throw new Error(`Mês inválido: ${month}`);
  const out: string[] = [];
  for (let d = start; d.month === start.month; d = d.plus({ days: 1 })) out.push(d.toISODate() ?? '');
  return out;
}

/** Intervalo UTC [início, fim) de um mês no fuso. */
export function monthRange(month: string, tz: string): { from: Date; to: Date } {
  const start = DateTime.fromISO(`${month}-01T00:00`, { zone: tz });
  return { from: start.toJSDate(), to: start.plus({ months: 1 }).toJSDate() };
}

export function minutesOfDay(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** "7h 05min" a partir de segundos (sinal preservado). */
export function formatDuration(seconds: number): string {
  const sign = seconds < 0 ? '−' : '';
  const total = Math.floor(Math.abs(seconds) / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${sign}${h}h ${String(m).padStart(2, '0')}min`;
}

export function formatLocalDateTime(instant: Date | string, tz: string, withSeconds = false): string {
  const dt = DateTime.fromJSDate(typeof instant === 'string' ? new Date(instant) : instant, { zone: tz });
  return dt.setLocale('pt-BR').toFormat(withSeconds ? 'dd/MM/yyyy HH:mm:ss' : 'dd/MM/yyyy HH:mm');
}

export function formatLocalTime(instant: Date | string, tz: string, withSeconds = false): string {
  const dt = DateTime.fromJSDate(typeof instant === 'string' ? new Date(instant) : instant, { zone: tz });
  return dt.toFormat(withSeconds ? 'HH:mm:ss' : 'HH:mm');
}

export function formatDateBR(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

export function weekdayShort(date: string): string {
  return ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'][isoWeekday(date)] ?? '';
}
