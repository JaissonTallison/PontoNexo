'use client';
import { DATA_REQUEST_KIND_LABEL, DATA_REQUEST_KINDS, type DataRequestKind, type DataRequestView } from '@pontonexo/shared';
import { useState } from 'react';
import { PrivacyNoticeText } from '@/components/privacidade';
import { useSession } from '@/components/session';
import { BackBar, Button, Card, Notice, Select, Textarea, Tone } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { dataCurta } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

export default function Privacidade() {
  const { me } = useSession();
  const tz = me.timezone;
  const reqs = useResource<DataRequestView[]>('/me/data-requests');
  const [kind, setKind] = useState<DataRequestKind>('access');
  const [details, setDetails] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      await api.post('/me/data-requests', { kind, details });
      setDetails('');
      setMsg({ tone: 'ok', text: 'Pedido registrado. O empregador tem 15 dias para responder.' });
      reqs.reload();
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof ApiError ? (e.fields.details ?? e.message) : 'Não foi possível enviar.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <BackBar title="Meus dados e privacidade" fallback="/app/conta" />
      <Card title="Seus dados">
        <p className="text-texto-2">Baixe uma cópia completa: cadastro, marcações com localização, comprovantes, correções e fechamentos.</p>
        <a href="/api/me/data-export" className="mt-3 inline-flex h-9 items-center rounded-[8px] border border-borda-forte px-4 font-semibold text-marca hover:bg-realce">
          Baixar meus dados (JSON)
        </a>
      </Card>
      <Card title="Fazer um pedido">
        <div className="space-y-3">
          <Select label="Tipo de pedido" value={kind} onChange={(e) => setKind(e.target.value as DataRequestKind)}>
            {DATA_REQUEST_KINDS.map((k) => (
              <option key={k} value={k}>
                {DATA_REQUEST_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
          <Textarea label="Detalhes" value={details} onChange={(e) => setDetails(e.target.value)} />
          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          <Button onClick={send} busy={busy} disabled={details.trim().length < 5}>
            Enviar pedido
          </Button>
        </div>
        {reqs.data?.length ? (
          <ul className="mt-4 divide-y divide-borda border-t border-borda">
            {reqs.data.map((r) => (
              <li key={r.id} className="py-2">
                <p className="font-semibold">{DATA_REQUEST_KIND_LABEL[r.kind]}</p>
                <p className="text-sm text-texto-3">
                  Enviado em {dataCurta(r.createdAt, tz)} · prazo {dataCurta(r.dueAt, tz)} ·{' '}
                  <Tone tone={r.status === 'open' ? 'warn' : r.status === 'answered' ? 'ok' : 'error'}>{r.status === 'open' ? 'Aguardando resposta' : r.status === 'answered' ? 'Respondido' : 'Negado'}</Tone>
                </p>
                {r.response ? <p className="mt-1 text-sm text-texto-2">Resposta: {r.response}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
      <Card title="Aviso de privacidade">
        <PrivacyNoticeText />
      </Card>
    </div>
  );
}
