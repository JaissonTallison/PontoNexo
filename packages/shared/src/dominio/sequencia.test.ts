import { describe, expect, it } from 'vitest';
import { isValidCpf } from './documentos.js';
import { nationalHolidays } from './feriados.js';
import { allowedNext, checkSequence, stateAfter } from './sequencia.js';
import { localDate, monthDays, monthRange } from './tempo.js';

describe('sequência de marcações', () => {
  it('permite múltiplos intervalos e exige fechar o intervalo antes da saída', () => {
    let s = stateAfter('clock_in');
    expect(allowedNext(s)).toEqual(['break_start', 'clock_out']);
    s = stateAfter('break_start');
    expect(checkSequence(s, 'clock_out').ok).toBe(false);
    s = stateAfter('break_end');
    expect(checkSequence(s, 'break_start').ok).toBe(true);
    expect(checkSequence('none', 'break_start').ok).toBe(false);
    expect(checkSequence('working', 'clock_in').ok).toBe(false);
  });
});

describe('utilitários', () => {
  it('valida CPF', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('529.982.247-26')).toBe(false);
  });
  it('converte instante UTC para a data local do fuso', () => {
    expect(localDate(new Date('2026-10-20T02:30:00Z'), 'America/Sao_Paulo')).toBe('2026-10-19');
    expect(localDate(new Date('2026-10-20T02:30:00Z'), 'America/Manaus')).toBe('2026-10-19');
    expect(localDate(new Date('2026-10-20T04:30:00Z'), 'America/Manaus')).toBe('2026-10-20');
  });
  it('gera os dias e o intervalo do mês', () => {
    expect(monthDays('2028-02')).toHaveLength(29);
    const r = monthRange('2026-10', 'America/Sao_Paulo');
    expect(r.from.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });
  it('inclui 20 de novembro a partir de 2024', () => {
    expect(nationalHolidays(2023).some((h) => h.date === '2023-11-20')).toBe(false);
    expect(nationalHolidays(2026).some((h) => h.date === '2026-11-20')).toBe(true);
  });
});
