'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Checkbox, Input, Notice, PageHeader, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useResource } from '@/lib/hooks';

export default function NovoFuncionario() {
  const router = useRouter();
  const roles = useResource<Array<{ id: string; name: string }>>('/job-roles');
  const [f, setF] = useState({ fullName: '', cpf: '', email: '', phone: '', jobRoleId: '', createAccess: true });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setFields({});
    setError(null);
    try {
      const r = await api.post<{ id: string }>('/employees', { ...f, email: f.email || null, phone: f.phone || null, jobRoleId: f.jobRoleId || null, createAccess: f.createAccess && Boolean(f.email) });
      router.replace(`/painel/funcionarios/${r.id}?novo=1`);
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        setError(e.message);
      }
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[720px]">
      <PageHeader title="Novo funcionário" />
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input label="Nome completo" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} error={fields.fullName} />
          </div>
          <Input label="CPF" inputMode="numeric" value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} error={fields.cpf} hint="Usado no comprovante de marcação." />
          <Select label="Função" value={f.jobRoleId} onChange={(e) => setF({ ...f, jobRoleId: e.target.value })} error={fields.jobRoleId}>
            <option value="">Sem função definida</option>
            {(roles.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <Input label="E-mail" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={fields.email} hint="Necessário para o acesso ao app." />
          <Input label="Telefone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} error={fields.phone} />
          <div className="sm:col-span-2">
            <Checkbox label="Enviar acesso ao app por e-mail" hint="O funcionário define a própria senha pelo link." checked={f.createAccess} onChange={(e) => setF({ ...f, createAccess: e.target.checked })} />
          </div>
        </div>
        <p className="mt-4 text-sm text-texto-3">Só os dados necessários ao registro de jornada. Sem salário, documentos ou fotos.</p>
        {error && !Object.keys(fields).length ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
        <div className="mt-4 flex gap-2">
          <Button onClick={save} busy={busy}>
            Salvar e continuar
          </Button>
          <Button variant="secondary" onClick={() => router.back()}>
            Cancelar
          </Button>
        </div>
      </Card>
    </div>
  );
}
