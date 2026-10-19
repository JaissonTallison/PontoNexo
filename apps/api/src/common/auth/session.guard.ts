import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Permission } from '@pontonexo/shared';
import type { Request } from 'express';
import type { Env } from '../../config/env.js';
import { AppError, forbidden, unauthorized } from '../errors.js';
import { CSRF_HEADER, SESSION_COOKIE } from '../http.js';
import { ENV } from '../tokens.js';
import { PERMISSION_KEY, PUBLIC_KEY } from './decorators.js';
import { SessionService } from './session.service.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const targets = [ctx.getHandler(), ctx.getClass()];

    // Requisições que mudam estado vindas de outra origem são recusadas (defesa além do SameSite).
    if (!SAFE.has(req.method)) {
      const origin = req.headers.origin;
      if (origin && origin !== this.env.WEB_ORIGIN) throw new AppError(403, 'ORIGIN', 'Origem da requisição não autorizada.');
    }

    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (token) req.auth = (await this.sessions.resolve(token)) ?? undefined;

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
    if (!req.auth) throw unauthorized();

    if (!SAFE.has(req.method)) {
      const header = req.headers[CSRF_HEADER];
      if (typeof header !== 'string' || !sameToken(header, req.auth.csrfToken)) {
        throw new AppError(403, 'CSRF', 'Sessão inválida para esta ação. Recarregue a página e tente de novo.');
      }
    }

    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, targets);
    if (permission && (!req.auth.membership || !req.auth.permissions.has(permission))) throw forbidden();
    return true;
  }
}
