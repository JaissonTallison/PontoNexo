import { formatDuration, formatLocalDateTime, formatLocalTime } from '@pontonexo/shared';

export const hora = (iso: string | null | undefined, tz: string, segundos = false) => (iso ? formatLocalTime(iso, tz, segundos) : '—');
export const dataHora = (iso: string | null | undefined, tz: string, segundos = false) => (iso ? formatLocalDateTime(iso, tz, segundos) : '—');
export const dataCurta = (iso: string | null | undefined, tz: string) => (iso ? formatLocalDateTime(iso, tz).slice(0, 10) : '—');
export const duracao = (s: number) => formatDuration(s);

export function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

export function mesAtual(tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
}

export function mesAnterior(m: string) {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
}

export function nomeMes(m: string) {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  const nome = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, 1)));
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${y}`;
}

export function hojeLocal(tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}
