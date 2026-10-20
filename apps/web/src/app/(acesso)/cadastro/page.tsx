'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Checkbox, cls, Input, Notice, PasswordInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export default function Cadastro() {
  const router = useRouter();
  const [f, setF] = useState({ name: '', email: '', password: '', displayName: '', legalName: '', cpf: '', accept: false });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string; checked?: boolean; type?: string } }) => setF({ ...f, [k]: e.target.type === 'checkbox' ? Boolean(e.target.checked) : e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api.post('/auth/signup', {
        name: f.name,
        email: f.email,
        password: f.password,
        employer: { displayName: f.displayName, legalName: f.legalName || f.name, cpf: f.cpf },
        acceptTerms: f.accept,
      });
      router.replace('/painel');
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        setError(err.message);
      } else setError('Não foi possível cadastrar.');
      setBusy(false);
    }
  }

  return (
    <div className={`${cls.card} p-5 sm:p-6`}>
      <h1 className="text-xl font-bold text-marca">Cadastrar empregador</h1>
      <p className="mt-1 text-texto-2">Para quem contrata trabalho doméstico. Funcionários recebem o acesso por e-mail.</p>
      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        <Input label="Seu nome completo" value={f.name} onChange={set('name')} error={fields.name} autoComplete="name" />
        <Input label="E-mail" type="email" value={f.email} onChange={set('email')} error={fields.email} autoComplete="email" />
        <PasswordInput label="Senha" value={f.password} onChange={set('password')} error={fields.password} hint="Mínimo de 10 caracteres, com letras e números." autoComplete="new-password" />
        <Input label="Como identificar a residência" value={f.displayName} onChange={set('displayName')} error={fields['employer.displayName']} hint="Aparece para os funcionários. Ex.: Residência Silva" />
        <Input label="Nome do empregador (como no eSocial)" value={f.legalName} onChange={set('legalName')} error={fields['employer.legalName']} hint="Se for você, pode deixar em branco." />
        <Input label="CPF do empregador" inputMode="numeric" value={f.cpf} onChange={set('cpf')} error={fields['employer.cpf']} />
        <Checkbox
          label="Li e concordo com os termos de uso e o aviso de privacidade"
          hint="O sistema não substitui a orientação de contador ou advogado sobre obrigações trabalhistas."
          checked={f.accept}
          onChange={(e) => setF({ ...f, accept: e.target.checked })}
        />
        {fields.acceptTerms ? <Notice tone="error">{fields.acceptTerms}</Notice> : null}
        {error && !Object.keys(fields).length ? <Notice tone="error">{error}</Notice> : null}
        <Button type="submit" size="lg" className="w-full" busy={busy}>
          Criar conta
        </Button>
      </form>
      <p className="mt-5 text-sm">
        Já tem conta?{' '}
        <Link href="/entrar" className="font-semibold text-acao hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
