'use client';
import type { ClosingView, CorrectionView, Page } from '@pontonexo/shared';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { CorrectionList, DecisionDialog } from '@/components/correcoes';
import { useSession } from '@/components/session';
import { Button, Card, ErrorState, Loading, Notice, Pagination, Segmented, Textarea, Tone } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { dataHora, nomeMes } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

function ClosingAck({ c, tz, onDone }: { c: ClosingView; tz: string; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (agree: boolean) => {
    setBusy(true);
    try {
      await api.post(`/me/closings/${c.id}/acknowledge`, { agree, note: note || null });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="py-3">
      <p className="font-semibold">{nomeMes(c.month)}</p>
      <p className="text-sm text-texto-3">
        Fechado por {c.closedByName} em {dataHora(c.closedAt, tz)}
      </p>
      {c.acknowledgedAt ? (
        <p className="mt-1 text-sm">
          <Tone tone="ok">Ciência registrada</Tone> <span className="text-texto-3">{c.acknowledgementNote}</span>
        </p>
      ) : c.status === 'closed' ? (
        <div className="mt-2 space-y-2">
          <Textarea label="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} hint="Se discordar, explique o que está errado." />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" busy={busy} onClick={() => send(true)}>
              Estou de acordo
            </Button>
            <Button size="sm" variant="danger" busy={busy} onClick={() => send(false)} disabled={note.trim().length < 5}>
              Discordo
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm text-texto-3">Reaberto: {c.reopenReason}</p>
      )}
    </li>
  );
}

export default function Correcoes() {
  const { me } = useSession();
  const tz = me.timezone;
  const [tab, setTab] = useState<'pedidos' | 'fechamentos'>('pedidos');
  const [page, setPage] = useState(1);
  const list = useResource<Page<CorrectionView>>(`/me/corrections?status=all&pageSize=10&page=${page}`);
  const closings = useResource<ClosingView[]>('/me/closings');
  const [deciding, setDeciding] = useState<CorrectionView | null>(null);
  // abrir a lista conta como "vi as respostas" (some do sino)
  useEffect(() => {
    if (list.data) void api.post('/me/corrections/seen').catch(() => undefined);
  }, [list.data]);
  const [done, setDone] = useState<string | null>(null);

  const awaiting = list.data?.items.filter((c) => c.canDecide) ?? [];
  const pendingAcks = closings.data?.filter((c) => c.status === 'closed' && !c.acknowledgedAt).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-marca">Meus pedidos</h1>
        <Link href="/app/correcoes/novo" className="inline-flex h-11 items-center gap-1.5 rounded-[8px] bg-marca px-4 font-semibold text-white shadow-card active:brightness-110">
          <Plus size={18} aria-hidden />
          Novo pedido
        </Link>
      </div>
      {awaiting.length ? <Notice tone="warn">{awaiting.length === 1 ? 'Seu empregador pediu 1 ajuste. Confira e responda.' : `Seu empregador pediu ${awaiting.length} ajustes. Confira e responda.`}</Notice> : null}
      <Segmented
        label="Seções"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pedidos', label: 'Pedidos' },
          { value: 'fechamentos', label: pendingAcks ? `Fechamentos (${pendingAcks})` : 'Fechamentos' },
        ]}
      />
      {done ? <Notice tone="ok">{done}</Notice> : null}
      {tab === 'pedidos' ? (
        <Card>{list.loading && !list.data ? <Loading /> : list.error ? <ErrorState message={list.error.message} onRetry={list.reload} /> : <>
              <CorrectionList items={list.data?.items ?? []} tz={tz} onDecide={setDeciding} simple />
              {list.data ? <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} /> : null}
            </>}</Card>
      ) : null}
      {tab === 'fechamentos' ? (
        <Card title="Meses fechados pelo empregador">
          {closings.loading && !closings.data ? (
            <Loading />
          ) : closings.data?.length ? (
            <ul className="divide-y divide-borda">
              {closings.data.map((c) => (
                <ClosingAck key={c.id} c={c} tz={tz} onDone={closings.reload} />
              ))}
            </ul>
          ) : (
            <p className="text-texto-3">Nenhum mês fechado ainda.</p>
          )}
        </Card>
      ) : null}
      <DecisionDialog
        simple
        item={deciding}
        tz={tz}
        onClose={() => setDeciding(null)}
        onDone={() => {
          setDeciding(null);
          setDone('Resposta registrada.');
          list.reload();
        }}
      />
    </div>
  );
}
