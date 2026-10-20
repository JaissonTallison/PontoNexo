'use client';
import { UserPlus } from 'lucide-react';
import { CONTRACT_REGIME_LABEL, type ContractRegime, type Page } from '@pontonexo/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '@/components/session';
import { Card, DataTable, Empty, ErrorState, Input, Loading, PageHeader, Pagination, Segmented, Toolbar, Tone } from '@/components/ui';
import { SECAO } from '@/components/secoes';
import { qs } from '@/lib/api';
import { useResource } from '@/lib/hooks';

interface Row {
  id: string;
  fullName: string;
  cpfMasked: string;
  email: string | null;
  jobRoleName: string | null;
  status: 'active' | 'inactive';
  hasAccess: boolean;
  contract: { regime: ContractRegime; startDate: string } | null;
  state: string;
}

export default function Funcionarios() {
  const { can } = useSession();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data, error, loading, reload } = useResource<Page<Row>>(`/employees${qs({ search: q, status, page })}`);

  return (
    <div>
      <PageHeader {...SECAO.funcionarios}
        back={{ href: '/painel', label: 'Início' }}
        title="Funcionários"
        actions={
          can('employees.write') ? (
            <Link href="/painel/funcionarios/novo" className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-marca px-4 font-semibold text-white hover:bg-marca-2">
              <UserPlus size={18} aria-hidden /> Novo funcionário
            </Link>
          ) : null
        }
      />
      <Card>
        <Toolbar>
          <div className="w-full max-w-xs">
            <Input label="Buscar" placeholder="Nome ou CPF" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Segmented
            label="Situação"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              { value: 'active', label: 'Ativos' },
              { value: 'inactive', label: 'Inativos' },
              { value: 'all', label: 'Todos' },
            ]}
          />
        </Toolbar>
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : (
          <>
            <DataTable
              rows={data?.items ?? []}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/painel/funcionarios/${r.id}`)}
              empty={<Empty title={q ? 'Nenhum funcionário encontrado' : 'Nenhum funcionário cadastrado'} description={q ? 'Confira o nome ou CPF digitado.' : 'Cadastre o primeiro funcionário para começar a registrar o ponto.'} />}
              columns={[
                { key: 'nome', header: 'Nome', cell: (r) => <span className="font-semibold">{r.fullName}</span> },
                { key: 'cpf', header: 'CPF', cell: (r) => <span className="font-mono tabular">{r.cpfMasked}</span>, hideOnMobile: true },
                { key: 'funcao', header: 'Função', cell: (r) => r.jobRoleName ?? '—', hideOnMobile: true },
                { key: 'contrato', header: 'Contrato', cell: (r) => (r.contract ? CONTRACT_REGIME_LABEL[r.contract.regime].split(' (')[0] : <Tone tone="warn">Sem contrato vigente</Tone>) },
                { key: 'acesso', header: 'Acesso ao app', cell: (r) => (r.hasAccess ? 'Ativo' : <Tone tone="muted">Sem acesso</Tone>) },
                {
                  key: 'agora',
                  header: 'Agora',
                  cell: (r) => (r.state === 'working' ? <Tone tone="ok">Trabalhando</Tone> : r.state === 'on_break' ? 'Em intervalo' : <Tone tone="muted">Fora de jornada</Tone>),
                },
              ]}
            />
            {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
          </>
        )}
      </Card>
    </div>
  );
}
