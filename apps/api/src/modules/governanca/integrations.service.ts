import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { and, asc, count, desc, eq, lte, sql } from 'drizzle-orm';
import type { IntegrationView, integrationCreateSchema } from '@pontonexo/shared';
import type { z } from 'zod';
import type { Env } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { integrationOutbox, integrations } from '../../db/schema.js';
import { AuditService } from '../../common/audit.service.js';
import type { EmployerScope } from '../../common/auth/decorators.js';
import { hmacSha256, SecretBox } from '../../common/crypto.js';
import { notFound, unprocessable } from '../../common/errors.js';
import type { RequestMeta } from '../../common/http.js';
import { TenantDb } from '../../common/tenant.js';
import { DB, ENV } from '../../common/tokens.js';

const MAX_ATTEMPTS = 10;
const BATCH = 20;

/** Endereços internos não podem ser destino de webhook (proteção contra SSRF). */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('::ffff:');
}

/**
 * Integração genérica por webhook assinado (HMAC-SHA256), com fila transacional e novas tentativas.
 * É o ponto de saída para sistemas externos (folha, contabilidade ou um REP-P certificado).
 * Nenhum adaptador de REP-P específico está implementado: ver docs/02-conformidade-trabalhista.md.
 */
@Injectable()
export class IntegrationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Integrações');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly tenant: TenantDb,
    private readonly audit: AuditService,
    private readonly box: SecretBox,
  ) {}

  onModuleInit() {
    if (!this.env.JOBS_ENABLED) return;
    this.timer = setInterval(() => void this.dispatchAll(), 30_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async assertSafeUrl(raw: string) {
    const url = new URL(raw);
    if (this.env.NODE_ENV !== 'production') return;
    if (url.protocol !== 'https:') throw unprocessable('URL', 'Use HTTPS no endereço do webhook.', { url: 'HTTPS obrigatório.' });
    const addrs = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
    if (addrs.some((a) => isPrivateAddress(a.address))) throw unprocessable('URL', 'Endereço interno não é permitido.', { url: 'Endereço interno.' });
  }

  async list(scope: EmployerScope): Promise<IntegrationView[]> {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const rows = await tx.select().from(integrations).where(eq(integrations.employerId, employerId)).orderBy(desc(integrations.createdAt));
      const out: IntegrationView[] = [];
      for (const r of rows) {
        const stats = await tx.select({ status: integrationOutbox.status, n: count() }).from(integrationOutbox).where(eq(integrationOutbox.integrationId, r.id)).groupBy(integrationOutbox.status);
        const [last] = await tx.select().from(integrationOutbox).where(eq(integrationOutbox.integrationId, r.id)).orderBy(desc(integrationOutbox.sentAt)).limit(1);
        out.push({
          id: r.id,
          name: r.name,
          kind: r.kind,
          url: r.url,
          events: r.events,
          active: r.active,
          createdAt: r.createdAt.toISOString(),
          lastDeliveryAt: last?.sentAt?.toISOString() ?? null,
          lastStatus: last ? `${last.status}${last.lastStatusCode ? ` (${last.lastStatusCode})` : ''}` : null,
          pendingDeliveries: stats.find((s) => s.status === 'pending')?.n ?? 0,
          failedDeliveries: stats.find((s) => s.status === 'failed')?.n ?? 0,
        });
      }
      return out;
    });
  }

  async create(scope: EmployerScope, input: z.infer<typeof integrationCreateSchema>, meta: RequestMeta) {
    await this.assertSafeUrl(input.url);
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const [r] = await tx
        .insert(integrations)
        .values({ employerId, name: input.name, kind: 'webhook', url: input.url, secretEncrypted: this.box.encrypt(input.secret), events: input.events, createdByUserId: scope.userId })
        .returning({ id: integrations.id });
      await this.audit.record(tx, { employerId, category: 'privileged', action: 'integration.created', actorUserId: scope.userId, entityType: 'integration', entityId: r!.id, summary: `Webhook "${input.name}" cadastrado`, ip: meta.ip, metadata: { events: input.events, host: new URL(input.url).host } });
      return { id: r!.id };
    });
  }

  async setActive(scope: EmployerScope, id: string, active: boolean, meta: RequestMeta) {
    const { employerId } = scope.membership;
    await this.tenant.run(employerId, async (tx) => {
      const res = await tx.update(integrations).set({ active }).where(and(eq(integrations.id, id), eq(integrations.employerId, employerId))).returning({ id: integrations.id });
      if (!res.length) throw notFound('Integração');
      await this.audit.record(tx, { employerId, category: 'privileged', action: active ? 'integration.activated' : 'integration.deactivated', actorUserId: scope.userId, entityType: 'integration', entityId: id, summary: active ? 'Integração ativada' : 'Integração desativada', ip: meta.ip });
    });
  }

  /** Despacha a fila de todos os empregadores (cada um no próprio contexto de RLS). */
  async dispatchAll() {
    if (this.running) return;
    this.running = true;
    try {
      const ids = await this.db.execute<{ pn_employer_ids: string }>(sql`select pn_employer_ids()`);
      for (const row of ids) await this.dispatchEmployer(row.pn_employer_ids);
    } catch (err) {
      this.logger.error('Falha no despacho de webhooks', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.running = false;
    }
  }

  async dispatchEmployer(employerId: string) {
    const due = await this.tenant.run(employerId, (tx) =>
      tx
        .select({ o: integrationOutbox, i: integrations })
        .from(integrationOutbox)
        .innerJoin(integrations, eq(integrations.id, integrationOutbox.integrationId))
        .where(and(eq(integrationOutbox.status, 'pending'), lte(integrationOutbox.nextAttemptAt, new Date()), eq(integrations.active, true)))
        .orderBy(asc(integrationOutbox.createdAt))
        .limit(BATCH),
    );
    for (const { o, i } of due) {
      const body = JSON.stringify(o.payload);
      let statusCode: number | null = null;
      let error: string | null = null;
      try {
        const res = await fetch(i.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-pontonexo-event': o.eventType,
            'x-pontonexo-delivery': o.id,
            'x-pontonexo-signature': `sha256=${hmacSha256(this.box.decrypt(i.secretEncrypted), body)}`,
          },
          body,
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        });
        statusCode = res.status;
        if (!res.ok) error = `HTTP ${res.status}`;
      } catch (err) {
        error = err instanceof Error ? err.message.slice(0, 200) : 'erro';
      }
      const attempts = o.attempts + 1;
      await this.tenant.run(employerId, (tx) =>
        tx
          .update(integrationOutbox)
          .set(
            error
              ? {
                  attempts,
                  lastError: error,
                  lastStatusCode: statusCode,
                  status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
                  nextAttemptAt: new Date(Date.now() + Math.min(2 ** attempts * 60_000, 6 * 3600_000)),
                }
              : { attempts, status: 'sent', sentAt: new Date(), lastStatusCode: statusCode, lastError: null },
          )
          .where(eq(integrationOutbox.id, o.id)),
      );
    }
  }
}
