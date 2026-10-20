import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { Env } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { dailySummariesSent, employers, userRoles, users } from '../../db/schema.js';
import { MailService } from '../../common/mail.service.js';
import { TenantDb } from '../../common/tenant.js';
import { DB, ENV } from '../../common/tokens.js';
import { GovernanceService } from './governance.service.js';

const SEND_HOUR = 8;

/**
 * E-mail diário às 8h (fuso do empregador) para titular e gestores, só quando há algo pendente:
 * pedidos de ajuste, ocorrências, pedidos LGPD vencidos, incidentes e mês anterior sem fechamento.
 */
@Injectable()
export class DailySummaryJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Resumo diário');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly tenant: TenantDb,
    private readonly gov: GovernanceService,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    if (!this.env.JOBS_ENABLED) return;
    this.timer = setInterval(() => void this.run().catch((e: unknown) => this.logger.error('Falha no resumo diário', { error: String(e) })), 15 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Retorna quantos e-mails foram enviados. `now` permite testar o horário. */
  async run(now = new Date()): Promise<number> {
    const ids = await this.db.execute<{ pn_employer_ids: string }>(sql`select pn_employer_ids()`);
    let sent = 0;
    for (const { pn_employer_ids: employerId } of ids) {
      const plan = await this.tenant.run(employerId, async (tx) => {
        const [emp] = await tx.select().from(employers).where(eq(employers.id, employerId));
        const local = DateTime.fromJSDate(now, { zone: emp!.timezone });
        if (local.hour < SEND_HOUR) return null;
        const b = await this.gov.badgesFor(employerId);
        const dash = await this.gov.dashboardFor(employerId);
        const lines = [
          b.pendingCorrections ? `• ${b.pendingCorrections} pedido(s) de ajuste para decidir` : null,
          b.openAlerts ? `• ${b.openAlerts} ocorrência(s) de marcação para revisar` : null,
          b.overdueDataRequests ? `• ${b.overdueDataRequests} pedido(s) de dados pessoais com prazo vencido` : null,
          b.openIncidents ? `• ${b.openIncidents} incidente(s) em aberto` : null,
          dash.unclosed ? `• O mês ${dash.unclosed.month.split('-').reverse().join('/')} ainda não foi fechado para ${dash.unclosed.employees} funcionário(s)` : null,
        ].filter(Boolean) as string[];
        if (!lines.length) return null;
        const claimed = await tx.insert(dailySummariesSent).values({ employerId, date: local.toISODate()! }).onConflictDoNothing().returning({ id: dailySummariesSent.id });
        if (!claimed.length) return null;
        return { name: emp!.displayName, lines };
      });
      if (!plan) continue;
      const recipients = await this.db
        .select({ email: users.email, name: users.name })
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.userId))
        .where(and(eq(userRoles.employerId, employerId), eq(userRoles.active, true), inArray(userRoles.roleCode, ['employer_owner', 'employer_manager']), eq(users.status, 'active')));
      for (const r of recipients) {
        await this.mail.send({
          to: r.email,
          subject: `PontoNexo · ${plan.name}: há itens para você ver hoje`,
          text: `Olá, ${r.name}.\n\nResumo de hoje em ${plan.name}:\n\n${plan.lines.join('\n')}\n\nAbra o painel: ${this.env.WEB_ORIGIN}/painel\n\nVocê recebe este e-mail só nos dias em que há algo pendente.`,
        });
        sent++;
      }
    }
    return sent;
  }
}
