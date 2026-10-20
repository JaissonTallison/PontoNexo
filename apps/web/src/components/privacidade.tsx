'use client';
import { Check } from 'lucide-react';
import { PRIVACY_NOTICE, PRIVACY_NOTICE_VERSION } from '@pontonexo/shared';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { Button, Notice } from './ui';

export function PrivacyNoticeText() {
  return (
    <div className="space-y-4">
      {PRIVACY_NOTICE.map((s) => (
        <section key={s.title}>
          <h3 className="text-md font-bold text-marca">{s.title}</h3>
          <p className="mt-1 text-texto-2">{s.body}</p>
        </section>
      ))}
      <p className="text-xs text-texto-3">Versão {PRIVACY_NOTICE_VERSION}</p>
    </div>
  );
}

export function PrivacyGate({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="mx-auto max-w-[640px] px-4 py-6">
      <h1 className="text-xl font-bold text-marca">Como seus dados são usados</h1>
      <p className="mt-1 text-texto-2">Leia antes de usar o registro de ponto. Isto é um aviso, não um pedido de consentimento: o registro de jornada é obrigação legal do empregador.</p>
      <div className="mt-5 rounded-[8px] border border-borda bg-card p-4">
        <PrivacyNoticeText />
      </div>
      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
      <Button
        size="lg"
        className="mt-5 w-full"
        busy={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.post('/me/privacy/acknowledge');
            onDone();
          } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
          }
        }}
      >
        <Check size={18} aria-hidden /> Li e estou ciente
      </Button>
    </main>
  );
}
