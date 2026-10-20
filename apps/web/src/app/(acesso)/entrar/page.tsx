'use client';
import type { MeView } from '@pontonexo/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Button, Checkbox, Input, Notice, PasswordInput } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

/** Entrar com e-mail e senha: o mesmo acesso para funcionário e empregador. */
function Entrar() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/login', { email: email.trim(), password, remember });
      const me = await api.get<MeView>('/auth/me');
      const voltar = params.get('voltar');
      router.replace(voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : me.active?.role === 'employee' ? '/app' : '/painel');
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : 'Não foi possível entrar.');
      setBusy(false);
    }
  }

  return (
    <div className="cartao-3d rounded-[8px] bg-card p-5 sm:p-8">
      <h1 className="text-xl font-bold text-marca sm:text-2xl">Entrar no PontoNexo</h1>
      <p className="mt-1 text-texto-2">Funcionário ou empregador, use o mesmo acesso.</p>

      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        <Input label="E-mail" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-md" />
        <PasswordInput label="Senha" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 text-md" />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Checkbox label="Manter conectado neste aparelho" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <Link href="/recuperar-senha" className="text-sm font-semibold text-acao hover:underline">
            Esqueci a senha
          </Link>
        </div>
        {!remember ? <p className="-mt-2 text-xs text-texto-3">Sua sessão termina ao fechar o navegador. Use em computador de outras pessoas.</p> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button type="submit" size="lg" className="w-full" busy={busy}>
          Entrar
        </Button>
      </form>

      <p className="mt-5 border-t border-borda pt-4 text-center text-sm text-texto-3">
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
