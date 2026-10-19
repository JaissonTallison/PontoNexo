import { z } from 'zod';
import { MAX_GEOFENCE_RADIUS_M, MIN_GEOFENCE_RADIUS_M } from '../dominio/geo.js';
import { COMPENSATION_REGIMES, CONTRACT_REGIMES, LOCATION_KINDS, ROLE_CODES } from '../dominio/tipos.js';
import { cpf, email, hhmm, isoDate, nonEmpty, optionalText, paginationQuery } from './comum.js';

export const employerUpdateSchema = z.object({
  displayName: nonEmpty(120),
  legalName: nonEmpty(200),
  timezone: z.string().min(3).max(60).refine((tz) => {
    try {
      new Intl.DateTimeFormat('pt-BR', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Fuso horário inválido.'),
  addressLine: optionalText(300),
  city: optionalText(120),
  state: z.string().trim().length(2).toUpperCase().nullable().optional(),
});

export const employeeCreateSchema = z.object({
  fullName: nonEmpty(200),
  cpf,
  email: email.nullable().optional(),
  phone: optionalText(30),
  jobRoleId: z.uuid().nullable().optional(),
  /** Cria acesso ao app e envia o e-mail para definir senha. */
  createAccess: z.boolean().default(false),
});
export const employeeUpdateSchema = z.object({
  fullName: nonEmpty(200),
  email: email.nullable().optional(),
  phone: optionalText(30),
  jobRoleId: z.uuid().nullable().optional(),
  status: z.enum(['active', 'inactive']),
});
export const employeeListQuery = paginationQuery.extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
});

export const jobRoleSchema = z.object({
  name: nonEmpty(120),
  description: optionalText(500),
});

export const contractCreateSchema = z
  .object({
    jobRoleId: z.uuid().nullable().optional(),
    startDate: isoDate,
    endDate: isoDate.nullable().optional(),
    regime: z.enum(CONTRACT_REGIMES),
    weeklyHours: z.number().min(1).max(44),
    residesAtWorkplace: z.boolean(),
    breakReductionAgreement: z.boolean(),
    compensation: z.enum(COMPENSATION_REGIMES),
    travelAgreement: z.boolean(),
    writtenAgreementRef: optionalText(300),
    notes: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.regime === 'part_time' && v.weeklyHours > 25)
      ctx.addIssue({ code: 'custom', path: ['weeklyHours'], message: 'Tempo parcial vai até 25 h semanais (LC 150, art. 3º).' });
    if (v.endDate && v.endDate < v.startDate)
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'O término deve ser depois do início.' });
    if ((v.regime === 'shift_12x36' || v.breakReductionAgreement || v.compensation !== 'none') && !v.writtenAgreementRef)
      ctx.addIssue({
        code: 'custom',
        path: ['writtenAgreementRef'],
        message: '12x36, redução de intervalo e compensação exigem acordo escrito. Informe a referência do documento.',
      });
  });
export const contractEndSchema = z.object({ endDate: isoDate, reason: z.string().trim().min(3).max(500) });

export const locationCreateSchema = z.object({
  name: nonEmpty(120),
  kind: z.enum(LOCATION_KINDS),
  addressLine: optionalText(300),
  geofence: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radiusM: z.number().int().min(MIN_GEOFENCE_RADIUS_M).max(MAX_GEOFENCE_RADIUS_M),
      /** início da vigência da cerca; padrão: hoje */
      validFrom: isoDate.optional(),
    })
    .nullable(),
});
export const locationUpdateSchema = z.object({
  name: nonEmpty(120),
  addressLine: optionalText(300),
  active: z.boolean(),
});
export const geofenceSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(MIN_GEOFENCE_RADIUS_M).max(MAX_GEOFENCE_RADIUS_M),
  validFrom: isoDate,
});
export const employeeLocationSchema = z.object({
  locationId: z.uuid(),
  validFrom: isoDate,
  validTo: isoDate.nullable().optional(),
});

export const scheduleCreateSchema = z
  .object({
    name: nonEmpty(120),
    kind: z.enum(['weekly', 'cycle_12x36']),
    days: z
      .array(
        z.object({
          weekday: z.number().int().min(1).max(7),
          start: hhmm,
          end: hhmm,
          breakMinutes: z.number().int().min(0).max(240),
        }),
      )
      .max(7)
      .default([]),
    cycleAnchorDate: isoDate.nullable().optional(),
    cycleStart: hhmm.nullable().optional(),
    cycleEnd: hhmm.nullable().optional(),
    cycleBreakMinutes: z.number().int().min(0).max(240).nullable().optional(),
    notes: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'weekly') {
      if (v.days.length === 0) ctx.addIssue({ code: 'custom', path: ['days'], message: 'Informe ao menos um dia de trabalho.' });
      const set = new Set(v.days.map((d) => d.weekday));
      if (set.size !== v.days.length) ctx.addIssue({ code: 'custom', path: ['days'], message: 'Dia da semana repetido.' });
    } else if (!v.cycleAnchorDate || !v.cycleStart || !v.cycleEnd) {
      ctx.addIssue({ code: 'custom', path: ['cycleAnchorDate'], message: 'Informe a data-base e o horário do plantão.' });
    }
  });
export const employeeScheduleSchema = z.object({
  scheduleId: z.uuid(),
  validFrom: isoDate,
});

export const holidayCreateSchema = z.object({
  date: isoDate,
  name: nonEmpty(120),
  scope: z.enum(['state', 'municipal', 'other']),
});

export const inviteUserSchema = z.object({
  name: nonEmpty(200),
  email,
  role: z.enum(ROLE_CODES).exclude(['employee', 'employer_owner']),
});
