import { z } from 'zod';
import type { DayResult, PeriodTotals, CompensationResult } from '../dominio/jornada.js';
import { CORRECTION_KINDS, CORRECTION_STATUS, PUNCH_TYPES } from '../dominio/tipos.js';
import type { CorrectionKind, CorrectionStatus, PunchType, TreatmentKind } from '../dominio/tipos.js';
import { isoDate, isoDateTime, month, paginationQuery, reason, uuid } from './comum.js';

export const correctionCreateSchema = z
  .object({
    kind: z.enum(CORRECTION_KINDS),
    /** marcação alvo (desconsiderar / ajustar) */
    targetPunchId: uuid.nullable().optional(),
    /** inclusão / ajuste */
    proposedType: z.enum(PUNCH_TYPES).nullable().optional(),
    proposedTime: isoDateTime.nullable().optional(),
    /** abono */
    absenceDate: isoDate.nullable().optional(),
    reason,
    /** quando o empregador propõe, para qual funcionário */
    employeeId: uuid.optional(),
  })
  .superRefine((v, ctx) => {
    const need = (field: keyof typeof v, message: string) => {
      if (v[field] === null || v[field] === undefined) ctx.addIssue({ code: 'custom', path: [field], message });
    };
    if (v.kind === 'include_punch') {
      need('proposedType', 'Informe o tipo da marcação.');
      need('proposedTime', 'Informe o horário.');
    }
    if (v.kind === 'disregard_punch') need('targetPunchId', 'Escolha a marcação.');
    if (v.kind === 'replace_time') {
      need('targetPunchId', 'Escolha a marcação.');
      need('proposedTime', 'Informe o novo horário.');
    }
    if (v.kind === 'justify_absence') need('absenceDate', 'Informe a data.');
  });
export type CorrectionCreateInput = z.infer<typeof correctionCreateSchema>;

export const correctionDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().min(3, 'Explique a decisão.').max(1000),
});

export const correctionListQuery = paginationQuery.extend({
  status: z.enum([...CORRECTION_STATUS, 'all']).default('pending'),
  employeeId: uuid.optional(),
});

export interface CorrectionView {
  id: string;
  kind: CorrectionKind;
  status: CorrectionStatus;
  employeeId: string;
  employeeName: string;
  initiatedBy: 'employee' | 'employer';
  requestedByName: string;
  requestedAt: string;
  reason: string;
  targetPunch: { id: string; nsr: number; type: PunchType; serverTime: string } | null;
  proposedType: PunchType | null;
  proposedTime: string | null;
  absenceDate: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  /** o usuário atual pode decidir (não foi quem pediu e tem o papel certo) */
  canDecide: boolean;
}

export interface TreatmentView {
  id: string;
  kind: TreatmentKind;
  punchRecordId: string | null;
  punchType: PunchType | null;
  effectiveTime: string | null;
  absenceDate: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  reason: string;
  correctionRequestId: string;
  createdByName: string;
  createdAt: string;
}

export const timesheetQuery = z.object({ month });

export interface TimesheetView {
  employee: { id: string; fullName: string; cpfMasked: string; cpf: string; jobRole: string | null };
  employer: { name: string; displayName: string; document: string; address: string | null };
  month: string;
  timezone: string;
  contract: { regime: string; weeklyHours: number; compensation: string } | null;
  days: Array<
    Omit<DayResult, 'sessions' | 'orphans'> & {
      sessions: Array<{ start: string; end: string | null; breaks: Array<{ start: string; end: string | null }>; missingClockOut: boolean }>;
      orphans: Array<{ type: PunchType; at: string }>;
      punches: Array<{ ref: string; type: PunchType; at: string; source: 'original' | 'inclusion'; nsr: number | null }>;
      disregarded: Array<{ id: string; nsr: number; type: PunchType; at: string }>;
    }
  >;
  totals: PeriodTotals;
  compensation: CompensationResult;
  treatments: TreatmentView[];
  closing: ClosingView | null;
  generatedAt: string;
}

export const closingCreateSchema = z.object({ employeeId: uuid, month });
export const closingReopenSchema = z.object({ reason });

export interface ClosingView {
  id: string;
  employeeId: string;
  employeeName: string;
  month: string;
  status: 'closed' | 'reopened';
  closedAt: string;
  closedByName: string;
  snapshotHash: string;
  reopenedAt: string | null;
  reopenReason: string | null;
  acknowledgedAt: string | null;
  acknowledgementNote: string | null;
}

export const closingAckSchema = z.object({
  agree: z.boolean(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export interface MonthSummaryRow {
  employeeId: string;
  fullName: string;
  workedSeconds: number;
  expectedSeconds: number;
  overtimeSeconds: number;
  restOrHolidaySeconds: number;
  deficitSeconds: number;
  absences: number;
  nightSeconds: number;
  paidOvertimeSeconds: number;
  bankSeconds: number;
  daysWithIssues: number;
  pendingCorrections: number;
  closing: { id: string; status: 'closed' | 'reopened'; acknowledged: boolean } | null;
}

export interface MonthSummaryView {
  month: string;
  /** mês já terminou (pode ser fechado) */
  ended: boolean;
  rows: MonthSummaryRow[];
}

export const closingBatchSchema = z.object({ month });

export interface ClosingBatchResult {
  closed: number;
  skipped: Array<{ employeeId: string; fullName: string; reason: string }>;
}
