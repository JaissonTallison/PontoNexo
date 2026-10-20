import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Inject } from '@nestjs/common';
import {
  phoneStartSchema,
  phoneVerifySchema,
  type PasskeyView,
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
import { PasskeysService } from './passkeys.service.js';
import { PhoneLoginService } from './phone-login.service.js';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { z as zod } from 'zod';

const webauthnBody = zod.object({ challengeId: zod.uuid(), response: zod.record(zod.string(), zod.unknown()), deviceLabel: zod.string().max(80).nullable().optional() });

const STRICT = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly phone: PhoneLoginService,
    private readonly passkeys: PasskeysService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ───── Entrar pelo celular (código) ─────

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('phone/start')
  @HttpCode(200)
  async phoneStart(@Body({ schema: phoneStartSchema }) body: z.infer<typeof phoneStartSchema>, @Req() req: Request) {
    await this.phone.start(body.phone, requestMeta(req));
    return { ok: true, message: 'Se o número estiver cadastrado, você vai receber um SMS com o código.' };
  }

  @Public()
  @Throttle(STRICT)
  @Post('phone/verify')
  @HttpCode(200)
  async phoneVerify(@Body({ schema: phoneVerifySchema }) body: z.infer<typeof phoneVerifySchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.setCookies(res, await this.phone.verify(body.phone, body.code, requestMeta(req)));
    return { ok: true };
  }

  // ───── Biometria (passkey) ─────

  @Get('passkeys')
  passkeyList(@Auth() auth: AuthContext): Promise<PasskeyView[]> {
    return this.passkeys.list(auth);
  }

  @Post('passkeys/register/options')
  @HttpCode(200)
  passkeyRegisterOptions(@Auth() auth: AuthContext) {
    return this.passkeys.registrationOptions(auth);
  }

  @Post('passkeys/register')
  @HttpCode(200)
  async passkeyRegister(@Auth() auth: AuthContext, @Body({ schema: webauthnBody }) body: zod.infer<typeof webauthnBody>, @Req() req: Request) {
    await this.passkeys.register(auth, body.challengeId, body.response as unknown as RegistrationResponseJSON, body.deviceLabel ?? null, requestMeta(req));
    return { ok: true };
  }

  @Post('passkeys/:id/remove')
  @HttpCode(200)
  async passkeyRemove(@Auth() auth: AuthContext, @Param('id', { schema: zod.string().min(10).max(500) }) id: string, @Req() req: Request) {
    await this.passkeys.remove(auth, id, requestMeta(req));
    return { ok: true };
  }

  @Public()
  @Throttle(STRICT)
  @Post('passkeys/login/options')
  @HttpCode(200)
  passkeyLoginOptions() {
    return this.passkeys.loginOptions();
  }

  @Public()
  @Throttle(STRICT)
  @Post('passkeys/login')
  @HttpCode(200)
  async passkeyLogin(@Body({ schema: webauthnBody }) body: zod.infer<typeof webauthnBody>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.setCookies(res, await this.passkeys.login(body.challengeId, body.response as unknown as AuthenticationResponseJSON, requestMeta(req)));
    return { ok: true };
  }

  private setCookies(res: Response, s: { token: string; csrfToken: string; expiresAt: Date }) {
    const base = { secure: this.env.COOKIE_SECURE, sameSite: 'strict' as const, path: '/', expires: s.expiresAt };
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
    this.setCookies(res, await this.auth.login(body.email, body.password, requestMeta(req)));
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
