'use client';
import { Check, MessageSquarePlus, Siren } from 'lucide-react';
import { INCIDENT_KIND_LABEL, INCIDENT_KINDS, INCIDENT_SEVERITY, INCIDENT_SEVERITY_LABEL, INCIDENT_STATUS_LABEL, type IncidentKind, type IncidentSeverity, type IncidentStatus, type IncidentView, type Page } from '@pontonexo/shared';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Button, Card, Checkbox, Dialog, Empty, ErrorState, Input, Loading, Notice, PageHeader, Pagination, Select, Textarea, Tone } from '@/components/ui';
import { SECAO } from '@/components/secoes';
import { api, ApiError, qs } from '@/lib/api';
import { dataHora } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

export default function Incidentes() {
  const { me } = useSession();
  const tz = me.timezone;
  const [page, setPage] = useState(1);
  const list = useResource<Page<IncidentView>>(`/incidents${qs({ page })}`);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: 'security' as IncidentKind, severity: 'medium' as IncidentSeverity, title: '', description: '', personalDataAffected: false });
  const [upd, setUpd] = useState<{ item: IncidentView; status: IncidentStatus; note: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, after: () => void) {
    setFields({});
    setErr(null);
    try {
      await fn();
      after();
      list.reload();
    } catch (e) {
      if (e instanceof ApiError) setFields(e.fields);
      setErr(e instanceof ApiError ? e.message : 'Não foi possível salvar.');
    }
  }

  return (
    <div>
      <PageHeader {...SECAO.incidentes} title="Incidentes" back={{ href: '/painel', label: 'Início' }} actions={<Button onClick={() => setOpen(true)}><Siren size={18} aria-hidden /> Registrar incidente</Button>} />
      <p className="mb-4 max-w-3xl text-texto-2">
        Registre falhas, acessos indevidos, perda de aparelho ou vazamento. Incidentes com dados pessoais podem exigir comunicação à ANPD e aos titulares (LGPD, art. 48): veja o procedimento em docs/03-lgpd.md.
      </p>
      <Card>
        {list.loading && !list.data ? <Loading /> : list.error ? <ErrorState message={list.error.message} onRetry={list.reload} /> : !list.data?.items.length ? (
          <Empty title="Nenhum incidente registrado" />
        ) : (
          <>
            <ul className="divide-y divide-borda">
              {list.data.items.map((i) => (
                <li key={i.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{i.title}</p>
                      <p className="text-sm text-texto-3">
                        {INCIDENT_KIND_LABEL[i.kind]} · gravidade {INCIDENT_SEVERITY_LABEL[i.severity].toLowerCase()} · detectado em {dataHora(i.detectedAt, tz)} · {i.source === 'system' ? 'automático' : `por ${i.createdByName ?? '—'}`}
                        {i.personalDataAffected ? ' · envolve dados pessoais' : ''}
                      </p>
                      <p className="mt-1 text-sm text-texto-2">{i.description}</p>
                      {i.updates.length ? (
                        <ul className="mt-2 border-l-2 border-borda pl-3 text-sm">
                          {i.updates.map((u) => (
                            <li key={u.id} className="py-0.5 text-texto-2">
                              {dataHora(u.createdAt, tz)} · {INCIDENT_STATUS_LABEL[u.status]}: {u.note}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <Tone tone={i.status === 'resolved' ? 'muted' : i.severity === 'high' || i.severity === 'critical' ? 'error' : 'warn'}>{INCIDENT_STATUS_LABEL[i.status]}</Tone>
                      {i.status !== 'resolved' ? (
                        <div className="mt-2">
                          <Button size="sm" onClick={() => setUpd({ item: i, status: i.status === 'open' ? 'investigating' : 'resolved', note: '' })}>
                            <MessageSquarePlus size={18} aria-hidden /> Atualizar
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <Dialog open={open} title="Registrar incidente" onClose={() => setOpen(false)} footer={<Button onClick={() => run(() => api.post('/incidents', f), () => setOpen(false))}><Check size={18} aria-hidden /> Registrar</Button>}>
        <div className="space-y-3">
          <Select label="Tipo" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as IncidentKind })}>
            {INCIDENT_KINDS.map((k) => <option key={k} value={k}>{INCIDENT_KIND_LABEL[k]}</option>)}
          </Select>
          <Select label="Gravidade" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as IncidentSeverity })}>
            {INCIDENT_SEVERITY.map((k) => <option key={k} value={k}>{INCIDENT_SEVERITY_LABEL[k]}</option>)}
          </Select>
          <Input label="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={fields.title} />
          <Textarea label="O que aconteceu" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={fields.description} />
          <Checkbox label="Envolve dados pessoais" checked={f.personalDataAffected} onChange={(e) => setF({ ...f, personalDataAffected: e.target.checked })} />
          {err && !Object.keys(fields).length ? <Notice tone="error">{err}</Notice> : null}
        </div>
      </Dialog>
      <Dialog open={upd !== null} title="Atualizar incidente" onClose={() => setUpd(null)} footer={<Button onClick={() => upd && run(() => api.post(`/incidents/${upd.item.id}/updates`, { status: upd.status, note: upd.note }), () => setUpd(null))}><Check size={18} aria-hidden /> Salvar</Button>}>
        {upd ? (
          <div className="space-y-3">
            <Select label="Situação" value={upd.status} onChange={(e) => setUpd({ ...upd, status: e.target.value as IncidentStatus })}>
              <option value="investigating">Em análise</option>
              <option value="resolved">Resolvido</option>
            </Select>
            <Textarea label="Registro" value={upd.note} onChange={(e) => setUpd({ ...upd, note: e.target.value })} error={fields.note} />
            {err && !Object.keys(fields).length ? <Notice tone="error">{err}</Notice> : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
