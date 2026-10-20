'use client';
import { GEO_STATUS_LABEL, PUNCH_TYPE_LABEL, type DashboardTodayRow, type DashboardView } from '@pontonexo/shared';
import { AlertTriangle, ArrowRight, ClipboardCheck, Download, FileClock, ListChecks, ShieldCheck, Siren, UserCheck, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useSession } from '@/components/session';
import { Empty, ErrorState, Loading } from '@/components/ui';
import { duracao, hora, mesAtual, plural } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

/** Indicador com profundidade; o cartão inteiro leva à tela correspondente. */
function Kpi({ href, icon: Icon, label, value, hint, tone = 'brand' }: { href: string; icon: typeof Users; label: string; value: number; hint: string; tone?: 'brand' | 'warn' | 'ok' }) {
  const color = tone === 'warn' && value > 0 ? 'text-atencao' : tone === 'ok' ? 'text-acao' : 'text-marca';
  return (
    <Link href={href} className="cartao-3d group flex flex-col justify-between rounded-[8px] bg-card p-4 transition-transform hover:-translate-y-0.5">
      <span className="flex items-center justify-between">
        <span className="text-sm font-semibold text-texto-2">{label}</span>
        <Icon size={20} className="text-marca-3" aria-hidden />
      </span>
      <span className={`mt-2 text-[32px] leading-none font-bold tabular ${color}`}>{value}</span>
      <span className="mt-2 flex items-center justify-between text-xs text-texto-3">
        {hint}
        <ArrowRight size={14} className="opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </span>
    </Link>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="cartao-3d rounded-[8px] bg-card">
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h2 className="text-md font-bold text-marca">{title}</h2>
        {action}
      </header>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

const STATE: Record<DashboardTodayRow['state'], { text: string; tone: string }> = {
  working: { text: 'Trabalhando', tone: 'text-acao' },
  on_break: { text: 'Em pausa', tone: 'text-marca-3' },
  done: { text: 'Encerrou o dia', tone: 'text-texto-2' },
  absent: { text: 'Ainda não chegou', tone: 'text-atencao' },
  off: { text: 'Folga', tone: 'text-texto-3' },
};

function QuickAction({ href, icon: Icon, label }: { href: string; icon: typeof Users; label: string }) {
  return (
    <Link href={href} className="cartao-3d flex items-center gap-3 rounded-[8px] bg-card px-4 py-3 font-semibold text-marca transition-transform hover:-translate-y-0.5">
      <Icon size={20} className="text-marca-3" aria-hidden />
      {label}
    </Link>
  );
}

export default function VisaoGeral() {
  const { me, can } = useSession();
  const tz = me.timezone;
  const { data, error, loading, reload } = useResource<DashboardView>('/dashboard');
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Erro ao carregar.'} onRetry={reload} />;

  const working = data.today.filter((r) => r.state === 'working' || r.state === 'on_break').length;
  const pend = [
    { n: data.pendingCorrections, href: '/painel/correcoes', icon: ListChecks, title: plural(data.pendingCorrections, 'pedido de correção', 'pedidos de correção'), hint: 'Aguardando sua decisão', cta: 'Decidir' },
    { n: data.openAlerts, href: '/painel/ocorrencias', icon: AlertTriangle, title: plural(data.openAlerts, 'ocorrência em marcação', 'ocorrências em marcações'), hint: 'Revisão humana, sem penalidade automática', cta: 'Revisar' },
    { n: data.awaitingEmployee, href: '/painel/correcoes', icon: UserCheck, title: plural(data.awaitingEmployee, 'proposta aguardando funcionário', 'propostas aguardando funcionário'), hint: 'Depende da concordância do funcionário', cta: 'Ver' },
    { n: data.openDataRequests, href: '/painel/privacidade', icon: ShieldCheck, title: plural(data.openDataRequests, 'pedido de titular de dados', 'pedidos de titulares de dados'), hint: 'LGPD: prazo de 15 dias', cta: 'Responder' },
    { n: data.openIncidents, href: '/painel/incidentes', icon: Siren, title: plural(data.openIncidents, 'incidente em aberto', 'incidentes em aberto'), hint: 'Governança', cta: 'Acompanhar' },
  ].filter((p) => p.n > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold text-marca">Visão geral</h1>
        {data.clockStatus !== 'synced' ? <p className="text-sm text-atencao">{data.clockStatus === 'drift' ? 'Relógio do servidor com defasagem: as marcações seguem registradas e sinalizadas.' : 'Sincronização do relógio em verificação.'}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi href="/painel/funcionarios" icon={Users} label="Em jornada agora" value={working} hint={`de ${plural(data.activeEmployees, 'funcionário ativo', 'funcionários ativos')}`} tone="ok" />
        <Kpi href="/painel/marcacoes" icon={FileClock} label="Marcações hoje" value={data.punchesToday} hint="Ver todas as marcações" />
        <Kpi href="/painel/correcoes" icon={ListChecks} label="Correções pendentes" value={data.pendingCorrections} hint={data.pendingCorrections ? 'Aguardando sua decisão' : 'Nada para decidir'} tone="warn" />
        <Kpi href="/painel/ocorrencias" icon={AlertTriangle} label="Ocorrências abertas" value={data.openAlerts} hint={data.openAlerts ? 'Para revisar' : 'Nada para revisar'} tone="warn" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Panel title="Hoje, por funcionário" action={<Link href="/painel/espelho" className="text-sm font-semibold text-marca-3 hover:text-marca">Espelho do mês</Link>}>
          {data.today.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-borda text-left text-texto-3">
                    <th className="py-2 pr-2 font-semibold">Funcionário</th>
                    <th className="py-2 pr-2 font-semibold">Situação</th>
                    <th className="py-2 pr-2 font-semibold">Entrada</th>
                    <th className="py-2 pr-2 text-right font-semibold">Horas hoje</th>
                    <th className="py-2 text-right font-semibold">Ocorrências</th>
                  </tr>
                </thead>
                <tbody>
                  {data.today.map((r) => (
                    <tr key={r.employeeId} className="border-b border-borda last:border-0 even:bg-zebra hover:bg-realce">
                      <td className="py-2.5 pr-2">
                        <Link href={`/painel/funcionarios/${r.employeeId}`} className="font-semibold text-texto hover:underline">
                          {r.fullName}
                        </Link>
                      </td>
                      <td className={`py-2.5 pr-2 font-semibold ${STATE[r.state].tone}`}>{STATE[r.state].text}</td>
                      <td className="py-2.5 pr-2 font-semibold tabular">{r.firstIn ? hora(r.firstIn, tz) : '—'}</td>
                      <td className="py-2.5 pr-2 text-right tabular">
                        <span className="font-semibold">{r.workedSeconds ? duracao(r.workedSeconds) : '—'}</span>
                        {r.expectedSeconds ? <span className="block text-xs text-texto-3">de {duracao(r.expectedSeconds)}</span> : null}
                      </td>
                      <td className={`py-2.5 text-right font-semibold tabular ${r.alerts ? 'text-atencao' : 'text-texto-3'}`}>{r.alerts || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Nenhum funcionário ativo" action={<Link href="/painel/funcionarios/novo" className="font-semibold text-acao underline">Cadastrar funcionário</Link>} />
          )}
        </Panel>

        <Panel title="Pendências">
          {pend.length ? (
            <ul className="space-y-2">
              {pend.map((p) => (
                <li key={p.href + p.title}>
                  <Link href={p.href} className="group flex items-center gap-3 rounded-[8px] border border-borda px-3 py-3 hover:border-borda-forte hover:bg-realce">
                    <p.icon size={20} className="shrink-0 text-marca-3" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-texto">{p.title}</span>
                      <span className="block text-xs text-texto-3">{p.hint}</span>
                    </span>
                    <span className="inline-flex h-8 items-center rounded-[8px] bg-marca px-3 text-sm font-semibold text-white">{p.cta}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Tudo em dia" description="Correções, ocorrências e pedidos de dados aparecem aqui." />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Panel title="Últimas marcações" action={<Link href="/painel/marcacoes" className="text-sm font-semibold text-marca-3 hover:text-marca">Ver todas</Link>}>
          {data.recentPunches.length ? (
            <ul className="divide-y divide-borda">
              {data.recentPunches.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-12 shrink-0 font-bold text-marca tabular">{hora(p.serverTime, tz)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold">{p.employeeName}</span> <span className="text-texto-3">· {PUNCH_TYPE_LABEL[p.type as keyof typeof PUNCH_TYPE_LABEL]}</span>
                  </span>
                  <span className={`shrink-0 text-xs font-semibold ${p.hasAlerts ? 'text-atencao' : 'text-texto-3'}`}>{p.hasAlerts ? 'Com ocorrência' : GEO_STATUS_LABEL[p.geoStatus as keyof typeof GEO_STATUS_LABEL]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Nenhuma marcação ainda" />
          )}
        </Panel>

        <section>
          <h2 className="mb-2 text-md font-bold text-marca">Atalhos</h2>
          <div className="grid gap-2">
            {can('employees.write') ? <QuickAction href="/painel/funcionarios/novo" icon={UserPlus} label="Cadastrar funcionário" /> : null}
            <QuickAction href="/painel/espelho" icon={ClipboardCheck} label="Espelho e fechamento do mês" />
            {can('exports.run') ? (
              <a href={`/api/exports/punches.csv?month=${mesAtual(tz)}`} className="cartao-3d flex items-center gap-3 rounded-[8px] bg-card px-4 py-3 font-semibold text-marca transition-transform hover:-translate-y-0.5">
                <Download size={20} className="text-marca-3" aria-hidden />
                Exportar marcações do mês (CSV)
              </a>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
