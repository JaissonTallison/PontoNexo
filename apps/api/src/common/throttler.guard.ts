import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { sha256 } from './crypto.js';
import { SESSION_COOKIE } from './http.js';

/**
 * Limite por sessão quando há cookie (funcionários da mesma casa compartilham o IP do Wi-Fi)
 * e por IP nas rotas anônimas (login, recuperação de senha, verificação pública).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as unknown as Request;
    const token = (r.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    return token ? `s:${sha256(token).slice(0, 24)}` : `ip:${r.ip ?? 'desconhecido'}`;
  }
}
