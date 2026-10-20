'use client';
import { Bell, Smartphone } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { InstallGuide } from '@/components/instalar';
import { BackBar, Button, Notice } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { currentPushSubscription, disablePush, enablePush, pushSupported } from '@/lib/dispositivo';

function Section({ icon: Icon, title, text, children }: { icon: typeof Bell; title: string; text: string; children: ReactNode }) {
  return (
    <section className="rounded-[8px] bg-card p-4 shadow-card">
      <div className="mb-3 flex items-start gap-3">
        <Icon size={26} className="mt-0.5 shrink-0 text-marca" aria-hidden />
        <div>
          <h2 className="text-md font-bold text-texto">{title}</h2>
          <p className="text-sm text-texto-2">{text}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function EsteCelular() {
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<'push' | null>(null);
  useEffect(() => {
    void currentPushSubscription().then((s) => setPushOn(Boolean(s)));
  }, []);

  return (
    <div className="space-y-4">
      <BackBar title="Este celular" fallback="/app/conta" />
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <Section icon={Bell} title="Lembretes" text="Avisamos quando você esquecer de marcar a entrada ou a saída, e quando seu pedido for respondido.">
        {!pushSupported() ? (
          <p className="text-sm text-texto-3">Este navegador não recebe lembretes. No iPhone, instale o app na tela inicial primeiro (veja abaixo).</p>
        ) : pushOn ? (
          <Button variant="secondary" className="w-full" busy={busy === 'push'} onClick={async () => { setBusy('push'); await disablePush(); setPushOn(false); setBusy(null); setMsg({ tone: 'ok', text: 'Lembretes desligados neste celular.' }); }}>
            Desligar lembretes
          </Button>
        ) : (
          <Button
            className="w-full bg-marca hover:bg-marca-2"
            busy={busy === 'push'}
            onClick={async () => {
              setBusy('push');
              setMsg(null);
              try {
                const r = await enablePush();
                if (r === 'ok') { setPushOn(true); setMsg({ tone: 'ok', text: 'Lembretes ligados. Enviamos um aviso de teste.' }); }
                else if (r === 'denied') setMsg({ tone: 'error', text: 'As notificações foram bloqueadas. Libere nas configurações do celular.' });
                else setMsg({ tone: 'error', text: 'Os lembretes ainda não estão disponíveis.' });
              } catch (e) {
                setMsg({ tone: 'error', text: errorMessage(e) });
              } finally {
                setBusy(null);
              }
            }}
          >
            Ligar lembretes
          </Button>
        )}
      </Section>

      <Section icon={Smartphone} title="Instalar o app" text="Coloque o PontoNexo na tela inicial: abre mais rápido, funciona sem internet e recebe lembretes.">
        <InstallGuide />
      </Section>
    </div>
  );
}
