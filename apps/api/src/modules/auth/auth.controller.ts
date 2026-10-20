import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Inject } from '@nestjs/common';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  idParam,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  switchEmployerSchema,
  type MeView,
  type SessionView,
} from '@pontonexo/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { Env } from '../../config/env.js';
import type { AuthContext } from '../../common/auth/context.js';
import { Auth, Public } from '../../common/auth/decorators.js';
import { CSRF_COOKIE, requestMeta, SESSION_COOKIE } from '../../common/http.js';
import { ENV } from '../../common/tokens.js';
import { AuthService } from './auth.service.js';

const STRICT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Sem "manter conectado" o cookie é de sessão: some ao fechar o navegador (o servidor também expira em SESSION_TTL_HOURS). */
  private setCookies(res: Response, s: { token: string; csrfToken: string; expiresAt: Date; remember: boolean }) {
    const base = { secure: this.env.COOKIE_SECURE, sameSite: 'strict' as const, path: '/', ...(s.remember ? { expires: s.expiresAt } : {}) };
    res.cookie(SESSION_COOKIE, s.token, { ...base, httpOnly: true });
    res.cookie(CSRF_COOKIE, s.csrfToken, { ...base, httpOnly: false });
  }

  @Public()
  @Throttle(STRICT)
  @Post('signup')
  async signup(@Body({ schema: signupSchema }) body: z.infer<typeof signupSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.setCookies(res, await this.auth.signup(body, requestMeta(req)));
    return { ok: true };
  }

  @Public()
  @Throttle(STRICT)
  @Post('login')
  @HttpCode(200)
  async login(@Body({ schema: loginSchema }) body: z.infer<typeof loginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.setCookies(res, await this.auth.login(body.email, body.password, requestMeta(req), body.remember));
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Auth() auth: AuthContext, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(auth, requestMeta(req));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@Auth() auth: AuthContext): Promise<MeView> {
    return this.auth.me(auth);
  }

  @Post('switch-employer')
  @HttpCode(200)
  async switchEmployer(@Auth() auth: AuthContext, @Body({ schema: switchEmployerSchema }) body: z.infer<typeof switchEmployerSchema>, @Req() req: Request) {
    await this.auth.switchEmployer(auth, body.employerId, requestMeta(req));
    return { ok: true };
  }

  @Public()
  @Throttle(STRICT)
  @Post('password/forgot')
  @HttpCode(200)
  async forgot(@Body({ schema: forgotPasswordSchema }) body: z.infer<typeof forgotPasswordSchema>, @Req() req: Request) {
    await this.auth.forgotPassword(body.email, requestMeta(req));
    return { ok: true, message: 'Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha.' };
  }

  @Public()
  @Throttle(STRICT)
  @Post('password/reset')
  @HttpCode(200)
  async reset(@Body({ schema: resetPasswordSchema }) body: z.infer<typeof resetPasswordSchema>, @Req() req: Request) {
    await this.auth.resetPassword(body.token, body.password, requestMeta(req));
    return { ok: true };
  }

  @Throttle(STRICT)
  @Post('password/change')
  @HttpCode(200)
  async change(@Auth() auth: AuthContext, @Body({ schema: changePasswordSchema }) body: z.infer<typeof changePasswordSchema>, @Req() req: Request) {
    await this.auth.changePassword(auth, body.currentPassword, body.newPassword, requestMeta(req));
    return { ok: true };
  }

  @Get('sessions')
  sessions(@Auth() auth: AuthContext): Promise<SessionView[]> {
    return this.auth.listSessions(auth);
  }

  @Post('sessions/:id/revoke')
  @HttpCode(200)
  async revoke(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string) {
    await this.auth.revokeSession(auth, id);
    return { ok: true };
  }
}
