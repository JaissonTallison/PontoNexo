'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button, cls, Input, Notice } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export default function Recuperar() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ message: string }>('/auth/password/forgot', { email });
      setDone(r.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${cls.card} p-5 sm:p-6`}>
      <h1 className="text-xl font-bold text-marca">Recuperar senha</h1>
      {done ? (
        <p className="mt-4 text-texto-2">{done} O link vale por 1 hora.</p>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
          <Input label="E-mail cadastrado" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" autoComplete="email" />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button type="submit" size="lg" className="w-full" busy={busy}>
            Enviar link
          </Button>
        </form>
      )}
      <p className="mt-5 text-sm">
        <Link href="/entrar" className="font-semibold text-acao hover:underline">
          Voltar para entrar
        </Link>
      </p>
    </div>
  );
}
