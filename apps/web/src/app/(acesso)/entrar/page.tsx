'use client';
import type { MeView } from '@pontonexo/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Button, Input, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

/** Entrar com e-mail e senha: o mesmo acesso para funcionário e empregador. */
function Entrar() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/login', { email, password });
      const me = await api.get<MeView>('/auth/me');
      const voltar = params.get('voltar');
      router.replace(voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : me.active?.role === 'employee' ? '/app' : '/painel');
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : 'Não foi possível entrar.');
      setBusy(false);
    }
  }

  return (
    <div className="cartao-3d rounded-[8px] bg-card p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-marca">Entrar no PontoNexo</h1>
      <p className="mt-1 text-texto-2">Funcionário ou empregador, use o mesmo acesso.</p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Input label="E-mail" type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-md" />
        <Input label="Senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 text-md" />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button type="submit" size="lg" className="w-full" busy={busy}>
          Entrar
        </Button>
        <Link href="/recuperar-senha" className="block text-center text-sm font-semibold text-acao hover:underline">
          Esqueci a senha
        </Link>
      </form>

      <p className="mt-6 border-t border-borda pt-4 text-center text-sm text-texto-3">
        É empregador?{' '}
        <Link href="/cadastro" className="font-semibold text-marca hover:underline">
          Cadastre sua residência
        </Link>
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Entrar />
    </Suspense>
  );
}
