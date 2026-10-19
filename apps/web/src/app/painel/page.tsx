'use client';
import { GEO_STATUS_LABEL, PUNCH_TYPE_LABEL, type DashboardView } from '@pontonexo/shared';
import { ChevronRight, FileClock, ListChecks, ShieldCheck, AlertTriangle, Siren, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useSession } from '@/components/session';
import { Card, Empty, ErrorState, Loading, PageHeader, Tone } from '@/components/ui';
import { dataHora, hora, plural } from "@/lib/formato";
import { useResource } from '@/lib/hooks';

function Pendencia({ href, icon: Icon, title, kind, status }: { href: string; icon: typeof FileClock; title: string; kind: string; status: string }) {
  return (
    <li>
      <Link href={href} className="group flex items-center gap-3 rounded-[8px] px-2 py-2 hover:bg-realce">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-borda bg-fundo text-marca">
          <Icon size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-sm text-texto-3">{kind}</span>
        </span>
        <span className="text-sm font-semibold text-atencao">{status}</span>
        <ChevronRight size={16} className="text-texto-3 opacity-0 group-hover:opacity-100" aria-hidden />
      </Link>
    </li>
  );
}

export default function VisaoGeral() {
  const { me } = useSession();
  const tz = me.timezone;
  const { data, error, loading, reload } = useResource<DashboardView>('/dashboard');
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Erro ao carregar.'} onRetry={reload} />;

  const pend = [
    data.pendingCorrections && { href: '/painel/correcoes', icon: ListChecks, title: plural(data.pendingCorrections, 'pedido de correção', 'pedidos de correção'), kind: 'Tratamento · aguardando sua decisão', status: 'Decidir' },
    data.openAlerts && { href: '/painel/ocorrencias', icon: AlertTriangle, title: plural(data.openAlerts, 'ocorrência em marcação', 'ocorrências em marcações'), kind: 'Registro · revisão humana, sem penalidade automática', status: 'Revisar' },
    data.awaitingEmployee && { href: '/painel/correcoes', icon: UserCheck, title: plural(data.awaitingEmployee, 'proposta aguardando funcionário', 'propostas aguardando funcionário'), kind: 'Tratamento · depende da concordância do funcionário', status: 'Aguardando' },
    data.openDataRequests && { href: '/painel/privacidade', icon: ShieldCheck, title: plural(data.openDataRequests, 'pedido de titular de dados', 'pedidos de titulares de dados'), kind: 'LGPD · prazo de 15 dias', status: 'Responder' },
    data.openIncidents && { href: '/painel/incidentes', icon: Siren, title: plural(data.openIncidents, 'incidente em aberto', 'incidentes em aberto'), kind: 'Governança', status: 'Acompanhar' },
  ].filter(Boolean) as Array<Parameters<typeof Pendencia>[0]>;

  const alertLine = data.pendingCorrections || data.openAlerts ? [data.pendingCorrections ? plural(data.pendingCorrections, 'correção pendente', 'correções pendentes') : null, data.openAlerts ? plural(data.openAlerts, 'ocorrência aberta', 'ocorrências abertas') : null].filter(Boolean).join(' · ') : null;

  return (
    <div>
      <PageHeader title="Visão geral" alert={alertLine} />
      {data.clockStatus !== 'synced' ? (
        <p className="mb-4 text-sm text-atencao">
          {data.clockStatus === 'drift' ? 'O relógio do servidor está com defasagem acima do limite. As marcações seguem registradas e ficam sinalizadas.' : 'A sincronização do relógio do servidor ainda não foi verificada.'}
        </p>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Em jornada agora" className="xl:col-span-1">
          {data.working.length ? (
            <ul className="divide-y divide-borda">
              {data.working.map((w) => (
                <li key={w.employeeId} className="flex justify-between gap-2 py-2">
                  <Link href={`/painel/funcionarios/${w.employeeId}`} className="font-semibold hover:underline">
                    {w.fullName}
                  </Link>
                  <span className="text-sm text-texto-2">
                    {w.state === 'on_break' ? 'Em intervalo' : 'Trabalhando'} · desde {hora(w.since, tz)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-texto-3">Ninguém em jornada. {plural(data.activeEmployees, 'funcionário ativo', 'funcionários ativos')}.</p>
          )}
        </Card>
        <Card title="Pendências" className="xl:col-span-2">
          {pend.length ? (
            <ul>
              {pend.map((p) => (
                <Pendencia key={p.href + p.title} {...p} />
              ))}
            </ul>
          ) : (
            <Empty title="Nenhuma pendência" description="Correções, ocorrências e pedidos de dados aparecem aqui." />
          )}
        </Card>
        <Card title="Últimas marcações" className="xl:col-span-3" actions={<Link href="/painel/marcacoes" className="text-sm font-semibold text-acao hover:underline">Ver todas</Link>}>
          {data.recentPunches.length ? (
            <ul className="divide-y divide-borda">
              {data.recentPunches.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <span className="font-mono tabular">{dataHora(p.serverTime, tz)}</span> · <span className="font-semibold">{p.employeeName}</span> · {PUNCH_TYPE_LABEL[p.type as keyof typeof PUNCH_TYPE_LABEL]}
                  </span>
                  <Tone tone={p.hasAlerts ? 'warn' : 'muted'}>{p.hasAlerts ? 'Com ocorrência' : GEO_STATUS_LABEL[p.geoStatus as keyof typeof GEO_STATUS_LABEL]}</Tone>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Nenhuma marcação ainda" />
          )}
        </Card>
      </div>
    </div>
  );
}
