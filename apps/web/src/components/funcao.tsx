'use client';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { Button, Input, Select } from './ui';

const NOVA = '__nova__';

/**
 * Função do funcionário. A conta já vem com as funções mais comuns; a última opção da lista
 * cadastra outra ali mesmo, sem sair do formulário.
 */
export function JobRoleSelect({ value, onChange, error, canCreate = true }: { value: string; onChange: (id: string) => void; error?: string; canCreate?: boolean }) {
  const roles = useResource<Array<{ id: string; name: string }>>('/job-roles');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ id: string }>('/job-roles', { name: name.trim(), description: null });
      roles.reload();
      onChange(r.id);
      setCreating(false);
      setName('');
    } catch (e) {
      setErr(e instanceof ApiError ? (e.fields.name ?? e.message) : 'Não foi possível cadastrar.');
    } finally {
      setBusy(false);
    }
  }

  if (creating) {
    return (
      <div>
        <Input label="Nome da nova função" autoFocus placeholder="Ex.: Passadeira" value={name} onChange={(e) => setName(e.target.value)} error={err ?? undefined} onKeyDown={(e) => e.key === 'Enter' && name.trim() && void add()} />
        <div className="mt-2 flex gap-2">
          <Button size="sm" busy={busy} disabled={!name.trim()} onClick={add}>
            <Check size={18} aria-hidden /> Adicionar
          </Button>
          <Button size="sm" variant="secondary" onClick={() => { setCreating(false); setErr(null); }}>
            <X size={18} aria-hidden /> Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Select
      label="Função"
      value={value}
      error={error}
      onChange={(e) => (e.target.value === NOVA ? setCreating(true) : onChange(e.target.value))}
    >
      <option value="">Sem função definida</option>
      {(roles.data ?? []).map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
      {canCreate ? <option value={NOVA}>+ Cadastrar outra função…</option> : null}
    </Select>
  );
}
