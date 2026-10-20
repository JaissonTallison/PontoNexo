import { Inject, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { loginCodes } from '../../db/schema.js';
import { AuditService } from '../../common/audit.service.js';
import { sha256 } from '../../common/crypto.js';
import { AppError } from '../../common/errors.js';
import type { RequestMeta } from '../../common/http.js';
import { TenantDb } from '../../common/tenant.js';
import { DB } from '../../common/tokens.js';
import { AuthService } from './auth.service.js';
import { SMS_SENDER, type SmsSender } from './sms.js';

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60_000;

/**
 * Entrar pelo celular: código de 6 dígitos enviado ao número cadastrado do funcionário.
 * Resposta igual exista ou não o número (não revela quem está cadastrado).
 */
@Injectable()
export class PhoneLoginService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    private readonly auth: AuthService,
    private readonly tenant: TenantDb,
    private readonly audit: AuditService,
  ) {}

  private assertAvailable() {
    if (!this.sms.available) throw new AppError(503, 'PHONE_LOGIN_OFF', 'Entrar pelo celular ainda não está disponível. Entre com e-mail e senha.');
  }

  async start(phone: string, meta: RequestMeta) {
    this.assertAvailable();
    const rows = await this.db.execute<{ user_id: string }>(sql`select user_id from pn_users_by_phone(${phone})`);
    // número desconhecido ou compartilhado por mais de uma pessoa: não envia, mas responde igual
    if (rows.length !== 1) {
      await this.log('auth.phone_code_unmatched', 'Pedido de código para celular não cadastrado ou ambíguo', meta, null);
      return;
    }
    const userId = rows[0]!.user_id;
    const [recent] = await this.db
      .select({ id: loginCodes.id })
      .from(loginCodes)
      .where(and(eq(loginCodes.userId, userId), gt(loginCodes.createdAt, new Date(Date.now() - RESEND_COOLDOWN_MS))));
    if (recent) return;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.db.insert(loginCodes).values({ userId, phoneDigits: phone, codeHash: sha256(`${userId}:${code}`), expiresAt: new Date(Date.now() + CODE_TTL_MS) });
    await this.sms.send(phone, `PontoNexo: seu código de acesso é ${code}. Vale por 10 minutos. Não compartilhe.`);
    await this.log('auth.phone_code_sent', 'Código de acesso enviado por SMS', meta, userId);
  }

  async verify(phone: string, code: string, meta: RequestMeta) {
    this.assertAvailable();
    const invalid = new AppError(401, 'INVALID_CODE', 'Código incorreto ou vencido. Peça um novo código.');
    const [row] = await this.db
      .select()
      .from(loginCodes)
      .where(and(eq(loginCodes.phoneDigits, phone), isNull(loginCodes.usedAt), gt(loginCodes.expiresAt, new Date())))
      .orderBy(desc(loginCodes.createdAt))
      .limit(1);
    if (!row || row.attempts >= MAX_ATTEMPTS) throw invalid;
    if (row.codeHash !== sha256(`${row.userId}:${code}`)) {
      await this.db.update(loginCodes).set({ attempts: row.attempts + 1 }).where(eq(loginCodes.id, row.id));
      await this.log('auth.phone_code_failed', 'Código de acesso incorreto', meta, row.userId);
      throw invalid;
    }
    const used = await this.db.update(loginCodes).set({ usedAt: new Date() }).where(and(eq(loginCodes.id, row.id), isNull(loginCodes.usedAt))).returning({ id: loginCodes.id });
    if (!used.length) throw invalid;
    return this.auth.openSession(row.userId, meta, 'auth.login_phone');
  }

  private log(action: string, summary: string, meta: RequestMeta, actorUserId: string | null) {
    return this.tenant.platform((tx) => this.audit.record(tx, { employerId: null, category: 'security', action, actorUserId, summary, ip: meta.ip }));
  }
}
