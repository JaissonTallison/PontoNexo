import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Permission } from '@pontonexo/shared';
import type { Request } from 'express';
import { forbidden, unauthorized } from '../errors.js';
import type { ActiveMembership, AuthContext } from './context.js';

export const PUBLIC_KEY = 'pn:public';
export const PERMISSION_KEY = 'pn:permission';

/** Rota sem sessão (login, recuperação, verificação pública, saúde). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
/** Exige a permissão no empregador ativo da sessão. */
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.auth) throw unauthorized();
  return req.auth;
});

export interface EmployerScope extends AuthContext {
  membership: ActiveMembership;
}
export interface EmployeeScope extends EmployerScope {
  membership: ActiveMembership & { employeeId: string };
}

export function requireEmployer(auth: AuthContext): EmployerScope {
  if (!auth.membership) throw forbidden('Nenhum empregador ativo nesta sessão.');
  return auth as EmployerScope;
}

export function requireEmployee(auth: AuthContext): EmployeeScope {
  const scope = requireEmployer(auth);
  if (scope.membership.role !== 'employee' || !scope.membership.employeeId) throw forbidden('Ação disponível apenas para funcionários.');
  return scope as EmployeeScope;
}
