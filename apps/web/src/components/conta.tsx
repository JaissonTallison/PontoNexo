'use client';
import { Check, LogOut } from 'lucide-react';
import { ROLE_LABEL, type SessionView } from '@pontonexo/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { dataHora } from '@/lib/formato';
import { useResource } from '@/lib/hooks';
import { useSession } from './session';
import { Button, Card, Input, Notice, PasswordInput } from './ui';

/** Conta: troca de senha, sessões abertas, troca de empregador e saída. Usado no app e no painel. */
export function AccountPanel({ simple = false }: { simple?: boolean }) {
  const { me } = useSession();
  const router = useRouter();
  const sessions = useResource<SessionView[]>(simple ? null : '/auth/sessions');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function changePassword() {
    setFields({});
    setMsg(null);
    try {
      await api.post('/auth/password/change', pw);
      setPw({ currentPassword: '', newPassword: '' });
      setMsg({ tone: 'ok', text: 'Senha alterada. As outras sessões foram encerradas.' });
      sessions.reload();
    } catch (e) {
      if (e instanceof ApiError) setFields(e.fields);
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Não foi possível alterar.' });
    }
  }

  async function logout() {
    await api.post('/auth/logout').catch(() => undefined);
    router.replace('/entrar');
  }

  return (
    <div className="space-y-4">
      <Card title="Dados de acesso">
        <p className="font-semibold">{me.user.name}</p>
        <p className="text-texto-2">{me.user.email}</p>
        {me.memberships.length > 1 ? (
          <div className="mt-3">
            <p className="mb-1 text-sm font-semibold text-texto-2">Trocar de vínculo</p>
            <ul className="space-y-1">
              {me.memberships.map((m) => (
                <li key={m.id}>
                  <button
                    className={`w-full rounded-[8px] border px-3 py-2 text-left ${m.employerId === me.active?.employerId ? 'border-acao bg-acao-suave' : 'border-borda hover:bg-realce'}`}
                    onClick={async () => {
                      await api.post('/auth/switch-employer', { employerId: m.employerId });
                      window.location.href = m.role === 'employee' ? '/app' : '/painel';
                    }}
                  >
                    <span className="font-semibold">{m.employerName}</span> <span className="text-sm text-texto-3">· {ROLE_LABEL[m.role]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Button variant="secondary" className="mt-4" onClick={logout}>
          <LogOut size={18} aria-hidden /> Sair
        </Button>
      </Card>
      <Card title="Alterar senha">
        <div className="space-y-3">
          <PasswordInput label="Senha atual" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} error={fields.currentPassword} />
          <PasswordInput label="Nova senha" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} error={fields.newPassword} hint="Mínimo de 10 caracteres, com letras e números." />
          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          <Button onClick={changePassword}><Check size={18} aria-hidden /> Salvar nova senha</Button>
        </div>
      </Card>
      {simple ? null : (
      <Card title="Sessões abertas">
        <ul className="divide-y divide-borda">
          {(sessions.data ?? []).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm">{s.userAgent ?? 'Navegador desconhecido'}</p>
                <p className="text-xs text-texto-3">
                  Último uso {dataHora(s.lastSeenAt, me.timezone)}
                  {s.current ? ' · esta sessão' : ''}
                </p>
              </div>
              {!s.current ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await api.post(`/auth/sessions/${s.id}/revoke`);
                    sessions.reload();
                  }}
                >
                  <LogOut size={18} aria-hidden /> Encerrar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      )}
    </div>
  );
}
