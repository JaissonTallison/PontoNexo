import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import {
  PRIVACY_NOTICE_VERSION,
  type MeView,
  type SessionView,
  type SignupInput,
} from '@pontonexo/shared';
import type { Env } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { employerCounters, employers, passwordResetTokens, privacyAcknowledgements, retentionPolicies, sessions, userRoles, users } from '../../db/schema.js';
import { AuditService } from '../../common/audit.service.js';
import type { ActiveMembership, AuthContext } from '../../common/auth/context.js';
import { SessionService } from '../../common/auth/session.service.js';
import { randomToken, sha256 } from '../../common/crypto.js';
import { AppError, conflict, forbidden, unauthorized } from '../../common/errors.js';
import type { RequestMeta } from '../../common/http.js';
import { MailService } from '../../common/mail.service.js';
import { TenantDb } from '../../common/tenant.js';
import { DB, ENV } from '../../common/tokens.js';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const RESET_TTL_MS = 60 * 60_000;
const INVITE_TTL_MS = 72 * 60 * 60_000;
const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string) => argon2.hash(plain, ARGON);

// hash real de referência: iguala o tempo de resposta quando o e-mail não existe
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(randomToken(16)));

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly tenant: TenantDb,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async signup(input: SignupInput, meta: RequestMeta) {
    if (!this.env.SIGNUP_ENABLED) throw forbidden('Cadastro de novos empregadores desativado.');
    const [existing] = await this.db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email}`);
    if (existing) throw conflict('EMAIL_IN_USE', 'Já existe uma conta com este e-mail. Entre ou recupere a senha.');

    const passwordHash = await hashPassword(input.password);
    const employerId = randomUUID();
    const userId = await this.tenant.run(employerId, async (tx) => {
      const [user] = await tx.insert(users).values({ name: input.name, email: input.email, passwordHash }).returning({ id: users.id });
      await tx.insert(employers).values({
        id: employerId,
        displayName: input.employer.displayName,
        legalName: input.employer.legalName,
        documentCpf: input.employer.cpf,
      });
      await tx.insert(employerCounters).values({ employerId });
      await tx.insert(retentionPolicies).values({ employerId, category: 'punch_coordinates', retentionDays: 395 });
      await tx.insert(userRoles).values({ userId: user!.id, employerId, roleCode: 'employer_owner' });
      await this.audit.record(tx, {
        employerId,
        category: 'privileged',
        action: 'employer.created',
        actorUserId: user!.id,
        entityType: 'employer',
        entityId: employerId,
        summary: 'Empregador cadastrado com titular',
        ip: meta.ip,
      });
      return user!.id;
    });
    return this.openSession(userId, meta, null);
  }

  async login(email: string, password: string, meta: RequestMeta) {
    const [user] = await this.db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    const generic = new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos. Após 5 tentativas a conta fica bloqueada por 15 minutos.');

    if (!user || !user.passwordHash) {
      await argon2.verify(await getDummyHash(), password).catch(() => false);
      await this.platformAudit('auth.login_failed', 'Tentativa de acesso com e-mail não cadastrado ou convite pendente', meta, user?.id ?? null);
      throw generic;
    }
    if (user.status !== 'active') {
      await this.platformAudit('auth.login_blocked', 'Tentativa de acesso de conta desativada', meta, user.id);
      throw generic;
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.platformAudit('auth.login_locked', 'Tentativa de acesso com conta bloqueada', meta, user.id);
      throw generic;
    }
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const failed = user.failedLogins + 1;
      const lock = failed >= MAX_FAILED;
      await this.db
        .update(users)
        .set({ failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil })
        .where(eq(users.id, user.id));
      await this.platformAudit(lock ? 'auth.account_locked' : 'auth.login_failed', lock ? 'Conta bloqueada por tentativas incorretas' : 'Senha incorreta', meta, user.id);
      throw generic;
    }
    await this.db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
    return this.openSession(user.id, meta, 'auth.login');
  }

  /** Abre sessão para o usuário já autenticado (senha, código por celular ou passkey). */
  async openSession(userId: string, meta: RequestMeta, auditAction: string | null) {
    const memberships = await this.sessions.memberships(userId);
    // empregador ativo: o primeiro vínculo do lado do empregador, senão o de funcionário
    const active = memberships.find((m) => m.role !== 'employee') ?? memberships[0] ?? null;
    const session = await this.sessions.create(userId, active, meta);
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
    if (auditAction) await this.platformAudit(auditAction, 'Acesso realizado', meta, userId);
    return session;
  }

  private platformAudit(action: string, summary: string, meta: RequestMeta, actorUserId: string | null) {
    return this.tenant.platform((tx) =>
      this.audit.record(tx, { employerId: null, category: 'security', action, actorUserId, summary, ip: meta.ip, metadata: { userAgent: meta.userAgent } }),
    );
  }

  async logout(auth: AuthContext, meta: RequestMeta) {
    await this.sessions.revoke(auth.sessionId, auth.userId);
    await this.platformAudit('auth.logout', 'Saída da sessão', meta, auth.userId);
  }

  async me(auth: AuthContext): Promise<MeView> {
    const memberships = await this.sessions.memberships(auth.userId);
    let privacyAcknowledged = true;
    if (auth.membership) {
      const m = auth.membership;
      privacyAcknowledged = await this.tenant.run(m.employerId, async (tx) => {
        const [ack] = await tx
          .select({ id: privacyAcknowledgements.id })
          .from(privacyAcknowledgements)
          .where(and(eq(privacyAcknowledgements.userId, auth.userId), eq(privacyAcknowledgements.version, PRIVACY_NOTICE_VERSION)));
        return Boolean(ack);
      });
    }
    return {
      user: { id: auth.userId, name: auth.userName, email: auth.email },
      active: auth.membership ? toView(auth.membership) : null,
      memberships: memberships.map(toView),
      permissions: [...auth.permissions],
      timezone: auth.membership?.timezone ?? 'America/Sao_Paulo',
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyAcknowledged,
    };
  }

  async switchEmployer(auth: AuthContext, employerId: string, meta: RequestMeta): Promise<ActiveMembership> {
    const target = (await this.sessions.memberships(auth.userId)).find((m) => m.employerId === employerId);
    if (!target) throw forbidden('Você não tem vínculo com este empregador.');
    await this.sessions.setActive(auth.sessionId, target);
    await this.tenant.run(employerId, (tx) =>
      this.audit.record(tx, { employerId, category: 'security', action: 'auth.switch_employer', actorUserId: auth.userId, summary: 'Troca de empregador ativo', ip: meta.ip }),
    );
    return target;
  }

  async forgotPassword(email: string, meta: RequestMeta) {
    const [user] = await this.db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    // resposta idêntica exista ou não o e-mail
    if (!user || user.status !== 'active') return;
    const recent = await this.db
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, user.id), gt(passwordResetTokens.createdAt, new Date(Date.now() - 60_000))));
    if (recent.length) return;
    const token = await this.issueToken(user.id, 'reset');
    await this.mail.send({
      to: user.email,
      subject: 'PontoNexo · redefinição de senha',
      text: `Olá, ${user.name}.\n\nRecebemos um pedido para redefinir sua senha. O link vale por 1 hora:\n${this.env.WEB_ORIGIN}/redefinir-senha?token=${token}\n\nSe não foi você, ignore esta mensagem; sua senha continua a mesma.`,
    });
    await this.platformAudit('auth.password_reset_requested', 'Pedido de redefinição de senha', meta, user.id);
  }

  async issueToken(userId: string, purpose: 'reset' | 'invite'): Promise<string> {
    const token = randomToken(32);
    await this.db.insert(passwordResetTokens).values({
      userId,
      tokenHash: sha256(token),
      purpose,
      expiresAt: new Date(Date.now() + (purpose === 'reset' ? RESET_TTL_MS : INVITE_TTL_MS)),
    });
    return token;
  }

  async resetPassword(token: string, password: string, meta: RequestMeta) {
    const [row] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, sha256(token)), isNull(passwordResetTokens.usedAt)))
      .limit(1);
    if (!row || row.expiresAt.getTime() < Date.now()) throw new AppError(400, 'TOKEN_INVALID', 'Link inválido ou vencido. Peça um novo.');
    const passwordHash = await hashPassword(password);
    await this.db.transaction(async (tx) => {
      const used = await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.id, row.id), isNull(passwordResetTokens.usedAt)))
        .returning({ id: passwordResetTokens.id });
      if (!used.length) throw new AppError(400, 'TOKEN_INVALID', 'Link já utilizado.');
      await tx.update(users).set({ passwordHash, failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, row.userId));
    });
    await this.sessions.revokeAll(row.userId);
    await this.platformAudit(row.purpose === 'invite' ? 'auth.invite_accepted' : 'auth.password_reset', 'Senha definida por link', meta, row.userId);
  }

  async changePassword(auth: AuthContext, current: string, next: string, meta: RequestMeta) {
    const [user] = await this.db.select().from(users).where(eq(users.id, auth.userId));
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, current).catch(() => false))) {
      throw new AppError(422, 'INVALID_CREDENTIALS', 'Senha atual incorreta.', { currentPassword: 'Senha atual incorreta.' });
    }
    await this.db.update(users).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(users.id, auth.userId));
    await this.sessions.revokeAll(auth.userId, auth.sessionId);
    await this.platformAudit('auth.password_changed', 'Senha alterada; demais sessões encerradas', meta, auth.userId);
  }

  async listSessions(auth: AuthContext): Promise<SessionView[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, auth.userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastSeenAt));
    return rows.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      userAgent: s.userAgent,
      current: s.id === auth.sessionId,
    }));
  }

  async revokeSession(auth: AuthContext, sessionId: string) {
    if (sessionId === auth.sessionId) throw unauthorized('Use "Sair" para encerrar a sessão atual.');
    await this.sessions.revoke(sessionId, auth.userId);
  }
}

const toView = (m: ActiveMembership) => ({ id: m.id, employerId: m.employerId, employerName: m.employerName, role: m.role, employeeId: m.employeeId });
