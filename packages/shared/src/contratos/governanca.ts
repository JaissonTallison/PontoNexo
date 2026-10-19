import { z } from 'zod';
import { DATA_REQUEST_KINDS, INCIDENT_KINDS, INCIDENT_SEVERITY, INCIDENT_STATUS } from '../dominio/tipos.js';
import type { DataRequestKind, DataRequestStatus, IncidentKind, IncidentSeverity, IncidentStatus } from '../dominio/tipos.js';
import { isoDate, nonEmpty, paginationQuery, uuid } from './comum.js';

export const auditListQuery = paginationQuery.extend({
  action: z.string().max(80).optional(),
  category: z.enum(['all', 'security', 'privileged', 'data', 'system']).default('all'),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export interface AuditEventView {
  id: string;
  seq: number;
  createdAt: string;
  category: string;
  action: string;
  actorName: string | null;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  hash: string;
}

export interface AuditVerification {
  valid: boolean;
  checked: number;
  firstBrokenSeq: number | null;
}

export const incidentCreateSchema = z.object({
  kind: z.enum(INCIDENT_KINDS),
  severity: z.enum(INCIDENT_SEVERITY),
  title: nonEmpty(200),
  description: z.string().trim().min(10).max(4000),
  personalDataAffected: z.boolean(),
});
export const incidentUpdateSchema = z.object({
  status: z.enum(INCIDENT_STATUS),
  note: z.string().trim().min(3).max(4000),
});
export const incidentListQuery = paginationQuery.extend({
  status: z.enum([...INCIDENT_STATUS, 'all']).default('all'),
});

export interface IncidentView {
  id: string;
  kind: IncidentKind;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  personalDataAffected: boolean;
  source: 'manual' | 'system';
  detectedAt: string;
  resolvedAt: string | null;
  createdByName: string | null;
  updates: Array<{ id: string; status: IncidentStatus; note: string; createdAt: string; authorName: string | null }>;
}

export const retentionUpdateSchema = z.object({
  policies: z
    .array(
      z.object({
        category: z.literal('punch_coordinates'),
        retentionDays: z.number().int().min(30).max(3650),
      }),
    )
    .min(1),
});

export interface RetentionPolicyView {
  category: string;
  retentionDays: number;
  action: 'delete' | 'anonymize';
  legalBasis: string;
  editable: boolean;
  description: string;
}

export const integrationCreateSchema = z.object({
  name: nonEmpty(120),
  kind: z.literal('webhook'),
  url: z.url({ protocol: /^https?$/ }).max(500),
  secret: z.string().min(24, 'Use um segredo com ao menos 24 caracteres.').max(200),
  events: z.array(z.enum(['punch.accepted', 'treatment.created', 'closing.closed'])).min(1),
});
export const integrationUpdateSchema = z.object({ active: z.boolean() });

export interface IntegrationView {
  id: string;
  name: string;
  kind: 'webhook';
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  lastDeliveryAt: string | null;
  lastStatus: string | null;
  pendingDeliveries: number;
  failedDeliveries: number;
}

export const dataRequestCreateSchema = z.object({
  kind: z.enum(DATA_REQUEST_KINDS),
  details: z.string().trim().min(5).max(2000),
});
export const dataRequestRespondSchema = z.object({
  status: z.enum(['answered', 'denied']),
  response: z.string().trim().min(10).max(4000),
});

export interface DataRequestView {
  id: string;
  kind: DataRequestKind;
  status: DataRequestStatus;
  details: string;
  requesterName: string;
  createdAt: string;
  dueAt: string;
  respondedAt: string | null;
  response: string | null;
}

export interface DashboardView {
  working: Array<{ employeeId: string; fullName: string; state: 'working' | 'on_break'; since: string }>;
  activeEmployees: number;
  openAlerts: number;
  pendingCorrections: number;
  awaitingEmployee: number;
  openIncidents: number;
  openDataRequests: number;
  clockStatus: string;
  recentPunches: Array<{ id: string; employeeName: string; type: string; serverTime: string; geoStatus: string; hasAlerts: boolean }>;
}

export const alertReviewSchema = z.object({ note: z.string().trim().min(3).max(1000) });
export const alertListQuery = paginationQuery.extend({
  status: z.enum(['open', 'reviewed', 'all']).default('open'),
  employeeId: uuid.optional(),
});
