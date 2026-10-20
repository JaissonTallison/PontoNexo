'use client';
import type { DashboardBadges } from '@pontonexo/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { RevisarCorrecoes } from '@/components/revisar-correcoes';
import { RevisarOcorrencias } from '@/components/revisar-ocorrencias';
import { useSession } from '@/components/session';
import { PageHeader } from '@/components/ui';
import { SECAO } from '@/components/secoes';
import { useResource } from '@/lib/hooks';

type Aba = 'ajustes' | 'ocorrencias';

/** Tudo o que espera o empregador num lugar só: pedidos de ajuste e ocorrências das marcações. */
function Revisar() {
  const { can } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const badges = useResource<DashboardBadges>('/dashboard/badges');
  const tabs: Array<{ value: Aba; label: string; n: number; show: boolean }> = [
    { value: 'ajustes', label: 'Pedidos de ajuste', n: badges.data?.pendingCorrections ?? 0, show: can('corrections.read') },
    { value: 'ocorrencias', label: 'Ocorrências nas marcações', n: badges.data?.openAlerts ?? 0, show: can('punches.read') },
  ];
  const visible = tabs.filter((t) => t.show);
  const asked = params.get('aba') as Aba | null;
  const aba: Aba = visible.some((t) => t.value === asked) ? asked! : (visible[0]?.value ?? 'ajustes');

  return (
    <div>
      <PageHeader {...SECAO.revisar} title="Para revisar" back={{ href: '/painel', label: 'Início' }} />
      <div role="tablist" aria-label="O que revisar" className="mb-4 flex gap-1 border-b border-borda">
        {visible.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={aba === t.value}
            onClick={() => router.replace(`/painel/revisar?aba=${t.value}`)}
            className={`-mb-px flex items-center gap-2 border-b-[3px] px-3 py-2.5 font-semibold ${aba === t.value ? 'border-marcador text-marca' : 'border-transparent text-texto-2 hover:text-marca'}`}
          >
            {t.label}
            {t.n ? <span className="rounded-[6px] bg-marca px-1.5 text-xs font-bold text-white tabular">{t.n}</span> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel">{aba === 'ajustes' ? <RevisarCorrecoes /> : <RevisarOcorrencias />}</div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Revisar />
    </Suspense>
  );
}
