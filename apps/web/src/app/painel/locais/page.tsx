'use client';
import { Check, LocateFixed, MapPinPlus, Power, Target } from 'lucide-react';
import { DEFAULT_GEOFENCE_RADIUS_M, formatDateBR, LOCATION_KIND_LABEL, LOCATION_KINDS, type LocationKind } from '@pontonexo/shared';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Button, Card, DataTable, Dialog, Empty, ErrorState, Input, Loading, Notice, PageHeader, Select, Tone } from '@/components/ui';
import { SECAO } from '@/components/secoes';
import { api, ApiError } from '@/lib/api';
import { hojeLocal } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

const FenceMap = dynamic(() => import('@/components/mapa-cerca').then((m) => m.FenceMap), { ssr: false, loading: () => <div className="h-72 rounded-[8px] border border-borda bg-realce" /> });

interface Loc {
  id: string;
  name: string;
  kind: LocationKind;
  addressLine: string | null;
  active: boolean;
  geofence: { lat: number; lng: number; radiusM: number; validFrom: string } | null;
  authorizedEmployees: number;
}

function FenceFields({ v, onChange, fields }: { v: { lat: string; lng: string; radiusM: string }; onChange: (v: { lat: string; lng: string; radiusM: string }) => void; fields: Record<string, string> }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <FenceMap value={v} onChange={onChange} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Latitude" inputMode="decimal" value={v.lat} onChange={(e) => onChange({ ...v, lat: e.target.value })} error={fields['geofence.lat'] ?? fields.lat} />
        <Input label="Longitude" inputMode="decimal" value={v.lng} onChange={(e) => onChange({ ...v, lng: e.target.value })} error={fields['geofence.lng'] ?? fields.lng} />
        <Input label="Raio (m)" type="number" min={25} max={5000} value={v.radiusM} onChange={(e) => onChange({ ...v, radiusM: e.target.value })} error={fields['geofence.radiusM'] ?? fields.radiusM} />
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          navigator.geolocation.getCurrentPosition(
            (p) => {
              onChange({ ...v, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) });
              setMsg(`Posição capturada com precisão de ${Math.round(p.coords.accuracy)} m. Confira se está no local certo.`);
            },
            () => setMsg('Não foi possível obter a posição deste aparelho.'),
            { enableHighAccuracy: true, timeout: 15000 },
          )
        }
      >
        <LocateFixed size={18} aria-hidden /> Usar a posição deste aparelho
      </Button>
      {msg ? <p className="text-sm text-texto-2">{msg}</p> : null}
      <p className="text-xs text-texto-3">Comece com 100 m e ajuste conforme o sinal no local. Raio pequeno demais gera ocorrências por imprecisão do GPS, não por ausência.</p>
    </div>
  );
}

export default function Locais() {
  const { me, can } = useSession();
  const tz = me.timezone;
  const { data, error, loading, reload } = useResource<Loc[]>('/locations');
  const [creating, setCreating] = useState(false);
  const [fenceFor, setFenceFor] = useState<Loc | null>(null);
  const [f, setF] = useState({ name: '', kind: 'residence' as LocationKind, addressLine: '' });
  const [fence, setFence] = useState({ lat: '', lng: '', radiusM: String(DEFAULT_GEOFENCE_RADIUS_M) });
  const [validFrom, setValidFrom] = useState(hojeLocal(tz));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setFields({});
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'ok', text: ok });
      setCreating(false);
      setFenceFor(null);
      reload();
    } catch (e) {
      if (e instanceof ApiError) setFields(e.fields);
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Não foi possível salvar.' });
    } finally {
      setBusy(false);
    }
  }
  const fencePayload = () => ({ lat: Number(fence.lat), lng: Number(fence.lng), radiusM: Number(fence.radiusM) });

  return (
    <div>
      <PageHeader {...SECAO.locais}
        title="Casa e locais"
        back={{ href: '/painel', label: 'Início' }}
        actions={
          can('locations.write') ? (
            <Button
              onClick={() => {
                setF({ name: '', kind: 'residence', addressLine: '' });
                setFence({ lat: '', lng: '', radiusM: '100' });
                setCreating(true);
              }}
            >
              <MapPinPlus size={18} aria-hidden /> Novo local
            </Button>
          ) : null
        }
      />
      {msg ? <div className="mb-3"><Notice tone={msg.tone}>{msg.text}</Notice></div> : null}
      <Card>
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : (
          <DataTable
            pageSize={10}
            rows={data ?? []}
            rowKey={(r) => r.id}
            empty={<Empty title="Nenhum local cadastrado" description="Cadastre a residência e os locais externos autorizados, cada um com sua cerca virtual." />}
            columns={[
              { key: 'nome', header: 'Local', cell: (r) => <span className="font-semibold">{r.name}</span> },
              { key: 'tipo', header: 'Tipo', cell: (r) => LOCATION_KIND_LABEL[r.kind] },
              {
                key: 'cerca',
                header: 'Cerca virtual',
                cell: (r) => (r.geofence ? <span className="tabular">raio {r.geofence.radiusM} m · desde {formatDateBR(r.geofence.validFrom)}</span> : <Tone tone="muted">{r.kind === 'travel' ? 'Não se aplica' : 'Sem cerca vigente'}</Tone>),
              },
              { key: 'func', header: 'Funcionários autorizados', cell: (r) => <span className="tabular">{r.authorizedEmployees}</span> },
              { key: 'sit', header: 'Situação', cell: (r) => (r.active ? 'Ativo' : <Tone tone="muted">Inativo</Tone>) },
              {
                key: 'acoes',
                header: '',
                cell: (r) =>
                  can('locations.write') ? (
                    <span className="flex flex-wrap justify-end gap-1">
                      {r.kind !== 'travel' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setFence({ lat: String(r.geofence?.lat ?? ''), lng: String(r.geofence?.lng ?? ''), radiusM: String(r.geofence?.radiusM ?? 100) });
                            setValidFrom(hojeLocal(tz));
                            setFenceFor(r);
                          }}
                        >
                          <Target size={18} aria-hidden /> Redefinir cerca
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => run(() => api.put(`/locations/${r.id}`, { name: r.name, addressLine: r.addressLine, active: !r.active }), r.active ? 'Local desativado.' : 'Local reativado.')}>
                        <Power size={18} aria-hidden /> {r.active ? 'Desativar' : 'Reativar'}
                      </Button>
                    </span>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>

      <Dialog open={creating} title="Novo local" onClose={() => setCreating(false)} footer={<Button busy={busy} onClick={() => run(() => api.post('/locations', { ...f, addressLine: f.addressLine || null, geofence: f.kind === 'travel' ? null : fencePayload() }), 'Local cadastrado.')}><Check size={18} aria-hidden /> Salvar local</Button>}>
        <div className="space-y-3">
          <Input label="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={fields.name} />
          <Select label="Tipo" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as LocationKind })}>
            {LOCATION_KINDS.map((k) => (
              <option key={k} value={k}>
                {LOCATION_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
          <Input label="Endereço (opcional)" value={f.addressLine} onChange={(e) => setF({ ...f, addressLine: e.target.value })} />
          {f.kind !== 'travel' ? <FenceFields v={fence} onChange={setFence} fields={fields} /> : <p className="text-sm text-texto-3">Acompanhamento em viagem não tem cerca: a marcação registra a posição informada, sem comparar com raio.</p>}
          {msg?.tone === 'error' ? <Notice tone="error">{msg.text}</Notice> : null}
        </div>
      </Dialog>

      <Dialog open={fenceFor !== null} title={`Cerca de ${fenceFor?.name ?? ''}`} onClose={() => setFenceFor(null)} footer={<Button busy={busy} onClick={() => fenceFor && run(() => api.post(`/locations/${fenceFor.id}/geofences`, { ...fencePayload(), validFrom }), 'Cerca redefinida. Marcações antigas mantêm a cerca que estava valendo.')}><Check size={18} aria-hidden /> Salvar nova cerca</Button>}>
        <div className="space-y-3">
          <FenceFields v={fence} onChange={setFence} fields={fields} />
          <Input label="Vale a partir de" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          {msg?.tone === 'error' ? <Notice tone="error">{msg.text}</Notice> : null}
        </div>
      </Dialog>
    </div>
  );
}
