'use client';
import { GEO_STATUS_LABEL, PUNCH_TYPE_LABEL, type DashboardTodayRow, type DashboardView, type SetupStatus } from '@pontonexo/shared';
import { AlertTriangle, ArrowRight, CalendarCheck, Check, ChevronRight, ClipboardCheck, Download, FileClock, ListChecks, ShieldCheck, Siren, UserCheck, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useSession } from '@/components/session';
import { SECAO } from '@/components/secoes';
import { Empty, ErrorState, Loading, PageHeader } from '@/components/ui';
import { duracao, hora, mesAnterior, mesAtual, nomeMes, plural } from '@/lib/formato';
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
    <section className="cartao-3d min-w-0 rounded-[8px] bg-card">
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

/** Atalho no mesmo formato das pendências: ícone, título, explicação e seta. */
function QuickAction({ href, icon: Icon, label, hint, download = false }: { href: string; icon: typeof Users; label: string; hint: string; download?: boolean }) {
  const cls = 'group flex items-center gap-3 rounded-[8px] border border-borda px-3 py-3 hover:border-borda-forte hover:bg-realce';
  const body = (
    <>
      <Icon size={20} className="shrink-0 text-marca-3" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-texto">{label}</span>
        <span className="block text-xs text-texto-3">{hint}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-texto-3 group-hover:text-marca" aria-hidden />
    </>
  );
  return <li>{download ? <a href={href} className={cls}>{body}</a> : <Link href={href} className={cls}>{body}</Link>}</li>;
}

const MISSING_LABEL: Record<SetupStatus['pending'][number]['missing'][number], string> = {
  contrato: 'contrato',
  local: 'local autorizado',
  horário: 'horário',
  acesso: 'acesso ao app',
};

/** Roteiro de configuração: some sozinho quando tudo está pronto para os funcionários marcarem o ponto. */
function FirstSteps({ setup, canWrite }: { setup: SetupStatus; canWrite: boolean }) {
  const steps = [
    { done: setup.hasLocation, title: 'Cadastrar a casa', hint: 'Endereço e a área (cerca) onde o ponto pode ser marcado.', href: '/painel/locais', cta: 'Cadastrar a casa' },
    { done: setup.hasSchedule, title: 'Criar o horário de trabalho', hint: 'Dias, entrada, saída e almoço. Dá para usar o horário comercial pronto.', href: '/painel/escalas', cta: 'Criar horário' },
    { done: setup.employees > 0, title: 'Cadastrar o funcionário', hint: 'Um passo a passo pede só o necessário.', href: '/painel/funcionarios/novo', cta: 'Cadastrar' },
    {
      done: setup.employees > 0 && setup.pending.length === 0,
      title: 'Deixar tudo pronto para marcar',
      hint: setup.pending.length
        ? setup.pending
            .slice(0, 3)
            .map((p) => `${p.fullName}: falta ${p.missing.map((m) => MISSING_LABEL[m]).join(', ')}`)
            .join(' · ')
        : 'Contrato, local, horário e acesso ao app de cada funcionário.',
      href: setup.pending[0] ? `/painel/funcionarios/${setup.pending[0].employeeId}` : '/painel/funcionarios',
      cta: 'Completar',
    },
  ];
  if (steps.every((s) => s.done)) return null;
  const next = steps.findIndex((s) => !s.done);
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="cartao-3d rounded-[8px] bg-card p-4" aria-labelledby="primeiros-passos">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="primeiros-passos" className="text-md font-bold text-marca">
          Primeiros passos
        </h2>
        <p className="text-sm text-texto-3">
          {done} de {steps.length} concluídos
        </p>
      </div>
      <ol className="mt-3 grid items-start gap-2 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className={`flex flex-col rounded-[8px] border px-3 py-3 ${i === next ? 'border-marca-3 bg-marca-suave' : 'border-borda'}`}>
            <span className="flex items-center gap-2">
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-[8px] text-sm font-bold ${s.done ? 'bg-acao text-white' : i === next ? 'bg-marca text-white' : 'bg-realce text-texto-2'}`} aria-hidden>
                {s.done ? <Check size={16} /> : i + 1}
              </span>
              <span className={`font-semibold ${s.done ? 'text-texto-3' : 'text-texto'}`}>
                {s.title}
                {s.done ? <span className="sr-only"> (concluído)</span> : null}
              </span>
            </span>
            {!s.done ? <span className="mt-1.5 flex-1 text-sm text-texto-2">{s.hint}</span> : null}
            {!s.done && i === next && (canWrite || i !== 2) ? (
              <Link href={s.href} className="mt-3 inline-flex h-9 items-center self-start rounded-[8px] bg-marca px-4 text-sm font-semibold text-white hover:bg-marca-2">
                {s.cta}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
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
    { n: data.pendingCorrections, href: '/painel/revisar?aba=ajustes', icon: ListChecks, title: plural(data.pendingCorrections, 'pedido de ajuste', 'pedidos de ajuste'), hint: 'Aguardando sua decisão', cta: 'Decidir' },
    { n: data.openAlerts, href: '/painel/revisar?aba=ocorrencias', icon: AlertTriangle, title: plural(data.openAlerts, 'ocorrência em marcação', 'ocorrências em marcações'), hint: 'Revisão humana, sem penalidade automática', cta: 'Revisar' },
    { n: data.awaitingEmployee, href: '/painel/revisar?aba=ajustes', icon: UserCheck, title: plural(data.awaitingEmployee, 'proposta aguardando funcionário', 'propostas aguardando funcionário'), hint: 'Depende da concordância do funcionário', cta: 'Ver' },
    { n: data.openDataRequests, href: '/painel/privacidade', icon: ShieldCheck, title: plural(data.openDataRequests, 'pedido de titular de dados', 'pedidos de titulares de dados'), hint: 'LGPD: prazo de 15 dias', cta: 'Responder' },
    { n: data.openIncidents, href: '/painel/incidentes', icon: Siren, title: plural(data.openIncidents, 'incidente em aberto', 'incidentes em aberto'), hint: 'Governança', cta: 'Acompanhar' },
  ].filter((p) => p.n > 0);

  return (
    <div className="space-y-5">
      <div>
        <PageHeader title="Início" {...SECAO.inicio} />
        {data.clockStatus !== 'synced' ? <p className="text-sm text-atencao">{data.clockStatus === 'drift' ? 'Relógio do servidor com defasagem: as marcações seguem registradas e sinalizadas.' : 'Sincronização do relógio em verificação.'}</p> : null}
      </div>

      <FirstSteps setup={data.setup} canWrite={can('employees.write')} />

      {data.unclosed && can('closings.manage') ? (
        <Link href="/painel/fechamento" className="cartao-3d flex flex-wrap items-center gap-3 rounded-[8px] bg-card px-4 py-3 hover:bg-realce">
          <CalendarCheck size={22} className="shrink-0 text-marca-3" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-texto first-letter:uppercase">{nomeMes(data.unclosed.month)} ainda não foi fechado</span>
            <span className="block text-sm text-texto-3">{plural(data.unclosed.employees, 'funcionário sem fechamento', 'funcionários sem fechamento')}. Feche para guardar o espelho e liberar a ciência no app.</span>
          </span>
          <span className="inline-flex h-9 items-center rounded-[8px] bg-marca px-4 text-sm font-semibold text-white">Fechar o mês</span>
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi href="/painel/funcionarios" icon={Users} label="Em jornada agora" value={working} hint={`de ${plural(data.activeEmployees, 'funcionário ativo', 'funcionários ativos')}`} tone="ok" />
        <Kpi href="/painel/marcacoes" icon={FileClock} label="Marcações hoje" value={data.punchesToday} hint="Ver todas as marcações" />
        <Kpi href="/painel/revisar?aba=ajustes" icon={ListChecks} label="Pedidos de ajuste" value={data.pendingCorrections} hint={data.pendingCorrections ? 'Aguardando sua decisão' : 'Nada para decidir'} tone="warn" />
        <Kpi href="/painel/revisar?aba=ocorrencias" icon={AlertTriangle} label="Ocorrências abertas" value={data.openAlerts} hint={data.openAlerts ? 'Para revisar' : 'Nada para revisar'} tone="warn" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Panel title="Hoje, por funcionário" action={<Link href="/painel/fechamento" className="text-sm font-semibold text-marca-3 hover:text-marca">Folha do mês</Link>}>
          {data.today.length ? (
            <>
            <ul className="space-y-2 md:hidden">
              {data.today.map((r) => (
                <li key={r.employeeId}>
                  <Link href={`/painel/funcionarios/${r.employeeId}`} className="block rounded-[8px] border border-borda px-3 py-2.5 hover:bg-realce">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-texto">{r.fullName}</span>
                      <span className={`text-sm font-semibold ${STATE[r.state].tone}`}>{STATE[r.state].text}</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-texto-3 tabular">
                      Entrada {r.firstIn ? hora(r.firstIn, tz) : '—'} · {r.workedSeconds ? duracao(r.workedSeconds) : '0h'}
                      {r.expectedSeconds ? ` de ${duracao(r.expectedSeconds)}` : ''}
                      {r.alerts ? <span className="font-semibold text-atencao"> · {plural(r.alerts, 'ocorrência', 'ocorrências')}</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-borda text-left text-texto-3">
                    <th className="px-3 py-2 font-semibold">Funcionário</th>
                    <th className="px-3 py-2 font-semibold">Situação</th>
                    <th className="px-3 py-2 font-semibold">Entrada</th>
                    <th className="px-3 py-2 text-right font-semibold">Horas hoje</th>
                    <th className="px-3 py-2 text-right font-semibold">Ocorrências</th>
                  </tr>
                </thead>
                <tbody>
                  {data.today.map((r) => (
                    <tr key={r.employeeId} className="border-b border-borda last:border-0 even:bg-zebra hover:bg-realce">
                      <td className="px-3 py-2.5">
                        <Link href={`/painel/funcionarios/${r.employeeId}`} className="font-semibold text-texto hover:underline">
                          {r.fullName}
                        </Link>
                      </td>
                      <td className={`px-3 py-2.5 font-semibold whitespace-nowrap ${STATE[r.state].tone}`}>{STATE[r.state].text}</td>
                      <td className="px-3 py-2.5 font-semibold tabular">{r.firstIn ? hora(r.firstIn, tz) : '—'}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular">
                        <span className="font-semibold">{r.workedSeconds ? duracao(r.workedSeconds) : '—'}</span>
                        {r.expectedSeconds ? <span className="block text-xs text-texto-3">de {duracao(r.expectedSeconds)}</span> : null}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular ${r.alerts ? 'text-atencao' : 'text-texto-3'}`}>{r.alerts || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
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

        <Panel title="Atalhos">
          <ul className="space-y-2">
            {can('employees.write') ? <QuickAction href="/painel/funcionarios/novo" icon={UserPlus} label="Cadastrar funcionário" hint="Passo a passo com dados, contrato, horário e local" /> : null}
            <QuickAction href="/painel/fechamento" icon={ClipboardCheck} label="Folha e fechamento do mês" hint="Resumo de todos e fechamento de uma vez" />
            {can('exports.run') ? (
              <QuickAction href={`/api/exports/summary.csv?month=${mesAnterior(mesAtual(tz))}`} icon={Download} label="Exportar o mês passado" hint="Planilha (CSV) para o contador" download />
            ) : null}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
