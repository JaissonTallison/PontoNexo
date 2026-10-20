'use client';
import { Check, Reply, Send } from 'lucide-react';
import { DATA_REQUEST_KIND_LABEL, type DataRequestView, type RetentionPolicyView } from '@pontonexo/shared';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Button, Card, Dialog, Empty, ErrorState, Input, Loading, Notice, PageHeader, Select, Textarea, Tone, usePaged } from '@/components/ui';
import { SECAO } from '@/components/secoes';
import { api, ApiError } from '@/lib/api';
import { dataCurta, plural } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

const NOME: Record<string, string> = { punch_coordinates: 'Coordenadas GPS das marcações', punch_records: 'Marcações, comprovantes e tratamentos', audit_events: 'Trilha de auditoria', sessions: 'Sessões de acesso', password_resets: 'Links de senha' };

export default function Privacidade() {
  const { me, can } = useSession();
  const tz = me.timezone;
  const reqs = useResource<DataRequestView[]>('/data-requests');
  const reqsPage = usePaged(reqs.data ?? [], 10);
  const ret = useResource<RetentionPolicyView[]>(can('settings.manage') ? '/settings/retention' : null);
  const [answering, setAnswering] = useState<DataRequestView | null>(null);
  const [answer, setAnswer] = useState({ status: 'answered' as 'answered' | 'denied', response: '' });
  const [days, setDays] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const overdue = (reqs.data ?? []).filter((r) => r.status === 'open' && new Date(r.dueAt).getTime() < Date.now()).length;

  return (
    <div className="space-y-4">
      <PageHeader {...SECAO.privacidade} title="Privacidade (LGPD)" back={{ href: '/painel', label: 'Início' }} alert={overdue ? `${plural(overdue, 'pedido vencido', 'pedidos vencidos')} sem resposta` : null} />
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <Card title="Pedidos dos titulares">
        {reqs.loading && !reqs.data ? <Loading /> : reqs.error ? <ErrorState message={reqs.error.message} onRetry={reqs.reload} /> : !reqs.data?.length ? (
          <Empty title="Nenhum pedido" description="Funcionários pedem acesso, correção, cópia ou eliminação pelo app." />
        ) : (
          <>
          <ul className="divide-y divide-borda">
            {reqsPage.rows.map((r) => {
              const late = r.status === 'open' && new Date(r.dueAt).getTime() < Date.now();
              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold">{DATA_REQUEST_KIND_LABEL[r.kind]} · {r.requesterName}</p>
                    <p className="text-sm text-texto-2">{r.details}</p>
                    {r.response ? <p className="text-sm text-texto-3">Resposta: {r.response}</p> : null}
                  </div>
                  <div className="text-right">
                    {r.status === 'open' ? <Tone tone={late ? 'error' : 'warn'}>{late ? `Vencido em ${dataCurta(r.dueAt, tz)}` : `Prazo ${dataCurta(r.dueAt, tz)}`}</Tone> : <Tone tone="muted">{r.status === 'answered' ? 'Respondido' : 'Negado'}</Tone>}
                    {r.status === 'open' ? <div className="mt-2"><Button size="sm" onClick={() => { setAnswering(r); setAnswer({ status: 'answered', response: '' }); }}><Reply size={18} aria-hidden /> Responder</Button></div> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {reqsPage.pager}
          </>
        )}
      </Card>
      {ret.data ? (
        <Card title="Retenção e descarte">
          <ul className="divide-y divide-borda">
            {ret.data.map((p) => (
              <li key={p.category} className="py-3">
                <p className="font-semibold">{NOME[p.category] ?? p.category}<span className="font-normal text-texto-3"> · {p.retentionDays} dias · {p.action === 'anonymize' ? 'reduzir ao resultado' : 'eliminar'}</span></p>
                <p className="text-sm text-texto-2">{p.description}</p>
                <p className="text-xs text-texto-3">Base: {p.legalBasis}</p>
                {p.editable ? (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    <div className="w-40"><Input label="Prazo (dias)" type="number" min={30} max={3650} placeholder={String(p.retentionDays)} value={days} onChange={(e) => setDays(e.target.value)} /></div>
                    <Button size="sm" disabled={!days} onClick={async () => {
                      try { await api.put('/settings/retention', { policies: [{ category: 'punch_coordinates', retentionDays: Number(days) }] }); setDays(''); setMsg({ tone: 'ok', text: 'Prazo atualizado.' }); ret.reload(); }
                      catch (e) { setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Erro ao salvar.' }); }
                    }}><Check size={18} aria-hidden /> Salvar prazo</Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Dialog open={answering !== null} title="Responder pedido" onClose={() => setAnswering(null)} footer={
        <Button onClick={async () => {
          if (!answering) return;
          try { await api.post(`/data-requests/${answering.id}/respond`, answer); setAnswering(null); setMsg({ tone: 'ok', text: 'Resposta registrada.' }); reqs.reload(); }
          catch (e) { setMsg({ tone: 'error', text: e instanceof ApiError ? (e.fields.response ?? e.message) : 'Erro ao responder.' }); }
        }}><Send size={18} aria-hidden /> Enviar resposta</Button>
      }>
        {answering ? (
          <div className="space-y-3">
            <p className="text-sm text-texto-2">{answering.details}</p>
            <Select label="Resultado" value={answer.status} onChange={(e) => setAnswer({ ...answer, status: e.target.value as 'answered' | 'denied' })}>
              <option value="answered">Atendido</option>
              <option value="denied">Negado, com justificativa legal</option>
            </Select>
            <Textarea label="Resposta" value={answer.response} onChange={(e) => setAnswer({ ...answer, response: e.target.value })} hint="Marcações não podem ser eliminadas enquanto houver obrigação de guarda (LC 150, art. 42)." />
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
