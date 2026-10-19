import { localDate } from '@pontonexo/shared';
import type { Page } from '@pontonexo/shared';

export const todayIn = (tz: string) => localDate(new Date(), tz);

export const toPage = <T>(items: T[], total: number, q: { page: number; pageSize: number }): Page<T> => ({
  items,
  total,
  page: q.page,
  pageSize: q.pageSize,
});

export const offsetOf = (q: { page: number; pageSize: number }) => (q.page - 1) * q.pageSize;

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Nomes dos campos alterados (para auditoria sem expor valores pessoais). */
export function changedFields<T extends Record<string, unknown>>(before: T, after: Partial<T>): string[] {
  return Object.keys(after).filter((k) => after[k] !== undefined && JSON.stringify(after[k]) !== JSON.stringify(before[k]));
}
