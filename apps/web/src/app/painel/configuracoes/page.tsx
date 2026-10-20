'use client';
import { ROLE_LABEL, type IntegrationView } from '@pontonexo/shared';
import { useEffect, useState } from 'react';
import { useSession } from '@/components/session';
import { Button, Card, Checkbox, DataTable, Dialog, Input, Notice, PageHeader, Segmented, Select, Tone } from '@/components/ui';
import { SECAO } from '@/components/secoes';
import { api, ApiError } from '@/lib/api';
import { dataHora } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

interface Employer { displayName: string; legalName: string; documentMasked: string; timezone: string; addressLine: string | null; city: string | null; state: string | null }
interface UserRow { id: string; name: string; email: string; role: keyof typeof ROLE_LABEL; active: boolean; invitePending: boolean; lastLoginAt: string | null; isSelf: boolean }
interface Check { id: string; checkedAt: string; server: string; offsetMs: number | null; ok: boolean; error: string | null }
const FUSOS = ['America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza', 'America/Recife', 'America/Belem', 'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho', 'America/Boa_Vista', 'America/Rio_Branco', 'America/Noronha'];
const EVENTOS = { 'punch.accepted': 'Marcação aceita', 'treatment.created': 'Tratamento criado', 'closing.closed': 'Mês fechado' } as const;

export default function Configuracoes() {
  const { me, reload: reloadMe } = useSession();
  const tz = me.timezone;
  const [tab, setTab] = useState<'empregador' | 'usuarios' | 'integracoes' | 'hora'>('empregador');
  const emp = useResource<Employer>('/employer');
  const users = useResource<UserRow[]>(tab === 'usuarios' ? '/users' : null);
  const ints = useResource<IntegrationView[]>(tab === 'integracoes' ? '/integrations' : null);
  const checks = useResource<Check[]>(tab === 'hora' ? '/time/checks' : null);
  const [f, setF] = useState<Employer | null>(null);
  const [invite, setInvite] = useState({ open: false, name: '', email: '', role: 'employer_manager' });
  const [hook, setHook] = useState({ open: false, name: '', url: '', secret: '', events: ['punch.accepted'] as string[] });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => { if (emp.data) setF(emp.data); }, [emp.data]);

  async function run(fn: () => Promise<unknown>, ok: string, after?: () => void) {
    setFields({}); setMsg(null);
    try { await fn(); setMsg({ tone: 'ok', text: ok }); after?.(); }
    catch (e) { if (e instanceof ApiError) setFields(e.fields); setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Não foi possível salvar.' }); }
  }

  return (
    <div>
      <PageHeader {...SECAO.configuracoes} title="Usuários e dados" back={{ href: '/painel', label: 'Início' }} />
      <div className="mb-4"><Segmented label="Seção" value={tab} onChange={setTab} options={[{ value: 'empregador', label: 'Empregador' }, { value: 'usuarios', label: 'Usuários' }, { value: 'integracoes', label: 'Integrações' }, { value: 'hora', label: 'Hora oficial' }]} /></div>
      {msg ? <div className="mb-3"><Notice tone={msg.tone}>{msg.text}</Notice></div> : null}

      {tab === 'empregador' && f ? (
        <Card title="Dados do empregador">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Nome de exibição" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} error={fields.displayName} />
            <Input label="Nome do empregador" value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} error={fields.legalName} />
            <Input label="CPF" value={f.documentMasked} disabled hint="Identifica o empregador nos comprovantes; não é editável." />
            <Select label="Fuso horário" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>
              {FUSOS.map((z) => <option key={z} value={z}>{z.replace('America/', '').replace('_', ' ')}</option>)}
            </Select>
            <Input label="Endereço" value={f.addressLine ?? ''} onChange={(e) => setF({ ...f, addressLine: e.target.value })} />
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <Input label="Cidade" value={f.city ?? ''} onChange={(e) => setF({ ...f, city: e.target.value })} />
              <Input label="UF" maxLength={2} value={f.state ?? ''} onChange={(e) => setF({ ...f, state: e.target.value.toUpperCase() })} error={fields.state} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => run(() => api.put('/employer', { displayName: f.displayName, legalName: f.legalName, timezone: f.timezone, addressLine: f.addressLine || null, city: f.city || null, state: f.state || null }), 'Dados salvos.', () => { emp.reload(); reloadMe(); })}>Salvar</Button>
            <a href="/api/exports/employer.json" className="inline-flex h-9 items-center rounded-[8px] border border-borda-forte px-4 font-semibold text-marca hover:bg-realce">Exportar todos os dados (JSON)</a>
          </div>
        </Card>
      ) : null}

      {tab === 'usuarios' ? (
        <Card title="Quem acessa o painel" actions={<Button size="sm" onClick={() => setInvite({ ...invite, open: true })}>Convidar</Button>}>
          <DataTable pageSize={10} rows={(users.data ?? []).filter((u) => u.role !== 'employee')} rowKey={(u) => u.id} columns={[
            { key: 'n', header: 'Nome', cell: (u) => <span className="font-semibold">{u.name}{u.isSelf ? ' (você)' : ''}</span> },
            { key: 'e', header: 'E-mail', cell: (u) => u.email },
            { key: 'p', header: 'Papel', cell: (u) => ROLE_LABEL[u.role] },
            { key: 's', header: 'Situação', cell: (u) => (!u.active ? <Tone tone="muted">Desativado</Tone> : u.invitePending ? <Tone tone="warn">Convite pendente</Tone> : 'Ativo') },
            { key: 'l', header: 'Último acesso', cell: (u) => (u.lastLoginAt ? dataHora(u.lastLoginAt, tz) : '—'), hideOnMobile: true },
            { key: 'a', header: '', cell: (u) => (!u.isSelf && u.role !== 'employer_owner' ? <Button size="sm" variant="ghost" onClick={() => run(() => api.post(`/users/${u.id}/${u.active ? 'deactivate' : 'reactivate'}`), u.active ? 'Acesso desativado.' : 'Acesso reativado.', users.reload)}>{u.active ? 'Desativar' : 'Reativar'}</Button> : null) },
          ]} />
        </Card>
      ) : null}

      {tab === 'integracoes' ? (
        <Card title="Webhooks" actions={<Button size="sm" onClick={() => setHook({ ...hook, open: true })}>Novo webhook</Button>}>
          <p className="mb-3 text-sm text-texto-2">Eventos assinados com HMAC-SHA256 (cabeçalho x-pontonexo-signature). Não há integração pronta com REP-P certificado.</p>
          <DataTable pageSize={10} rows={ints.data ?? []} rowKey={(i) => i.id} columns={[
            { key: 'n', header: 'Nome', cell: (i) => <span className="font-semibold">{i.name}</span> },
            { key: 'u', header: 'Endereço', cell: (i) => <span className="break-all font-mono text-xs">{i.url}</span> },
            { key: 'e', header: 'Eventos', cell: (i) => i.events.join(', ') },
            { key: 's', header: 'Entregas', cell: (i) => <span className="text-sm">{i.lastStatus ?? 'Nenhuma ainda'}{i.pendingDeliveries ? ` · ${i.pendingDeliveries} na fila` : ''}{i.failedDeliveries ? <Tone tone="error"> · {i.failedDeliveries} falharam</Tone> : null}</span> },
            { key: 'a', header: '', cell: (i) => <Button size="sm" variant="ghost" onClick={() => run(() => api.put(`/integrations/${i.id}`, { active: !i.active }), 'Integração atualizada.', ints.reload)}>{i.active ? 'Desativar' : 'Ativar'}</Button> },
          ]} />
        </Card>
      ) : null}

      {tab === 'hora' ? (
        <Card title="Medições do relógio do servidor">
          <DataTable pageSize={10} rows={checks.data ?? []} rowKey={(c) => c.id} columns={[
            { key: 'q', header: 'Quando', cell: (c) => <span className="font-mono tabular">{dataHora(c.checkedAt, tz, true)}</span> },
            { key: 's', header: 'Servidor', cell: (c) => c.server },
            { key: 'o', header: 'Diferença', cell: (c) => (c.ok ? <span className="tabular">{c.offsetMs} ms</span> : <Tone tone="error">{c.error}</Tone>) },
          ]} />
        </Card>
      ) : null}

      <Dialog open={invite.open} title="Convidar usuário" onClose={() => setInvite({ ...invite, open: false })} footer={<Button onClick={() => run(() => api.post('/users/invite', { name: invite.name, email: invite.email, role: invite.role }), 'Convite enviado.', () => { setInvite({ open: false, name: '', email: '', role: 'employer_manager' }); users.reload(); })}>Enviar convite</Button>}>
        <div className="space-y-3">
          <Input label="Nome" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} error={fields.name} />
          <Input label="E-mail" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} error={fields.email} />
          <Select label="Papel" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
            <option value="employer_manager">{ROLE_LABEL.employer_manager}</option>
            <option value="accountant">{ROLE_LABEL.accountant}</option>
          </Select>
        </div>
      </Dialog>
      <Dialog open={hook.open} title="Novo webhook" onClose={() => setHook({ ...hook, open: false })} footer={<Button onClick={() => run(() => api.post('/integrations', { name: hook.name, kind: 'webhook', url: hook.url, secret: hook.secret, events: hook.events }), 'Webhook cadastrado.', () => { setHook({ open: false, name: '', url: '', secret: '', events: ['punch.accepted'] }); ints.reload(); })}>Salvar</Button>}>
        <div className="space-y-3">
          <Input label="Nome" value={hook.name} onChange={(e) => setHook({ ...hook, name: e.target.value })} error={fields.name} />
          <Input label="Endereço (HTTPS)" value={hook.url} onChange={(e) => setHook({ ...hook, url: e.target.value })} error={fields.url} />
          <Input label="Segredo" type="password" value={hook.secret} onChange={(e) => setHook({ ...hook, secret: e.target.value })} error={fields.secret} hint="Mínimo de 24 caracteres; guardado cifrado." />
          {(Object.keys(EVENTOS) as Array<keyof typeof EVENTOS>).map((ev) => (
            <Checkbox key={ev} label={EVENTOS[ev]} checked={hook.events.includes(ev)} onChange={(e) => setHook({ ...hook, events: e.target.checked ? [...hook.events, ev] : hook.events.filter((x) => x !== ev) })} />
          ))}
        </div>
      </Dialog>
    </div>
  );
}
