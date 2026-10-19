export const PUNCH_TYPES = ['clock_in', 'break_start', 'break_end', 'clock_out'] as const;
export type PunchType = (typeof PUNCH_TYPES)[number];

export const PUNCH_TYPE_LABEL: Record<PunchType, string> = {
  clock_in: 'Entrada',
  break_start: 'Início de intervalo',
  break_end: 'Fim de intervalo',
  clock_out: 'Saída',
};

/** Resultado da avaliação de localização no momento da marcação. */
export const GEO_STATUS = [
  'inside',
  'outside',
  'low_accuracy',
  'unavailable',
  'denied',
  'no_geofence',
] as const;
export type GeoStatus = (typeof GEO_STATUS)[number];

export const GEO_STATUS_LABEL: Record<GeoStatus, string> = {
  inside: 'Dentro do raio do local',
  outside: 'Fora do raio do local',
  low_accuracy: 'Precisão do GPS insuficiente',
  unavailable: 'Localização indisponível',
  denied: 'Localização não autorizada no aparelho',
  no_geofence: 'Local sem cerca virtual',
};

/** O que o aparelho conseguiu ao pedir a posição. */
export const POSITION_OUTCOME = ['ok', 'denied', 'unavailable', 'timeout'] as const;
export type PositionOutcome = (typeof POSITION_OUTCOME)[number];

/** Ocorrências: sinais para revisão humana, nunca penalidade automática. */
export const ALERT_CODES = [
  'outside_geofence',
  'low_accuracy',
  'gps_unavailable',
  'gps_denied',
  'unlisted_location',
  'device_clock_divergence',
  'offline_submission',
  'server_clock_unverified',
  'server_clock_drift',
  'stale_session_closed',
] as const;
export type AlertCode = (typeof ALERT_CODES)[number];

export const ALERT_LABEL: Record<AlertCode, string> = {
  outside_geofence: 'Marcação fora do raio do local',
  low_accuracy: 'Precisão do GPS insuficiente',
  gps_unavailable: 'GPS indisponível no momento da marcação',
  gps_denied: 'Permissão de localização negada',
  unlisted_location: 'Local não autorizado para o funcionário',
  device_clock_divergence: 'Relógio do aparelho divergente do servidor',
  offline_submission: 'Marcação feita sem conexão e enviada depois',
  server_clock_unverified: 'Sincronização do relógio do servidor não verificada',
  server_clock_drift: 'Relógio do servidor com defasagem acima do limite',
  stale_session_closed: 'Jornada anterior ficou sem saída registrada',
};

export const CLOCK_STATUS = ['synced', 'unverified', 'drift'] as const;
export type ClockStatus = (typeof CLOCK_STATUS)[number];

export const PUNCH_ORIGIN = ['online', 'offline_sync'] as const;
export type PunchOrigin = (typeof PUNCH_ORIGIN)[number];

export const LOCATION_KINDS = ['residence', 'external', 'travel'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];
export const LOCATION_KIND_LABEL: Record<LocationKind, string> = {
  residence: 'Residência',
  external: 'Local externo',
  travel: 'Acompanhamento em viagem',
};

export const CONTRACT_REGIMES = ['full_time', 'part_time', 'shift_12x36'] as const;
export type ContractRegime = (typeof CONTRACT_REGIMES)[number];
export const CONTRACT_REGIME_LABEL: Record<ContractRegime, string> = {
  full_time: 'Tempo integral (até 8 h/dia e 44 h/semana)',
  part_time: 'Tempo parcial (até 25 h/semana)',
  shift_12x36: '12 × 36 (acordo escrito)',
};

export const COMPENSATION_REGIMES = ['none', 'lc150_bank'] as const;
export type CompensationRegime = (typeof COMPENSATION_REGIMES)[number];
export const COMPENSATION_LABEL: Record<CompensationRegime, string> = {
  none: 'Sem compensação: excedente é hora extra',
  lc150_bank: 'Compensação por acordo escrito (LC 150, art. 2º, §§ 4º e 5º)',
};

export const CORRECTION_KINDS = ['include_punch', 'disregard_punch', 'replace_time', 'justify_absence'] as const;
export type CorrectionKind = (typeof CORRECTION_KINDS)[number];
export const CORRECTION_KIND_LABEL: Record<CorrectionKind, string> = {
  include_punch: 'Incluir marcação esquecida',
  disregard_punch: 'Desconsiderar marcação indevida',
  replace_time: 'Ajustar horário de marcação',
  justify_absence: 'Justificar ausência (abono)',
};

export const CORRECTION_STATUS = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUS)[number];
export const CORRECTION_STATUS_LABEL: Record<CorrectionStatus, string> = {
  pending: 'Aguardando decisão',
  approved: 'Aprovada',
  rejected: 'Recusada',
  cancelled: 'Cancelada',
};

export const TREATMENT_KINDS = ['inclusion', 'disregard', 'absence_justification'] as const;
export type TreatmentKind = (typeof TREATMENT_KINDS)[number];

export const ROLE_CODES = ['employer_owner', 'employer_manager', 'accountant', 'employee'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];
export const ROLE_LABEL: Record<RoleCode, string> = {
  employer_owner: 'Empregador (titular)',
  employer_manager: 'Gestor delegado',
  accountant: 'Contador (somente leitura)',
  employee: 'Funcionário',
};

export const INCIDENT_KINDS = ['security', 'availability', 'data_integrity', 'privacy', 'time_sync'] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];
export const INCIDENT_KIND_LABEL: Record<IncidentKind, string> = {
  security: 'Segurança',
  availability: 'Disponibilidade',
  data_integrity: 'Integridade de dados',
  privacy: 'Privacidade (dados pessoais)',
  time_sync: 'Sincronização de hora',
};
export const INCIDENT_SEVERITY = ['low', 'medium', 'high', 'critical'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITY)[number];
export const INCIDENT_SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
};
export const INCIDENT_STATUS = ['open', 'investigating', 'resolved'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUS)[number];
export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  open: 'Aberto',
  investigating: 'Em análise',
  resolved: 'Resolvido',
};

export const DATA_REQUEST_KINDS = ['access', 'correction', 'export', 'deletion', 'information'] as const;
export type DataRequestKind = (typeof DATA_REQUEST_KINDS)[number];
export const DATA_REQUEST_KIND_LABEL: Record<DataRequestKind, string> = {
  access: 'Confirmação e acesso aos dados',
  correction: 'Correção de dados cadastrais',
  export: 'Portabilidade (cópia dos dados)',
  deletion: 'Eliminação de dados',
  information: 'Informação sobre compartilhamento',
};
export const DATA_REQUEST_STATUS = ['open', 'answered', 'denied'] as const;
export type DataRequestStatus = (typeof DATA_REQUEST_STATUS)[number];
