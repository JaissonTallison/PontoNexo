import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { and, desc, eq, ne } from 'drizzle-orm';
import type { ClockStatus, TimeView } from '@pontonexo/shared';
import type { Env } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { incidents, incidentUpdates, timeSyncChecks } from '../../db/schema.js';
import { AuditService } from '../../common/audit.service.js';
import { TenantDb } from '../../common/tenant.js';
import { DB, ENV } from '../../common/tokens.js';
import { sntpQuery } from './sntp.js';

interface LastCheck {
  at: Date;
  offsetMs: number;
  server: string;
}

const DRIFT_KEY = 'time_sync:drift';

/**
 * Hora oficial = relógio do servidor (sincronizado por NTP no sistema operacional).
 * Este serviço não corrige o relógio: mede a defasagem periodicamente, grava a evidência
 * e abre incidente quando passa do limite. Cada marcação carrega o estado do relógio.
 */
@Injectable()
export class TimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Hora');
  private last: LastCheck | null = null;
  private timer: NodeJS.Timeout | null = null;
  private clock: () => Date = () => new Date();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly tenant: TenantDb,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    const [row] = await this.db.select().from(timeSyncChecks).where(eq(timeSyncChecks.ok, true)).orderBy(desc(timeSyncChecks.checkedAt)).limit(1);
    if (row?.offsetMs !== null && row?.offsetMs !== undefined) this.last = { at: row.checkedAt, offsetMs: row.offsetMs, server: row.server };
    if (this.env.NTP_ENABLED && this.env.JOBS_ENABLED) {
      void this.check();
      this.timer = setInterval(() => void this.check(), this.env.NTP_CHECK_INTERVAL_MINUTES * 60_000);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Instante oficial da marcação. */
  now(): Date {
    return this.clock();
  }

  /** Testes e seed de desenvolvimento: simula datas (virada de dia, meses anteriores). Bloqueado em produção. */
  useSimulatedClock(clock: (() => Date) | null) {
    if (this.env.NODE_ENV === 'production') throw new Error('Relógio simulado não é permitido em produção.');
    this.clock = clock ?? (() => new Date());
  }

  status(): { status: ClockStatus; offsetMs: number | null } {
    const maxAge = this.env.NTP_CHECK_INTERVAL_MINUTES * 3 * 60_000;
    if (!this.last || Date.now() - this.last.at.getTime() > maxAge) return { status: 'unverified', offsetMs: this.last?.offsetMs ?? null };
    return { status: Math.abs(this.last.offsetMs) > this.env.NTP_MAX_OFFSET_MS ? 'drift' : 'synced', offsetMs: this.last.offsetMs };
  }

  view(): TimeView {
    const s = this.status();
    return {
      serverTime: new Date().toISOString(),
      clockStatus: s.status,
      lastCheckAt: this.last?.at.toISOString() ?? null,
      lastOffsetMs: this.last?.offsetMs ?? null,
      source: this.last?.server ?? null,
    };
  }

  /** Consulta os servidores em ordem até um responder. */
  async check(): Promise<void> {
    const servers = this.env.NTP_SERVERS.split(',').map((s) => s.trim()).filter(Boolean);
    for (const server of servers) {
      try {
        const [host, port] = server.split(':');
        const r = await sntpQuery(host!, port ? Number(port) : 123);
        await this.db.insert(timeSyncChecks).values({ server, offsetMs: r.offsetMs, roundTripMs: r.roundTripMs, ok: true });
        this.last = { at: new Date(), offsetMs: r.offsetMs, server };
        await this.reconcileIncident(r.offsetMs, server);
        return;
      } catch (err) {
        await this.db.insert(timeSyncChecks).values({ server, ok: false, error: err instanceof Error ? err.message.slice(0, 300) : 'erro' });
      }
    }
    this.logger.warn('Nenhum servidor NTP respondeu', { servers: servers.length });
  }

  private async reconcileIncident(offsetMs: number, server: string) {
    const drift = Math.abs(offsetMs) > this.env.NTP_MAX_OFFSET_MS;
    await this.tenant.platform(async (tx) => {
      const [open] = await tx.select().from(incidents).where(and(eq(incidents.dedupeKey, DRIFT_KEY), ne(incidents.status, 'resolved'))).limit(1);
      if (drift && !open) {
        const [inc] = await tx
          .insert(incidents)
          .values({
            kind: 'time_sync',
            severity: 'high',
            title: 'Relógio do servidor com defasagem acima do limite',
            description: `Defasagem medida de ${offsetMs} ms contra ${server} (limite ${this.env.NTP_MAX_OFFSET_MS} ms). Marcações feitas neste período ficam com o estado "drift". Verifique o serviço NTP (chrony) do servidor.`,
            source: 'system',
            dedupeKey: DRIFT_KEY,
          })
          .returning({ id: incidents.id });
        await this.audit.record(tx, { employerId: null, category: 'system', action: 'incident.opened', entityType: 'incident', entityId: inc!.id, summary: 'Incidente automático: defasagem de relógio' });
        this.logger.error('Defasagem de relógio acima do limite', { offsetMs, server });
      } else if (!drift && open) {
        await tx.update(incidents).set({ status: 'resolved', resolvedAt: new Date() }).where(eq(incidents.id, open.id));
        await tx.insert(incidentUpdates).values({ incidentId: open.id, status: 'resolved', note: `Defasagem normalizada: ${offsetMs} ms contra ${server}.` });
      }
    });
  }

  async history(limit = 50) {
    return this.db.select().from(timeSyncChecks).orderBy(desc(timeSyncChecks.checkedAt)).limit(limit);
  }
}
