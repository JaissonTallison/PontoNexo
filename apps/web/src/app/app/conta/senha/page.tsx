'use client';
import { useState } from 'react';
import { BackBar, Button, Input, Notice, PasswordInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function TrocarSenha() {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setFields({});
    setMsg(null);
    if (f.newPassword !== f.confirm) return setFields({ confirm: 'As duas senhas novas não são iguais.' });
    setBusy(true);
    try {
      await api.post('/auth/password/change', { currentPassword: f.currentPassword, newPassword: f.newPassword });
      setF({ currentPassword: '', newPassword: '', confirm: '' });
      setMsg({ tone: 'ok', text: 'Senha trocada. Use a nova senha da próxima vez que entrar.' });
    } catch (e) {
      if (e instanceof ApiError) setFields(e.fields);
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Não foi possível trocar a senha.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <BackBar title="Trocar senha" fallback="/app/conta" />
      <div className="space-y-4 rounded-[8px] bg-card p-4 shadow-card">
        <PasswordInput label="Senha atual" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} error={fields.currentPassword} className="h-12" />
        <PasswordInput label="Senha nova" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} error={fields.newPassword} hint="Pelo menos 10 caracteres, com letras e números." className="h-12" />
        <PasswordInput label="Repita a senha nova" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} error={fields.confirm} className="h-12" />
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <Button size="lg" className="w-full bg-marca hover:bg-marca-2" busy={busy} onClick={save} disabled={!f.currentPassword || !f.newPassword}>
          Salvar senha nova
        </Button>
      </div>
    </div>
  );
}
