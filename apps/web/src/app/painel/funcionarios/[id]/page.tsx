'use client';
import { Ban, CalendarCheck, Check, FilePlus, FileX, LogOut, Pencil, Send, X } from 'lucide-react';
import {
  COMPENSATION_LABEL,
  COMPENSATION_REGIMES,
  CONTRACT_REGIME_LABEL,
  CONTRACT_REGIMES,
  formatDateBR,
  LOCATION_KIND_LABEL,
  type CompensationRegime,
  type ContractRegime,
  type LocationKind,
} from '@pontonexo/shared';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useSession } from '@/components/session';
import { Button, Card, Checkbox, DescList, Dialog, ErrorState, Input, Loading, Notice, PageHeader, Select, Textarea, Tone } from '@/components/ui';
import { SECAO } from '@/components/secoes';
import { api, ApiError } from '@/lib/api';
import { dataHora, hojeLocal } from '@/lib/formato';
import { useResource } from '@/lib/hooks';
import { JobRoleSelect } from '@/components/funcao';
import { mascaraTelefone } from '@/lib/mascara';

interface Detail {
  id: string;
  fullName: string;
  cpfMasked: string;
  email: string | null;
  phone: string | null;
  jobRoleId: string | null;
  jobRoleName: string | null;
  status: 'active' | 'inactive';
  contracts: Array<{ id: string; startDate: string; endDate: string | null; regime: ContractRegime; weeklyHours: number; residesAtWorkplace: boolean; breakReductionAgreement: boolean; compensation: CompensationRegime; travelAgreement: boolean; writtenAgreementRef: string | null; endReason: string | null; current: boolean }>;
  locations: Array<{ id: string; name: string; kind: LocationKind; validFrom: string; validTo: string | null; revokedAt: string | null; current: boolean }>;
  schedules: Array<{ id: string; name: string; validFrom: string; validTo: string | null; current: boolean }>;
  access: { status: 'none' | 'invited' | 'active' | 'disabled'; email: string | null; lastLoginAt: string | null };
}

const ACCESS_LABEL = { none: 'Sem acesso', invited: 'Convite enviado, senha não definida', active: 'Ativo', disabled: 'Desativado' };

function useAction(reload: () => void) {
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    setFields({});
    try {
      await fn();
      setMsg({ tone: 'ok', text: ok });
      reload();
      return true;
    } catch (e) {
      if (e instanceof ApiError) setFields(e.fields);
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Não foi possível concluir.' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { msg, fields, busy, run, setMsg };
}

function ContractDialog({ open, onClose, employeeId, onDone, tz }: { open: boolean; onClose: () => void; employeeId: string; onDone: () => void; tz: string }) {
  const [c, setC] = useState({ startDate: hojeLocal(tz), regime: 'full_time' as ContractRegime, weeklyHours: 44, residesAtWorkplace: false, breakReductionAgreement: false, compensation: 'none' as CompensationRegime, travelAgreement: false, writtenAgreementRef: '', notes: '' });
  const a = useAction(onDone);
  return (
    <Dialog
      open={open}
      title="Registrar contrato"
      onClose={onClose}
      footer={
        <Button busy={a.busy} onClick={async () => (await a.run(() => api.post(`/employees/${employeeId}/contracts`, { ...c, writtenAgreementRef: c.writtenAgreementRef || null, notes: c.notes || null }), 'Contrato registrado.')) && onClose()}>
          <Check size={18} aria-hidden /> Salvar contrato
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Início" type="date" value={c.startDate} onChange={(e) => setC({ ...c, startDate: e.target.value })} error={a.fields.startDate} />
        <Input label="Horas semanais" type="number" min={1} max={44} value={c.weeklyHours} onChange={(e) => setC({ ...c, weeklyHours: Number(e.target.value) })} error={a.fields.weeklyHours} />
        <div className="sm:col-span-2">
          <Select label="Regime" value={c.regime} onChange={(e) => setC({ ...c, regime: e.target.value as ContractRegime })}>
            {CONTRACT_REGIMES.map((r) => (
              <option key={r} value={r}>
                {CONTRACT_REGIME_LABEL[r]}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Select label="Compensação de horas" value={c.compensation} onChange={(e) => setC({ ...c, compensation: e.target.value as CompensationRegime })}>
            {COMPENSATION_REGIMES.map((r) => (
              <option key={r} value={r}>
                {COMPENSATION_LABEL[r]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Checkbox label="Reside no local de trabalho" hint="Permite dividir o intervalo em 2 períodos de no mínimo 1 h (LC 150, art. 13, § 1º)." checked={c.residesAtWorkplace} onChange={(e) => setC({ ...c, residesAtWorkplace: e.target.checked })} />
          <Checkbox label="Acordo escrito de redução do intervalo para 30 min" checked={c.breakReductionAgreement} onChange={(e) => setC({ ...c, breakReductionAgreement: e.target.checked })} />
          <Checkbox label="Acordo escrito de acompanhamento em viagem" hint="LC 150, art. 11." checked={c.travelAgreement} onChange={(e) => setC({ ...c, travelAgreement: e.target.checked })} />
        </div>
        <div className="sm:col-span-2">
          <Input label="Referência do acordo escrito" value={c.writtenAgreementRef} onChange={(e) => setC({ ...c, writtenAgreementRef: e.target.value })} error={a.fields.writtenAgreementRef} hint="Obrigatória para 12×36, redução de intervalo e compensação. Ex.: acordo assinado em 02/01/2026, guardado na pasta do contrato." />
        </div>
        <div className="sm:col-span-2">
          <Textarea label="Observações" value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} />
        </div>
      </div>
      {a.msg?.tone === 'error' ? <div className="mt-3"><Notice tone="error">{a.msg.text}</Notice></div> : null}
    </Dialog>
  );
}

function Detalhe() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { me, can } = useSession();
  const tz = me.timezone;
  const d = useResource<Detail>(`/employees/${id}`);
  const locs = useResource<Array<{ id: string; name: string; active: boolean }>>('/locations');
  const scheds = useResource<Array<{ id: string; name: string; active: boolean }>>('/schedules');
  const a = useAction(d.reload);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', jobRoleId: '', status: 'active' as 'active' | 'inactive' });
  const [contractOpen, setContractOpen] = useState(false);
  const [ending, setEnding] = useState<string | null>(null);
  const [endForm, setEndForm] = useState({ endDate: hojeLocal(tz), reason: '' });
  const [newLoc, setNewLoc] = useState({ locationId: '', validFrom: hojeLocal(tz), validTo: '' });
  const [newSched, setNewSched] = useState({ scheduleId: '', validFrom: hojeLocal(tz) });
  const write = can('employees.write');

  if (d.loading && !d.data) return <Loading />;
  if (d.error || !d.data) return <ErrorState message={d.error?.message ?? 'Funcionário não encontrado.'} onRetry={d.reload} />;
  const e = d.data;
  const current = e.contracts.find((c) => c.current);
  const missing = [!current && 'contrato vigente', !e.locations.some((l) => l.current) && 'local autorizado', !e.schedules.some((s) => s.current) && 'escala', e.access.status === 'none' && 'acesso ao app'].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <PageHeader {...SECAO.funcionario}
        back={{ href: '/painel/funcionarios', label: 'Funcionários' }}
        title={e.fullName}
        alert={missing.length ? `Falta configurar: ${missing.join(', ')}` : null}
        actions={
          <>
            <Link href={`/painel/espelho?funcionario=${e.id}`} className="inline-flex h-9 items-center rounded-[8px] bg-marca px-4 font-semibold text-white hover:bg-marca-2">
              Espelho de ponto
            </Link>
            {write && !edit ? (
              <Button
                onClick={() => {
                  setForm({ fullName: e.fullName, email: e.email ?? '', phone: mascaraTelefone(e.phone ?? ''), jobRoleId: e.jobRoleId ?? '', status: e.status });
                  setEdit(true);
                }}
              >
                <Pencil size={18} aria-hidden /> Editar cadastro
              </Button>
            ) : null}
          </>
        }
      />
      {params.get('novo') ? <Notice tone="ok">Funcionário cadastrado. Agora registre o contrato, autorize os locais e atribua a escala.</Notice> : null}
      {a.msg ? <Notice tone={a.msg.tone}>{a.msg.text}</Notice> : null}

      <Card title="Cadastro">
        {edit ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label="Nome completo" value={form.fullName} onChange={(x) => setForm({ ...form, fullName: x.target.value })} error={a.fields.fullName} />
            </div>
            <Input label="E-mail" type="email" value={form.email} onChange={(x) => setForm({ ...form, email: x.target.value })} error={a.fields.email} />
            <Input label="Celular" type="tel" inputMode="tel" value={form.phone} onChange={(x) => setForm({ ...form, phone: mascaraTelefone(x.target.value) })} />
            <JobRoleSelect value={form.jobRoleId} onChange={(id) => setForm({ ...form, jobRoleId: id })} />
            <Select label="Situação" value={form.status} onChange={(x) => setForm({ ...form, status: x.target.value as 'active' | 'inactive' })} hint="Inativo perde o acesso ao app; o histórico é mantido.">
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </Select>
            <div className="flex gap-2 sm:col-span-2">
              <Button busy={a.busy} onClick={async () => (await a.run(() => api.put(`/employees/${e.id}`, { ...form, email: form.email || null, phone: form.phone || null, jobRoleId: form.jobRoleId || null }), 'Cadastro atualizado.')) && setEdit(false)}>
                <Check size={18} aria-hidden /> Salvar
              </Button>
              <Button variant="secondary" onClick={() => setEdit(false)}>
                <X size={18} aria-hidden /> Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <DescList
            items={[
              ['CPF', <span key="c" className="font-mono">{e.cpfMasked}</span>],
              ['Função', e.jobRoleName ?? '—'],
              ['E-mail', e.email ?? '—'],
              ['Telefone', e.phone ?? '—'],
              ['Situação', e.status === 'active' ? 'Ativo' : <Tone key="s" tone="muted">Inativo</Tone>],
            ]}
          />
        )}
      </Card>

      <Card title="Contrato" actions={write ? <Button size="sm" onClick={() => setContractOpen(true)}><FilePlus size={18} aria-hidden /> Registrar contrato</Button> : null}>
        {e.contracts.length ? (
          <ul className="divide-y divide-borda">
            {e.contracts.map((c) => (
              <li key={c.id} className="py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {CONTRACT_REGIME_LABEL[c.regime]} · {c.weeklyHours} h/semana
                    </p>
                    <p className="text-sm text-texto-2">
                      {formatDateBR(c.startDate)} a {c.endDate ? formatDateBR(c.endDate) : 'atual'} · {COMPENSATION_LABEL[c.compensation]}
                      {c.residesAtWorkplace ? ' · reside no local' : ''}
                      {c.breakReductionAgreement ? ' · intervalo de 30 min por acordo' : ''}
                    </p>
                    {c.writtenAgreementRef ? <p className="text-sm text-texto-3">Acordo: {c.writtenAgreementRef}</p> : null}
                    {c.endReason ? <p className="text-sm text-texto-3">Encerramento: {c.endReason}</p> : null}
                  </div>
                  {c.current ? <Tone tone="ok">Vigente</Tone> : null}
                </div>
                {write && !c.endDate ? (
                  ending === c.id ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-end">
                      <Input label="Término" type="date" value={endForm.endDate} onChange={(x) => setEndForm({ ...endForm, endDate: x.target.value })} />
                      <Input label="Motivo" value={endForm.reason} onChange={(x) => setEndForm({ ...endForm, reason: x.target.value })} error={a.fields.reason} />
                      <Button variant="danger" busy={a.busy} onClick={async () => (await a.run(() => api.post(`/contracts/${c.id}/end`, endForm), 'Contrato encerrado.')) && setEnding(null)}>
                        <LogOut size={18} aria-hidden /> Encerrar
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" className="mt-1" onClick={() => setEnding(c.id)}>
                      <FileX size={18} aria-hidden /> Encerrar contrato
                    </Button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-texto-3">Nenhum contrato registrado. Sem contrato vigente, o funcionário não consegue marcar ponto.</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Locais autorizados">
          <ul className="divide-y divide-borda">
            {e.locations.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-semibold">{l.name}</p>
                  <p className="text-sm text-texto-3">
                    {LOCATION_KIND_LABEL[l.kind]} · desde {formatDateBR(l.validFrom)}
                    {l.validTo ? ` até ${formatDateBR(l.validTo)}` : ''}
                    {l.revokedAt ? ` · revogado em ${dataHora(l.revokedAt, tz)}` : ''}
                  </p>
                </div>
                {l.current && can('locations.write') ? (
                  <Button variant="ghost" size="sm" onClick={() => a.run(() => api.post(`/employee-locations/${l.id}/revoke`), 'Autorização revogada.')}>
                    <Ban size={18} aria-hidden /> Revogar
                  </Button>
                ) : !l.current ? (
                  <Tone tone="muted">Fora de vigência</Tone>
                ) : null}
              </li>
            ))}
          </ul>
          {can('locations.write') ? (
            <div className="mt-3 grid gap-2 border-t border-borda pt-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Select label="Autorizar local" value={newLoc.locationId} onChange={(x) => setNewLoc({ ...newLoc, locationId: x.target.value })}>
                  <option value="">Escolha…</option>
                  {(locs.data ?? []).filter((l) => l.active).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Input label="A partir de" type="date" value={newLoc.validFrom} onChange={(x) => setNewLoc({ ...newLoc, validFrom: x.target.value })} />
              <Input label="Até (opcional)" type="date" value={newLoc.validTo} onChange={(x) => setNewLoc({ ...newLoc, validTo: x.target.value })} hint="Para trabalho externo temporário." />
              <div>
                <Button size="sm" disabled={!newLoc.locationId} busy={a.busy} onClick={() => a.run(() => api.post(`/employees/${e.id}/locations`, { ...newLoc, validTo: newLoc.validTo || null }), 'Local autorizado.')}>
                  <Check size={18} aria-hidden /> Autorizar
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        <Card title="Escala">
          <ul className="divide-y divide-borda">
            {e.schedules.map((s) => (
              <li key={s.id} className="flex justify-between gap-2 py-2">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-sm text-texto-3">
                    {formatDateBR(s.validFrom)} a {s.validTo ? formatDateBR(s.validTo) : 'atual'}
                  </p>
                </div>
                {s.current ? <Tone tone="ok">Vigente</Tone> : null}
              </li>
            ))}
          </ul>
          {can('schedules.write') ? (
            <div className="mt-3 grid gap-2 border-t border-borda pt-3 sm:grid-cols-2">
              <Select label="Nova escala" value={newSched.scheduleId} onChange={(x) => setNewSched({ ...newSched, scheduleId: x.target.value })}>
                <option value="">Escolha…</option>
                {(scheds.data ?? []).filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Input label="Vigente a partir de" type="date" value={newSched.validFrom} onChange={(x) => setNewSched({ ...newSched, validFrom: x.target.value })} hint="A escala anterior termina no dia anterior." />
              <div>
                <Button size="sm" disabled={!newSched.scheduleId} busy={a.busy} onClick={() => a.run(() => api.post(`/employees/${e.id}/schedules`, newSched), 'Escala atribuída.')}>
                  <CalendarCheck size={18} aria-hidden /> Atribuir
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      <Card title="Acesso ao app">
        <p>
          <Tone tone={e.access.status === 'active' ? 'ok' : e.access.status === 'none' ? 'muted' : 'warn'}>{ACCESS_LABEL[e.access.status]}</Tone>
          {e.access.lastLoginAt ? <span className="text-sm text-texto-3"> · último acesso {dataHora(e.access.lastLoginAt, tz)}</span> : null}
        </p>
        {write && e.status === 'active' ? (
          <Button size="sm" className="mt-3" busy={a.busy} onClick={() => a.run(() => api.post(`/employees/${e.id}/access`), 'Acesso enviado por e-mail.')}>
            <Send size={18} aria-hidden /> {e.access.status === 'none' ? 'Enviar acesso por e-mail' : 'Reenviar acesso'}
          </Button>
        ) : null}
      </Card>

      <ContractDialog open={contractOpen} onClose={() => setContractOpen(false)} employeeId={e.id} onDone={d.reload} tz={tz} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Detalhe />
    </Suspense>
  );
}
