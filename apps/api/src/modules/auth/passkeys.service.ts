import { Inject, Injectable } from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { PasskeyView } from '@pontonexo/shared';
import type { Env } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { users, webauthnChallenges, webauthnCredentials } from '../../db/schema.js';
import { AuditService } from '../../common/audit.service.js';
import type { AuthContext } from '../../common/auth/context.js';
import { AppError, notFound } from '../../common/errors.js';
import type { RequestMeta } from '../../common/http.js';
import { TenantDb } from '../../common/tenant.js';
import { DB, ENV } from '../../common/tokens.js';
import { AuthService } from './auth.service.js';

const CHALLENGE_TTL_MS = 5 * 60_000;
const toB64 = (u: Uint8Array) => Buffer.from(u).toString('base64url');
const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

/**
 * Passkeys (WebAuthn): entrar com a digital, rosto ou PIN do próprio celular.
 * A biometria nunca sai do aparelho; o servidor guarda só a chave pública da credencial.
 */
@Injectable()
export class PasskeysService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly auth: AuthService,
    private readonly tenant: TenantDb,
    private readonly audit: AuditService,
  ) {}

  private get rp() {
    return { rpID: this.env.WEBAUTHN_RP_ID, origin: this.env.WEB_ORIGIN };
  }

  private async saveChallenge(kind: 'register' | 'login', challenge: string, userId: string | null) {
    const [row] = await this.db
      .insert(webauthnChallenges)
      .values({ kind, challenge, userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) })
      .returning({ id: webauthnChallenges.id });
    return row!.id;
  }

  private async takeChallenge(id: string, kind: 'register' | 'login', userId: string | null) {
    const conds = [eq(webauthnChallenges.id, id), eq(webauthnChallenges.kind, kind), isNull(webauthnChallenges.usedAt), gt(webauthnChallenges.expiresAt, new Date())];
    if (userId) conds.push(eq(webauthnChallenges.userId, userId));
    const [row] = await this.db.update(webauthnChallenges).set({ usedAt: new Date() }).where(and(...conds)).returning();
    if (!row) throw new AppError(400, 'CHALLENGE_EXPIRED', 'O tempo para confirmar acabou. Tente de novo.');
    return row.challenge;
  }

  async list(auth: AuthContext): Promise<PasskeyView[]> {
    const rows = await this.db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, auth.userId));
    return rows.map((r) => ({ id: r.id, deviceLabel: r.deviceLabel, createdAt: r.createdAt.toISOString(), lastUsedAt: r.lastUsedAt?.toISOString() ?? null }));
  }

  async registrationOptions(auth: AuthContext) {
    const existing = await this.db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, auth.userId));
    const options = await generateRegistrationOptions({
      rpName: this.env.WEBAUTHN_RP_NAME,
      rpID: this.rp.rpID,
      userID: new TextEncoder().encode(auth.userId),
      userName: auth.email,
      userDisplayName: auth.userName,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({ id: c.id, transports: (c.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    const challengeId = await this.saveChallenge('register', options.challenge, auth.userId);
    return { challengeId, options };
  }

  async register(auth: AuthContext, challengeId: string, response: RegistrationResponseJSON, deviceLabel: string | null, meta: RequestMeta) {
    const expectedChallenge = await this.takeChallenge(challengeId, 'register', auth.userId);
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.rp.origin,
      expectedRPID: this.rp.rpID,
      requireUserVerification: true,
    }).catch(() => null);
    if (!result?.verified || !result.registrationInfo) throw new AppError(400, 'PASSKEY_INVALID', 'Não foi possível confirmar a biometria. Tente de novo.');
    const { credential } = result.registrationInfo;
    await this.db.insert(webauthnCredentials).values({
      id: credential.id,
      userId: auth.userId,
      publicKey: toB64(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? null,
      deviceLabel,
    });
    await this.log('auth.passkey_registered', 'Biometria cadastrada para entrar', meta, auth.userId);
  }

  async loginOptions() {
    const options = await generateAuthenticationOptions({ rpID: this.rp.rpID, userVerification: 'required', allowCredentials: [] });
    const challengeId = await this.saveChallenge('login', options.challenge, null);
    return { challengeId, options };
  }

  async login(challengeId: string, response: AuthenticationResponseJSON, meta: RequestMeta) {
    const expectedChallenge = await this.takeChallenge(challengeId, 'login', null);
    const [cred] = await this.db.select().from(webauthnCredentials).where(eq(webauthnCredentials.id, response.id));
    const fail = new AppError(401, 'PASSKEY_INVALID', 'Não reconhecemos esta biometria. Entre com o código ou a senha.');
    if (!cred) throw fail;
    const [user] = await this.db.select({ status: users.status }).from(users).where(eq(users.id, cred.userId));
    if (user?.status !== 'active') throw fail;
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.rp.origin,
      expectedRPID: this.rp.rpID,
      credential: { id: cred.id, publicKey: fromB64(cred.publicKey), counter: cred.counter, transports: (cred.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined },
      requireUserVerification: true,
    }).catch(() => null);
    if (!result?.verified) {
      await this.log('auth.passkey_failed', 'Biometria não confirmada', meta, cred.userId);
      throw fail;
    }
    await this.db.update(webauthnCredentials).set({ counter: result.authenticationInfo.newCounter, lastUsedAt: new Date() }).where(eq(webauthnCredentials.id, cred.id));
    return this.auth.openSession(cred.userId, meta, 'auth.login_passkey');
  }

  async remove(auth: AuthContext, id: string, meta: RequestMeta) {
    const res = await this.db.delete(webauthnCredentials).where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.userId, auth.userId))).returning({ id: webauthnCredentials.id });
    if (!res.length) throw notFound('Biometria');
    await this.log('auth.passkey_removed', 'Biometria removida', meta, auth.userId);
  }

  private log(action: string, summary: string, meta: RequestMeta, actorUserId: string | null) {
    return this.tenant.platform((tx) => this.audit.record(tx, { employerId: null, category: 'security', action, actorUserId, summary, ip: meta.ip }));
  }
}
