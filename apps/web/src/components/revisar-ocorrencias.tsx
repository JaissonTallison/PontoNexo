'use client';
import { PUNCH_TYPE_LABEL, type Page } from '@pontonexo/shared';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Button, Card, Dialog, Empty, ErrorState, Loading, Notice, Pagination, Segmented, Textarea, Tone } from '@/components/ui';
import { SectionHeader } from '@/components/revisar';
import { api, ApiError, qs } from '@/lib/api';
import { dataHora, plural } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

interface AlertRow {
  id: string;
  code: string;
  label: string;
  detail: string | null;
  status: 'open' | 'reviewed';
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  employeeName: string;
  punch: { id: string; nsr: number; type: keyof typeof PUNCH_TYPE_LABEL; serverTime: string; justification: string | null; locationName: string | null };
}

export function RevisarOcorrencias() {
  const { me, can } = useSession();
  const tz = me.timezone;
  const [status, setStatus] = useState<'open' | 'reviewed' | 'all'>('open');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useResource<Page<AlertRow>>(`/alerts${qs({ status, page })}`);
  const [reviewing, setReviewing] = useState<AlertRow | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      <SectionHeader alert={status === 'open' && data?.total ? `${plural(data.total, 'ocorrência aguarda', 'ocorrências aguardam')} revisão` : null} />
      <p className="mb-4 max-w-3xl text-texto-2">
        Sinais técnicos (fora do raio, GPS impreciso, sem conexão, relógio divergente) não comprovam fraude nem ausência. Revise com a justificativa do funcionário e, se algo estiver errado, proponha uma correção. Nenhuma penalidade é aplicada automaticamente.
      </p>
      <div className="mb-3">
        <Segmented label="Situação" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: 'open', label: 'Abertas' }, { value: 'reviewed', label: 'Revisadas' }, { value: 'all', label: 'Todas' }]} />
      </div>
      <Card>
        {loading && !data ? <Loading /> : error ? <ErrorState message={error.message} onRetry={reload} /> : !data?.items.length ? (
          <Empty title={status === 'open' ? 'Nenhuma ocorrência aberta' : 'Nada por aqui'} />
        ) : (
          <>
            <ul className="divide-y divide-borda">
              {data.items.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.label}</p>
                    <p className="text-sm text-texto-3">
                      {a.employeeName} · {PUNCH_TYPE_LABEL[a.punch.type]} de {dataHora(a.punch.serverTime, tz)} · NSR {a.punch.nsr} · {a.punch.locationName ?? 'Outro local'}
                    </p>
                    {a.detail ? <p className="text-sm text-texto-2">{a.detail}</p> : null}
                    {a.punch.justification ? <p className="text-sm text-texto-2">Justificativa: {a.punch.justification}</p> : null}
                    {a.reviewNote ? <p className="text-sm text-texto-2">Revisão: {a.reviewNote}</p> : null}
                  </div>
                  <div className="text-right">
                    {a.status === 'open' ? <Tone tone="warn">Aberta</Tone> : <Tone tone="muted">Revisada {a.reviewedAt ? dataHora(a.reviewedAt, tz) : ''}</Tone>}
                    {a.status === 'open' && can('alerts.review') ? (
                      <div className="mt-2">
                        <Button size="sm" onClick={() => { setReviewing(a); setNote(''); setErr(null); }}>
                          Registrar revisão
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <Dialog
        open={reviewing !== null}
        title="Revisar ocorrência"
        onClose={() => setReviewing(null)}
        footer={
          <Button
            onClick={async () => {
              if (!reviewing) return;
              try {
                await api.post(`/alerts/${reviewing.id}/review`, { note });
                setReviewing(null);
                reload();
              } catch (e) {
                setErr(e instanceof ApiError ? (e.fields.note ?? e.message) : 'Não foi possível salvar.');
              }
            }}
          >
            Salvar revisão
          </Button>
        }
      >
        <p className="mb-3 text-sm text-texto-2">A revisão registra sua análise. Ela não altera a marcação. Para ajustar horário, use a aba Pedidos de ajuste.</p>
        <Textarea label="Análise" value={note} onChange={(e) => setNote(e.target.value)} hint="Ex.: confirmado com a funcionária, estava no mercado a pedido da família." />
        {err ? <div className="mt-2"><Notice tone="error">{err}</Notice></div> : null}
      </Dialog>
    </div>
  );
}
