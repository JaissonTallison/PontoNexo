import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Env } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { AuditService } from '../../common/audit.service.js';
import { TenantDb } from '../../common/tenant.js';
import { DB, ENV } from '../../common/tokens.js';

/** Aplica a política de retenção uma vez por dia (e na subida da API). */
@Injectable()
export class RetentionJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Retenção');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly tenant: TenantDb,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    if (!this.env.JOBS_ENABLED) return;
    setTimeout(() => void this.run(), 60_000).unref();
    this.timer = setInterval(() => void this.run(), 24 * 3600_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run() {
    try {
      const ids = await this.db.execute<{ pn_employer_ids: string }>(sql`select pn_employer_ids()`);
      for (const { pn_employer_ids: employerId } of ids) {
        await this.tenant.run(employerId, async (tx) => {
          const [r] = await tx.execute<{ n: number }>(sql`select pn_apply_coordinate_retention(${employerId}) as n`);
          const n = Number(r?.n ?? 0);
          if (n > 0) await this.audit.record(tx, { employerId, category: 'system', action: 'retention.coordinates_purged', summary: `Coordenadas de ${n} marcação(ões) reduzidas ao resultado`, metadata: { count: n } });
        });
      }
      await this.tenant.platform(async (tx) => {
        const [r] = await tx.execute<{ sessions_deleted: number; tokens_deleted: number }>(sql`select * from pn_purge_access_data(180, 7)`);
        await this.audit.record(tx, { employerId: null, category: 'system', action: 'retention.access_data_purged', summary: 'Sessões e links de senha vencidos apagados', metadata: { sessions: Number(r?.sessions_deleted ?? 0), tokens: Number(r?.tokens_deleted ?? 0) } });
      });
    } catch (err) {
      this.logger.error('Falha ao aplicar retenção', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
