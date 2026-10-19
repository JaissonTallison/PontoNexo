'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Button, cls, Input, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

function Redefinir() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const convite = params.get('convite') === '1';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError('As senhas não conferem.');
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/password/reset', { token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.password ?? err.message) : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <p className="text-perigo">Link incompleto. Abra o link do e-mail novamente.</p>;
  return (
    <div className={`${cls.card} p-6`}>
      <h1 className="text-xl font-bold text-marca">{convite ? 'Definir sua senha' : 'Nova senha'}</h1>
      {done ? (
        <div className="mt-4 space-y-4">
          <p className="text-texto-2">Senha salva. Por segurança, sessões abertas em outros aparelhos foram encerradas.</p>
          <Link href="/entrar" className="inline-flex h-12 w-full items-center justify-center rounded-[8px] bg-acao font-semibold text-white">
            Entrar
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
          <Input label="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} hint="Mínimo de 10 caracteres, com letras e números." className="h-11" autoComplete="new-password" />
          <Input label="Repita a senha" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11" autoComplete="new-password" />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button type="submit" size="lg" className="w-full" busy={busy}>
            Salvar senha
          </Button>
        </form>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Redefinir />
    </Suspense>
  );
}
