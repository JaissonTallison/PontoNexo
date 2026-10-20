import { firstName, plural, renderEmail } from '../../common/email-template.js';
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
          b.pendingCorrections ? plural(b.pendingCorrections, 'pedido de ajuste para decidir', 'pedidos de ajuste para decidir') : null,
          b.openAlerts ? plural(b.openAlerts, 'ocorrência de marcação para revisar', 'ocorrências de marcação para revisar') : null,
          b.overdueDataRequests ? plural(b.overdueDataRequests, 'pedido de dados pessoais com prazo vencido', 'pedidos de dados pessoais com prazo vencido') : null,
          b.openIncidents ? plural(b.openIncidents, 'incidente em aberto', 'incidentes em aberto') : null,
          dash.unclosed ? `O mês ${dash.unclosed.month.split('-').reverse().join('/')} ainda não foi fechado (${plural(dash.unclosed.employees, 'funcionário', 'funcionários')})` : null,
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
        const body = renderEmail(
          {
            preheader: plan.lines.join(' · '),
            title: 'Resumo de hoje',
            greeting: `Olá, ${firstName(r.name)}.`,
            paragraphs: [`Há ${plan.lines.length === 1 ? 'um item esperando' : 'itens esperando'} por você em ${plan.name}:`],
            items: plan.lines,
            button: { label: 'Abrir o painel', url: `${this.env.WEB_ORIGIN}/painel` },
            reason: 'Você recebe este resumo só nos dias em que há algo pendente.',
          },
          this.env.WEB_ORIGIN,
        );
        await this.mail.send({ to: r.email, subject: `Resumo de hoje · ${plan.name}`, ...body });
        sent++;
      }
    }
    return sent;
  }
}
