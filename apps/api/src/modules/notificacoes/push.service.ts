import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import webpush from 'web-push';
import type { Env } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { pushSubscriptions, userRoles } from '../../db/schema.js';
import { DB, ENV } from '../../common/tokens.js';

export interface PushPayload {
  title: string;
  body: string;
  /** tela que abre ao tocar */
  url: string;
  /** substitui notificação anterior com a mesma etiqueta */
  tag?: string;
}

/** Notificações Web Push (VAPID). Sem chaves configuradas, fica desligado e não quebra nada. */
@Injectable()
export class PushService {
  private readonly logger = new Logger('Notificações');
  readonly enabled: boolean;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.enabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    if (this.enabled) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  }

  get publicKey() {
    return this.env.VAPID_PUBLIC_KEY;
  }

  async subscribe(userId: string, endpoint: string, keys: { p256dh: string; auth: string }, userAgent: string | null) {
    await this.db
      .insert(pushSubscriptions)
      .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent, failures: 0 } });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
  }

  async hasSubscription(userIds: string[]) {
    if (!userIds.length) return new Set<string>();
    const rows = await this.db.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
    return new Set(rows.map((r) => r.userId));
  }

  /** Envia para todos os aparelhos do usuário. Retorna quantos receberam. */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.enabled) return 0;
    const subs = await this.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    let ok = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
        await this.db.update(pushSubscriptions).set({ lastSuccessAt: new Date(), failures: 0 }).where(eq(pushSubscriptions.id, s.id));
        ok++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: inscrição não existe mais no navegador
        if (status === 404 || status === 410 || s.failures >= 5) await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        else await this.db.update(pushSubscriptions).set({ failures: s.failures + 1 }).where(eq(pushSubscriptions.id, s.id));
        this.logger.warn('Falha ao enviar notificação', { status: status ?? null });
      }
    }
    return ok;
  }

  /** Usuário do app do funcionário (acesso ativo) para o vínculo informado. */
  async employeeUserId(employerId: string, employeeId: string): Promise<string | null> {
    const [ur] = await this.db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(and(eq(userRoles.employerId, employerId), eq(userRoles.employeeId, employeeId), eq(userRoles.active, true)));
    return ur?.userId ?? null;
  }

  async sendToEmployee(employerId: string, employeeId: string, payload: PushPayload) {
    const userId = await this.employeeUserId(employerId, employeeId);
    return userId ? this.sendToUser(userId, payload) : 0;
  }
}
