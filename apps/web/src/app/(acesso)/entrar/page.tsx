'use client';
import type { MeView } from '@pontonexo/shared';
import { Fingerprint } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Notice, Segmented } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { loginWithPasskey, passkeySupported } from '@/lib/dispositivo';

function Entrar() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'celular' | 'email'>('celular');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canPasskey, setCanPasskey] = useState(false);
  useEffect(() => setCanPasskey(passkeySupported()), []);

  async function goIn() {
    const me = await api.get<MeView>('/auth/me');
    const voltar = params.get('voltar');
    const destino = voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : me.active?.role === 'employee' ? '/app' : '/painel';
    router.replace(destino);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : err instanceof Error && err.name === 'NotAllowedError' ? 'Cancelado. Tente de novo.' : 'Não foi possível entrar.');
      setBusy(false);
    }
  }

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.post('/auth/login', { email, password });
      await goIn();
    });
  };

  const submitPhone = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!codeSent) {
        const r = await api.post<{ message: string }>('/auth/phone/start', { phone });
        setCodeSent(true);
        setInfo(r.message);
        setBusy(false);
        return;
      }
      await api.post('/auth/phone/verify', { phone, code });
      await goIn();
    });
  };

  return (
    <div className="cartao-3d rounded-[8px] bg-card p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-marca">Entrar no PontoNexo</h1>
      <p className="mt-1 text-texto-2">Funcionário ou empregador, use o mesmo acesso.</p>

      {canPasskey ? (
        <>
          <Button size="lg" className="mt-5 w-full bg-marca hover:bg-marca-2" busy={busy} onClick={() => void run(async () => { await loginWithPasskey(); await goIn(); })}>
            <Fingerprint size={22} aria-hidden /> Entrar com digital ou rosto
          </Button>
          <p className="mt-1.5 text-center text-xs text-texto-3">Funciona depois de ativar em Perfil › Este celular.</p>
          <div className="my-5 flex items-center gap-3 text-sm text-texto-3" aria-hidden>
            <span className="h-px flex-1 bg-borda" />
            ou
            <span className="h-px flex-1 bg-borda" />
          </div>
        </>
      ) : null}

      <div className={`[&>div]:grid [&>div]:w-full [&>div]:grid-cols-2 ${canPasskey ? '' : 'mt-6'}`}>
        <Segmented
          label="Como entrar"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { value: 'celular', label: 'Celular' },
            { value: 'email', label: 'E-mail e senha' },
          ]}
        />
      </div>

      {mode === 'celular' ? (
        <form onSubmit={submitPhone} className="mt-4 space-y-4" noValidate>
          <Input label="Seu celular com DDD" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 98765-4321" value={phone} onChange={(e) => { setPhone(e.target.value); setCodeSent(false); }} className="h-12 text-md" />
          {codeSent ? (
            <>
              {info ? <p className="text-sm text-texto-2">{info}</p> : null}
              <Input label="Código recebido por SMS" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="h-12 text-center text-xl font-bold tracking-[0.4em]" />
            </>
          ) : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button type="submit" size="lg" className="w-full" busy={busy} disabled={codeSent ? code.length !== 6 : phone.replace(/\D/g, '').length < 10}>
            {codeSent ? 'Entrar' : 'Receber código por SMS'}
          </Button>
          {codeSent ? (
            <button type="button" className="w-full text-sm font-semibold text-acao" onClick={() => { setCodeSent(false); setCode(''); }}>
              Não recebi o código
            </button>
          ) : null}
        </form>
      ) : (
        <form onSubmit={submitEmail} className="mt-4 space-y-4" noValidate>
          <Input label="E-mail" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
          <Input label="Senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button type="submit" size="lg" className="w-full" busy={busy}>
            Entrar
          </Button>
          <Link href="/recuperar-senha" className="block text-center text-sm font-semibold text-acao hover:underline">
            Esqueci a senha
          </Link>
        </form>
      )}

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
