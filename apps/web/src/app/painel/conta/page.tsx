'use client';
import { EmployerNotices } from '@/components/avisos-painel';
import { AccountPanel } from '@/components/conta';
import { PageHeader } from '@/components/ui';
import { SECAO } from '@/components/secoes';

export default function Conta() {
  return (
    <div className="max-w-[720px] space-y-4">
      <PageHeader {...SECAO.conta} title="Minha conta" back={{ href: '/painel', label: 'Início' }} />
      <EmployerNotices />
      <AccountPanel />
    </div>
  );
}
