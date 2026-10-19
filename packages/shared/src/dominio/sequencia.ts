import type { PunchType } from './tipos.js';

/** Estado da jornada do funcionário, derivado da última marcação. */
export type SessionState = 'none' | 'working' | 'on_break';

export function stateAfter(type: PunchType): SessionState {
  switch (type) {
    case 'clock_in':
    case 'break_end':
      return 'working';
    case 'break_start':
      return 'on_break';
    case 'clock_out':
      return 'none';
  }
}

export function allowedNext(state: SessionState): PunchType[] {
  switch (state) {
    case 'none':
      return ['clock_in'];
    case 'working':
      return ['break_start', 'clock_out'];
    case 'on_break':
      return ['break_end'];
  }
}

export type SequenceCheck = { ok: true } | { ok: false; message: string };

const MESSAGES: Record<SessionState, string> = {
  none: 'Não há jornada aberta. A próxima marcação deve ser a entrada.',
  working: 'A jornada já está aberta. Registre início de intervalo ou saída.',
  on_break: 'O intervalo está em andamento. Registre o fim do intervalo antes de outra marcação.',
};

export function checkSequence(state: SessionState, type: PunchType): SequenceCheck {
  return allowedNext(state).includes(type) ? { ok: true } : { ok: false, message: MESSAGES[state] };
}

/** Jornada aberta há mais tempo que isso é considerada esquecida (sem saída). */
export const STALE_SESSION_HOURS = 20;
/** Intervalo mínimo entre duas marcações do mesmo funcionário. */
export const MIN_SECONDS_BETWEEN_PUNCHES = 30;
/** Diferença entre relógio do aparelho e do servidor que gera ocorrência. */
export const DEVICE_CLOCK_TOLERANCE_SECONDS = 300;
