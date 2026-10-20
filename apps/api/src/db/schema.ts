/**
 * Esquema relacional do PontoNexo. Convenções:
 * - chaves UUID (gen_random_uuid), instantes em timestamptz (UTC), datas civis em `date`;
 * - colunas em snake_case (drizzle `casing`);
 * - tabelas com employer_id ficam sob RLS (migração 0001_seguranca.sql);
 * - punch_records, receipts, treatments e audit_events são somente-inclusão (gatilhos + permissões).
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  ALERT_CODES,
  CLOCK_STATUS,
  COMPENSATION_REGIMES,
  CONTRACT_REGIMES,
  CORRECTION_KINDS,
  CORRECTION_STATUS,
  DATA_REQUEST_KINDS,
  DATA_REQUEST_STATUS,
  GEO_STATUS,
  INCIDENT_KINDS,
  INCIDENT_SEVERITY,
  INCIDENT_STATUS,
  LOCATION_KINDS,
  POSITION_OUTCOME,
  PUNCH_ORIGIN,
  PUNCH_TYPES,
  TREATMENT_KINDS,
} from '@pontonexo/shared';

const id = () => uuid().primaryKey().defaultRandom();
const ts = () => timestamp({ withTimezone: true, mode: 'date' });
const createdAt = () => ts().notNull().defaultNow();

export const punchTypeEnum = pgEnum('punch_type', PUNCH_TYPES);
export const geoStatusEnum = pgEnum('geo_status', GEO_STATUS);
export const positionOutcomeEnum = pgEnum('position_outcome', POSITION_OUTCOME);
export const alertCodeEnum = pgEnum('alert_code', ALERT_CODES);
export const clockStatusEnum = pgEnum('clock_status', CLOCK_STATUS);
export const punchOriginEnum = pgEnum('punch_origin', PUNCH_ORIGIN);
export const locationKindEnum = pgEnum('location_kind', LOCATION_KINDS);
export const contractRegimeEnum = pgEnum('contract_regime', CONTRACT_REGIMES);
export const compensationEnum = pgEnum('compensation_regime', COMPENSATION_REGIMES);
export const correctionKindEnum = pgEnum('correction_kind', CORRECTION_KINDS);
export const correctionStatusEnum = pgEnum('correction_status', CORRECTION_STATUS);
export const treatmentKindEnum = pgEnum('treatment_kind', TREATMENT_KINDS);
export const incidentKindEnum = pgEnum('incident_kind', INCIDENT_KINDS);
export const incidentSeverityEnum = pgEnum('incident_severity', INCIDENT_SEVERITY);
export const incidentStatusEnum = pgEnum('incident_status', INCIDENT_STATUS);
export const dataRequestKindEnum = pgEnum('data_request_kind', DATA_REQUEST_KINDS);
export const dataRequestStatusEnum = pgEnum('data_request_status', DATA_REQUEST_STATUS);

// ───────────────────────────── Identidade ─────────────────────────────

export const employers = pgTable('employers', {
  id: id(),
  displayName: text().notNull(),
  legalName: text().notNull(),
  /** Empregador doméstico é pessoa física: CPF (somente dígitos). */
  documentCpf: text().notNull(),
  timezone: text().notNull().default('America/Sao_Paulo'),
  addressLine: text(),
  city: text(),
  state: text(),
  createdAt: createdAt(),
  updatedAt: createdAt(),
});

export const roles = pgTable('roles', {
  code: text().primaryKey(),
  name: text().notNull(),
  description: text().notNull(),
});

export const users = pgTable(
  'users',
  {
    id: id(),
    name: text().notNull(),
    email: text().notNull(),
    /** null enquanto o convite não foi aceito */
    passwordHash: text(),
    status: text({ enum: ['active', 'disabled'] }).notNull().default('active'),
    failedLogins: integer().notNull().default(0),
    lockedUntil: ts(),
    lastLoginAt: ts(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [uniqueIndex('users_email_uq').on(sql`lower(${t.email})`)],
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    roleCode: text()
      .notNull()
      .references(() => roles.code),
    employeeId: uuid().references(() => employees.id),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    createdByUserId: uuid().references(() => users.id),
  },
  (t) => [
    uniqueIndex('user_roles_user_employer_uq').on(t.userId, t.employerId),
    check('user_roles_employee_link', sql`(${t.roleCode} = 'employee') = (${t.employeeId} IS NOT NULL)`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    /** SHA-256 do token opaco; o token em si só existe no cookie */
    tokenHash: text().notNull(),
    csrfToken: text().notNull(),
    activeUserRoleId: uuid().references(() => userRoles.id),
    ipAddress: inet(),
    userAgent: text(),
    createdAt: createdAt(),
    lastSeenAt: createdAt(),
    expiresAt: ts().notNull(),
    revokedAt: ts(),
  },
  (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    tokenHash: text().notNull(),
    purpose: text({ enum: ['reset', 'invite'] }).notNull(),
    expiresAt: ts().notNull(),
    usedAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('prt_token_uq').on(t.tokenHash)],
);

// ───────────────────────────── Cadastros ─────────────────────────────

export const jobRoles = pgTable(
  'job_roles',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    name: text().notNull(),
    description: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('job_roles_name_uq').on(t.employerId, sql`lower(${t.name})`)],
);

export const employees = pgTable(
  'employees',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    fullName: text().notNull(),
    cpf: text().notNull(),
    email: text(),
    phone: text(),
    jobRoleId: uuid().references(() => jobRoles.id),
    status: text({ enum: ['active', 'inactive'] }).notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [uniqueIndex('employees_cpf_uq').on(t.employerId, t.cpf), index('employees_employer_idx').on(t.employerId, t.status)],
);

export const employmentContracts = pgTable(
  'employment_contracts',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id),
    jobRoleId: uuid().references(() => jobRoles.id),
    startDate: date({ mode: 'string' }).notNull(),
    endDate: date({ mode: 'string' }),
    regime: contractRegimeEnum().notNull(),
    weeklyMinutes: integer().notNull(),
    residesAtWorkplace: boolean().notNull().default(false),
    breakReductionAgreement: boolean().notNull().default(false),
    compensation: compensationEnum().notNull().default('none'),
    travelAgreement: boolean().notNull().default(false),
    writtenAgreementRef: text(),
    notes: text(),
    endReason: text(),
    createdAt: createdAt(),
    createdByUserId: uuid().references(() => users.id),
  },
  (t) => [
    index('contracts_employee_idx').on(t.employeeId, t.startDate),
    check('contracts_dates', sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`),
    check('contracts_weekly', sql`${t.weeklyMinutes} BETWEEN 60 AND 2640`),
  ],
);

export const workLocations = pgTable('work_locations', {
  id: id(),
  employerId: uuid()
    .notNull()
    .references(() => employers.id),
  name: text().notNull(),
  kind: locationKindEnum().notNull(),
  addressLine: text(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
});

export const geofences = pgTable(
  'geofences',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    locationId: uuid()
      .notNull()
      .references(() => workLocations.id),
    centerLat: numeric({ precision: 9, scale: 6, mode: 'number' }).notNull(),
    centerLng: numeric({ precision: 9, scale: 6, mode: 'number' }).notNull(),
    radiusM: integer().notNull(),
    validFrom: date({ mode: 'string' }).notNull(),
    validTo: date({ mode: 'string' }),
    createdAt: createdAt(),
    createdByUserId: uuid().references(() => users.id),
  },
  (t) => [
    index('geofences_location_idx').on(t.locationId, t.validFrom),
    check('geofences_radius', sql`${t.radiusM} BETWEEN 25 AND 5000`),
    check('geofences_lat', sql`${t.centerLat} BETWEEN -90 AND 90`),
    check('geofences_lng', sql`${t.centerLng} BETWEEN -180 AND 180`),
  ],
);

export const employeeWorkLocations = pgTable(
  'employee_work_locations',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id),
    locationId: uuid()
      .notNull()
      .references(() => workLocations.id),
    validFrom: date({ mode: 'string' }).notNull(),
    validTo: date({ mode: 'string' }),
    /** revogação imediata, sem apagar o histórico da autorização */
    revokedAt: ts(),
    revokedByUserId: uuid().references(() => users.id),
    createdAt: createdAt(),
    createdByUserId: uuid().references(() => users.id),
  },
  (t) => [index('ewl_employee_idx').on(t.employeeId), check('ewl_dates', sql`${t.validTo} IS NULL OR ${t.validTo} >= ${t.validFrom}`)],
);

export const workSchedules = pgTable('work_schedules', {
  id: id(),
  employerId: uuid()
    .notNull()
    .references(() => employers.id),
  name: text().notNull(),
  kind: text({ enum: ['weekly', 'cycle_12x36'] }).notNull(),
  cycleAnchorDate: date({ mode: 'string' }),
  cycleStart: text(),
  cycleEnd: text(),
  cycleBreakMinutes: integer(),
  notes: text(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
});

export const workScheduleDays = pgTable(
  'work_schedule_days',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    scheduleId: uuid()
      .notNull()
      .references(() => workSchedules.id),
    weekday: smallint().notNull(),
    start: text().notNull(),
    end: text().notNull(),
    breakMinutes: integer().notNull(),
  },
  (t) => [uniqueIndex('wsd_schedule_weekday_uq').on(t.scheduleId, t.weekday), check('wsd_weekday', sql`${t.weekday} BETWEEN 1 AND 7`)],
);

export const employeeSchedules = pgTable(
  'employee_schedules',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id),
    scheduleId: uuid()
      .notNull()
      .references(() => workSchedules.id),
    validFrom: date({ mode: 'string' }).notNull(),
    validTo: date({ mode: 'string' }),
    createdAt: createdAt(),
    createdByUserId: uuid().references(() => users.id),
  },
  (t) => [index('es_employee_idx').on(t.employeeId, t.validFrom)],
);

export const holidays = pgTable(
  'holidays',
  {
    id: id(),
    /** Só feriados do empregador (estaduais, municipais, outros). Os nacionais vêm do código (shared/feriados). */
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    date: date({ mode: 'string' }).notNull(),
    name: text().notNull(),
    scope: text({ enum: ['state', 'municipal', 'other'] }).notNull(),
    createdAt: createdAt(),
    createdByUserId: uuid().references(() => users.id),
  },
  (t) => [uniqueIndex('holidays_uq').on(t.employerId, t.date)],
);

// ───────────────────────────── Registro ─────────────────────────────

/** Contadores por empregador: NSR e últimos hashes das cadeias. Linha bloqueada (FOR UPDATE) em cada marcação. */
export const employerCounters = pgTable('employer_counters', {
  employerId: uuid()
    .primaryKey()
    .references(() => employers.id),
  lastNsr: bigint({ mode: 'number' }).notNull().default(0),
  lastPunchHash: text().notNull().default('GENESIS'),
  lastTreatmentHash: text().notNull().default('GENESIS'),
});

/** Estado operacional da jornada aberta. Derivado; o espelho é sempre recalculado das marcações. */
export const workSessions = pgTable(
  'work_sessions',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id),
    referenceDate: date({ mode: 'string' }).notNull(),
    state: text({ enum: ['working', 'on_break', 'closed', 'abandoned'] }).notNull(),
    startedAt: ts().notNull(),
    endedAt: ts(),
    lastPunchAt: ts().notNull(),
    updatedAt: createdAt(),
  },
  (t) => [
    uniqueIndex('work_sessions_one_open_uq')
      .on(t.employeeId)
      .where(sql`${t.state} IN ('working', 'on_break')`),
    index('work_sessions_employee_idx').on(t.employeeId, t.startedAt),
  ],
);

export const punchRecords = pgTable(
  'punch_records',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id),
    workSessionId: uuid()
      .notNull()
      .references(() => workSessions.id),
    /** Número sequencial de registro, por empregador, a partir de 1 */
    nsr: bigint({ mode: 'number' }).notNull(),
    type: punchTypeEnum().notNull(),
    /** Hora oficial: relógio do servidor no recebimento */
    serverTime: ts().notNull(),
    deviceTime: ts(),
    deviceTimezone: text(),
    origin: punchOriginEnum().notNull(),
    clockStatus: clockStatusEnum().notNull(),
    clockOffsetMs: integer(),
    locationId: uuid().references(() => workLocations.id),
    locationName: text(),
    /** cerca (e raio) vigente na avaliação */
    geofenceId: uuid().references(() => geofences.id),
    positionOutcome: positionOutcomeEnum().notNull(),
    lat: numeric({ precision: 9, scale: 6, mode: 'number' }),
    lng: numeric({ precision: 9, scale: 6, mode: 'number' }),
    accuracyM: numeric({ precision: 10, scale: 1, mode: 'number' }),
    /** SHA-256 de lat|lng|precisão: mantém a cadeia verificável depois que a retenção remove as coordenadas */
    geoDigest: text().notNull(),
    geoStatus: geoStatusEnum().notNull(),
    distanceM: integer(),
    networkType: text(),
    ipAddress: inet(),
    userAgent: text(),
    clientRequestId: uuid().notNull(),
    justification: text(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    prevHash: text().notNull(),
    hash: text().notNull(),
    /** preenchido pela política de retenção ao reduzir coordenadas ao resultado */
    coordinatesPurgedAt: ts(),
  },
  (t) => [
    uniqueIndex('punch_records_nsr_uq').on(t.employerId, t.nsr),
    uniqueIndex('punch_records_request_uq').on(t.employeeId, t.clientRequestId),
    index('punch_records_employee_time_idx').on(t.employeeId, t.serverTime),
    index('punch_records_employer_time_idx').on(t.employerId, t.serverTime),
  ],
);

export const receipts = pgTable(
  'receipts',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    punchRecordId: uuid()
      .notNull()
      .references(() => punchRecords.id),
    /** código curto para verificação pública */
    code: text().notNull(),
    payload: jsonb().notNull(),
    hash: text().notNull(),
    signature: text().notNull(),
    keyId: text().notNull(),
    issuedAt: createdAt(),
  },
  (t) => [uniqueIndex('receipts_punch_uq').on(t.punchRecordId), uniqueIndex('receipts_code_uq').on(t.code)],
);

export const punchAlerts = pgTable(
  'punch_alerts',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id),
    punchRecordId: uuid()
      .notNull()
      .references(() => punchRecords.id),
    code: alertCodeEnum().notNull(),
    detail: text(),
    status: text({ enum: ['open', 'reviewed'] }).notNull().default('open'),
    reviewedByUserId: uuid().references(() => users.id),
    reviewedAt: ts(),
    reviewNote: text(),
    createdAt: createdAt(),
  },
  (t) => [index('punch_alerts_status_idx').on(t.employerId, t.status), index('punch_alerts_punch_idx').on(t.punchRecordId)],
);

// ───────────────────────────── Tratamento ─────────────────────────────

export const correctionRequests = pgTable(
  'correction_requests',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id),
    kind: correctionKindEnum().notNull(),
    status: correctionStatusEnum().notNull().default('pending'),
    initiatedBy: text({ enum: ['employee', 'employer'] }).notNull(),
    requestedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    targetPunchId: uuid().references(() => punchRecords.id),
    proposedType: punchTypeEnum(),
    proposedTime: ts(),
    absenceDate: date({ mode: 'string' }),
    reason: text().notNull(),
    decidedByUserId: uuid().references(() => users.id),
    decidedAt: ts(),
    decisionReason: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index('corrections_status_idx').on(t.employerId, t.status),
    index('corrections_employee_idx').on(t.employeeId, t.createdAt),
    check('corrections_decider', sql`${t.decidedByUserId} IS NULL OR ${t.decidedByUserId} <> ${t.requestedByUserId}`),
  ],
);

export const treatments = pgTable(
  'treatments',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id),
    correctionRequestId: uuid()
      .notNull()
      .references(() => correctionRequests.id),
    kind: treatmentKindEnum().notNull(),
    /** marcação desconsiderada */
    punchRecordId: uuid().references(() => punchRecords.id),
    /** marcação incluída */
    punchType: punchTypeEnum(),
    effectiveTime: ts(),
    absenceDate: date({ mode: 'string' }),
    previousValue: jsonb(),
    newValue: jsonb(),
    reason: text().notNull(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    prevHash: text().notNull(),
    hash: text().notNull(),
  },
  (t) => [
    index('treatments_employee_idx').on(t.employeeId, t.createdAt),
    uniqueIndex('treatments_disregard_uq')
      .on(t.punchRecordId)
      .where(sql`${t.kind} = 'disregard'`),
    check(
      'treatments_shape',
      sql`(${t.kind} = 'inclusion' AND ${t.punchType} IS NOT NULL AND ${t.effectiveTime} IS NOT NULL)
       OR (${t.kind} = 'disregard' AND ${t.punchRecordId} IS NOT NULL)
       OR (${t.kind} = 'absence_justification' AND ${t.absenceDate} IS NOT NULL)`,
    ),
  ],
);

export const monthlyClosings = pgTable(
  'monthly_closings',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id),
    month: text().notNull(),
    status: text({ enum: ['closed', 'reopened'] }).notNull().default('closed'),
    closedAt: createdAt(),
    closedByUserId: uuid()
      .notNull()
      .references(() => users.id),
    snapshot: jsonb().notNull(),
    snapshotHash: text().notNull(),
    reopenedAt: ts(),
    reopenedByUserId: uuid().references(() => users.id),
    reopenReason: text(),
  },
  (t) => [
    uniqueIndex('closings_one_closed_uq')
      .on(t.employeeId, t.month)
      .where(sql`${t.status} = 'closed'`),
    check('closings_month', sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
);

export const closingAcknowledgements = pgTable(
  'closing_acknowledgements',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    closingId: uuid()
      .notNull()
      .references(() => monthlyClosings.id),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id),
    agree: boolean().notNull(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('closing_ack_uq').on(t.closingId)],
);

// ───────────────────────────── Governança ─────────────────────────────

export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    /** null = evento da plataforma (sem empregador) */
    employerId: uuid().references(() => employers.id),
    seq: bigint({ mode: 'number' }).notNull(),
    category: text({ enum: ['security', 'privileged', 'data', 'system'] }).notNull(),
    action: text().notNull(),
    actorUserId: uuid().references(() => users.id),
    entityType: text(),
    entityId: uuid(),
    summary: text().notNull(),
    ipAddress: inet(),
    /** nunca coordenadas, CPF ou senhas */
    metadata: jsonb().notNull().default({}),
    prevHash: text().notNull(),
    hash: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('audit_seq_uq').on(t.employerId, t.seq).nullsNotDistinct(),
    index('audit_employer_time_idx').on(t.employerId, t.createdAt),
    index('audit_action_idx').on(t.action),
  ],
);

export const incidents = pgTable(
  'incidents',
  {
    id: id(),
    employerId: uuid().references(() => employers.id),
    kind: incidentKindEnum().notNull(),
    severity: incidentSeverityEnum().notNull(),
    status: incidentStatusEnum().notNull().default('open'),
    title: text().notNull(),
    description: text().notNull(),
    personalDataAffected: boolean().notNull().default(false),
    source: text({ enum: ['manual', 'system'] }).notNull(),
    /** evita abrir o mesmo incidente automático duas vezes */
    dedupeKey: text(),
    detectedAt: createdAt(),
    resolvedAt: ts(),
    createdByUserId: uuid().references(() => users.id),
  },
  (t) => [
    uniqueIndex('incidents_dedupe_uq')
      .on(t.dedupeKey)
      .where(sql`${t.status} <> 'resolved' AND ${t.dedupeKey} IS NOT NULL`),
    index('incidents_status_idx').on(t.employerId, t.status),
  ],
);

export const incidentUpdates = pgTable('incident_updates', {
  id: id(),
  incidentId: uuid()
    .notNull()
    .references(() => incidents.id),
  employerId: uuid().references(() => employers.id),
  status: incidentStatusEnum().notNull(),
  note: text().notNull(),
  authorUserId: uuid().references(() => users.id),
  createdAt: createdAt(),
});

export const timeSyncChecks = pgTable(
  'time_sync_checks',
  {
    id: id(),
    checkedAt: createdAt(),
    server: text().notNull(),
    offsetMs: integer(),
    roundTripMs: integer(),
    ok: boolean().notNull(),
    error: text(),
  },
  (t) => [index('time_sync_checked_idx').on(t.checkedAt)],
);

export const integrations = pgTable('integrations', {
  id: id(),
  employerId: uuid()
    .notNull()
    .references(() => employers.id),
  name: text().notNull(),
  kind: text({ enum: ['webhook'] }).notNull(),
  url: text().notNull(),
  /** AES-256-GCM com APP_ENCRYPTION_KEY */
  secretEncrypted: text().notNull(),
  events: text().array().notNull(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
  createdByUserId: uuid().references(() => users.id),
});

export const integrationOutbox = pgTable(
  'integration_outbox',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    integrationId: uuid()
      .notNull()
      .references(() => integrations.id),
    eventType: text().notNull(),
    payload: jsonb().notNull(),
    status: text({ enum: ['pending', 'sent', 'failed'] }).notNull().default('pending'),
    attempts: integer().notNull().default(0),
    nextAttemptAt: createdAt(),
    lastError: text(),
    lastStatusCode: integer(),
    createdAt: createdAt(),
    sentAt: ts(),
  },
  (t) => [index('outbox_pending_idx').on(t.status, t.nextAttemptAt)],
);

export const retentionPolicies = pgTable(
  'retention_policies',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    category: text().notNull(),
    retentionDays: integer().notNull(),
    updatedAt: createdAt(),
    updatedByUserId: uuid().references(() => users.id),
  },
  (t) => [uniqueIndex('retention_uq').on(t.employerId, t.category)],
);

export const dataSubjectRequests = pgTable(
  'data_subject_requests',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id),
    requesterUserId: uuid()
      .notNull()
      .references(() => users.id),
    kind: dataRequestKindEnum().notNull(),
    status: dataRequestStatusEnum().notNull().default('open'),
    details: text().notNull(),
    response: text(),
    createdAt: createdAt(),
    dueAt: ts().notNull(),
    respondedAt: ts(),
    respondedByUserId: uuid().references(() => users.id),
  },
  (t) => [index('dsr_status_idx').on(t.employerId, t.status)],
);

export const privacyAcknowledgements = pgTable(
  'privacy_acknowledgements',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    version: text().notNull(),
    acknowledgedAt: createdAt(),
  },
  (t) => [uniqueIndex('privacy_ack_uq').on(t.userId, t.employerId, t.version)],
);

// ───────────────────────────── Acesso pelo celular, passkeys e notificações ─────────────────────────────

/** Inscrições de notificação (Web Push) por aparelho. */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    userAgent: text(),
    createdAt: createdAt(),
    lastSuccessAt: ts(),
    failures: integer().notNull().default(0),
  },
  (t) => [uniqueIndex('push_endpoint_uq').on(t.endpoint), index('push_user_idx').on(t.userId)],
);

/** Lembrete já enviado no dia (evita repetir). */
export const remindersSent = pgTable(
  'reminders_sent',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    employeeId: uuid()
      .notNull()
      .references(() => employees.id),
    date: date({ mode: 'string' }).notNull(),
    kind: text({ enum: ['missing_clock_in', 'missing_clock_out'] }).notNull(),
    sentAt: createdAt(),
  },
  (t) => [uniqueIndex('reminders_uq').on(t.employeeId, t.date, t.kind)],
);

/** O funcionário viu a decisão do pedido (para o sino de avisos). */
export const correctionReads = pgTable(
  'correction_reads',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    correctionRequestId: uuid()
      .notNull()
      .references(() => correctionRequests.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    readAt: createdAt(),
  },
  (t) => [uniqueIndex('correction_reads_uq').on(t.correctionRequestId, t.userId)],
);

/** Resumo diário por e-mail já enviado ao empregador (um por dia). */
export const dailySummariesSent = pgTable(
  'daily_summaries_sent',
  {
    id: id(),
    employerId: uuid()
      .notNull()
      .references(() => employers.id),
    date: date({ mode: 'string' }).notNull(),
    sentAt: createdAt(),
  },
  (t) => [uniqueIndex('daily_summary_uq').on(t.employerId, t.date)],
);
