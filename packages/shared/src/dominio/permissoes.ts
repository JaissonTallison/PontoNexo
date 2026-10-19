import type { RoleCode } from './tipos.js';

export const PERMISSIONS = [
  'punch.self',
  'self.read',
  'employer.read',
  'employer.write',
  'employees.read',
  'employees.write',
  'locations.write',
  'schedules.write',
  'punches.read',
  'alerts.review',
  'corrections.read',
  'corrections.decide',
  'corrections.propose',
  'timesheets.read',
  'closings.manage',
  'exports.run',
  'audit.read',
  'incidents.manage',
  'users.manage',
  'settings.manage',
  'privacy.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ_ONLY: Permission[] = ['employer.read', 'employees.read', 'punches.read', 'corrections.read', 'timesheets.read', 'exports.run'];

const MANAGER: Permission[] = [
  ...READ_ONLY,
  'employees.write',
  'locations.write',
  'schedules.write',
  'alerts.review',
  'corrections.decide',
  'corrections.propose',
  'incidents.manage',
];

/**
 * Nenhum papel tem permissão para editar ou apagar marcações: essa operação não existe no sistema.
 * Alterações passam por tratamento com a regra das duas partes.
 */
export const ROLE_PERMISSIONS: Record<RoleCode, ReadonlySet<Permission>> = {
  employer_owner: new Set<Permission>([
    ...MANAGER,
    'employer.write',
    'closings.manage',
    'audit.read',
    'users.manage',
    'settings.manage',
    'privacy.manage',
  ]),
  employer_manager: new Set<Permission>(MANAGER),
  accountant: new Set<Permission>([...READ_ONLY, 'audit.read']),
  employee: new Set<Permission>(['punch.self', 'self.read']),
};

export function can(role: RoleCode, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function isEmployerSide(role: RoleCode): boolean {
  return role !== 'employee';
}
