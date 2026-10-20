'use client';
import { FilePen } from 'lucide-react';
import type { CorrectionView, Page } from '@pontonexo/shared';
import { useState } from 'react';
import { CorrectionForm, CorrectionList, DecisionDialog } from '@/components/correcoes';
import { EmployeeSelect } from '@/components/filtros';
import { useSession } from '@/components/session';
import { Button, Card, Dialog, ErrorState, Loading, Notice, Pagination, Segmented } from '@/components/ui';
import { SectionHeader } from '@/components/revisar';
import { qs } from '@/lib/api';
import { plural } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

export function RevisarCorrecoes() {
  const { me, can } = useSession();
  const tz = me.timezone;
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [page, setPage] = useState(1);
  const list = useResource<Page<CorrectionView>>(`/corrections${qs({ status, page })}`);
  const [deciding, setDeciding] = useState<CorrectionView | null>(null);
  const [proposing, setProposing] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const toDecide = list.data?.items.filter((c) => c.canDecide).length ?? 0;

  return (
    <div>
      <SectionHeader
        alert={status === 'pending' && toDecide ? `${plural(toDecide, 'pedido aguarda', 'pedidos aguardam')} sua decisão` : null}
        actions={can('corrections.propose') ? <Button onClick={() => setProposing(true)}><FilePen size={18} aria-hidden /> Propor ajuste</Button> : null}
      />
      <p className="mb-4 max-w-3xl text-texto-2">
        Quem pede não decide. Pedidos do funcionário são decididos aqui. Ajustes propostos pelo empregador só valem depois que o funcionário aceita. As marcações originais nunca são alteradas.
      </p>
      <div className="mb-3">
        <Segmented
          label="Situação"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: 'pending', label: 'Pendentes' },
            { value: 'approved', label: 'Aprovadas' },
            { value: 'rejected', label: 'Recusadas' },
            { value: 'all', label: 'Todas' },
          ]}
        />
      </div>
      {done ? <div className="mb-3"><Notice tone="ok">{done}</Notice></div> : null}
      <Card>
        {list.loading && !list.data ? <Loading /> : list.error ? <ErrorState message={list.error.message} onRetry={list.reload} /> : (
          <>
            <CorrectionList items={list.data?.items ?? []} tz={tz} onDecide={setDeciding} showEmployee />
            {list.data ? <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} /> : null}
          </>
        )}
      </Card>
      <DecisionDialog item={deciding} tz={tz} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); setDone('Decisão registrada.'); list.reload(); }} />
      <Dialog open={proposing} title="Propor ajuste ao funcionário" onClose={() => setProposing(false)}>
        <div className="space-y-3">
          <EmployeeSelect value={employeeId} onChange={setEmployeeId} />
          {employeeId ? (
            <CorrectionForm key={employeeId} tz={tz} employeeId={employeeId} onDone={() => { setProposing(false); setDone('Proposta enviada. Ela só vale depois que o funcionário aceitar.'); list.reload(); }} />
          ) : (
            <p className="text-sm text-texto-3">Escolha o funcionário.</p>
          )}
        </div>
      </Dialog>
    </div>
  );
}
