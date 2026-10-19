'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Button, cls, Input, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { MeView } from '@pontonexo/shared';

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
      const destino = voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : me.active?.role === 'employee' ? '/app' : '/painel';
      router.replace(destino);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.');
      setBusy(false);
    }
  }

  return (
    <div className={`${cls.card} p-6`}>
      <h1 className="text-xl font-bold text-marca">Entrar</h1>
      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        <Input label="E-mail" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
        <Input label="Senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11" />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button type="submit" size="lg" className="w-full" busy={busy}>
          Entrar
        </Button>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/recuperar-senha" className="font-semibold text-acao hover:underline">
          Esqueci a senha
        </Link>
        <Link href="/cadastro" className="font-semibold text-marca hover:underline">
          Cadastrar empregador
        </Link>
      </div>
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
