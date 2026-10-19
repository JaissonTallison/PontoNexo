import { z } from 'zod';
import type { SessionState } from '../dominio/sequencia.js';
import { POSITION_OUTCOME, PUNCH_TYPES } from '../dominio/tipos.js';
import type { AlertCode, ClockStatus, GeoStatus, LocationKind, PunchOrigin, PunchType } from '../dominio/tipos.js';
import { isoDate, isoDateTime, paginationQuery, uuid } from './comum.js';

export const punchCreateSchema = z.object({
  /** Gerado no aparelho; reenvio com o mesmo id devolve a mesma marcação. */
  clientRequestId: uuid,
  type: z.enum(PUNCH_TYPES),
  /** Local escolhido pelo funcionário; null = "outro local" (exige justificativa). */
  locationId: uuid.nullable(),
  positionOutcome: z.enum(POSITION_OUTCOME),
  position: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracyM: z.number().min(0).max(100_000),
    })
    .nullable(),
  /** Hora do aparelho no momento do toque (só evidência). */
  deviceTime: isoDateTime,
  deviceTimezone: z.string().max(60).nullable(),
  /** true quando a tentativa ficou na fila sem conexão e foi enviada depois. */
  offline: z.boolean().default(false),
  networkType: z.string().max(30).nullable().optional(),
  justification: z.string().trim().max(500).nullable().optional(),
});
export type PunchCreateInput = z.infer<typeof punchCreateSchema>;

export const punchListQuery = paginationQuery.extend({
  employeeId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  withAlerts: z.enum(['all', 'only']).default('all'),
});

export interface AuthorizedLocationView {
  id: string;
  name: string;
  kind: LocationKind;
  geofence: { lat: number; lng: number; radiusM: number } | null;
}

export interface PunchAlertView {
  id: string;
  code: AlertCode;
  detail: string | null;
  status: 'open' | 'reviewed';
  reviewNote: string | null;
}

export interface PunchView {
  id: string;
  nsr: number;
  type: PunchType;
  serverTime: string;
  deviceTime: string | null;
  origin: PunchOrigin;
  clockStatus: ClockStatus;
  locationId: string | null;
  locationName: string | null;
  geoStatus: GeoStatus;
  distanceM: number | null;
  accuracyM: number | null;
  justification: string | null;
  disregarded: boolean;
  alerts: PunchAlertView[];
  receiptCode: string;
  employeeId: string;
  employeeName: string;
}

export interface PunchContextView {
  employee: { id: string; fullName: string };
  employerName: string;
  timezone: string;
  serverTime: string;
  clockStatus: ClockStatus;
  state: SessionState;
  allowedNext: PunchType[];
  staleSession: boolean;
  today: PunchView[];
  locations: AuthorizedLocationView[];
  hasActiveContract: boolean;
  pendingCorrections: number;
  pendingAcknowledgements: number;
}

export interface PunchResultView {
  punch: PunchView;
  receipt: ReceiptView;
  replayed: boolean;
}

export interface ReceiptPayload {
  title: 'Comprovante de Registro de Ponto do Trabalhador';
  version: 1;
  nsr: number;
  employer: { name: string; document: string };
  employee: { name: string; cpf: string };
  punchType: PunchType;
  serverTimeUtc: string;
  localTime: string;
  timezone: string;
  location: string | null;
  geoStatus: GeoStatus;
  origin: PunchOrigin;
  punchHash: string;
  system: { name: 'PontoNexo'; version: string; modality: string };
}

export interface ReceiptView {
  id: string;
  code: string;
  issuedAt: string;
  payload: ReceiptPayload;
  hash: string;
  signature: string;
  keyId: string;
  algorithm: 'Ed25519';
}

export interface ReceiptVerification {
  valid: boolean;
  reason: string;
  receipt: Pick<ReceiptView, 'code' | 'issuedAt' | 'hash' | 'keyId'> & {
    nsr: number;
    punchType: PunchType;
    localTime: string;
    employerName: string;
  } | null;
}

export interface TimeView {
  serverTime: string;
  clockStatus: ClockStatus;
  lastCheckAt: string | null;
  lastOffsetMs: number | null;
  source: string | null;
}
