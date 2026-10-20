'use client';
import type { PasskeyView } from '@pontonexo/shared';
import { Bell, Fingerprint, Smartphone } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { InstallGuide } from '@/components/instalar';
import { BackBar, Button, Notice } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { dataCurta } from '@/lib/formato';
import { useResource } from '@/lib/hooks';
import { currentPushSubscription, disablePush, enablePush, passkeySupported, pushSupported, registerPasskey } from '@/lib/dispositivo';
import { useSession } from '@/components/session';

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
  const { me } = useSession();
  const passkeys = useResource<PasskeyView[]>('/auth/passkeys');
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<'push' | 'passkey' | null>(null);
  useEffect(() => {
    void currentPushSubscription().then((s) => setPushOn(Boolean(s)));
  }, []);

  const deviceName = () => {
    const ua = navigator.userAgent;
    if (/iphone/i.test(ua)) return 'iPhone';
    if (/android/i.test(ua)) return 'Celular Android';
    return 'Este aparelho';
  };

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

      <Section icon={Fingerprint} title="Entrar com digital ou rosto" text={`Entre sem digitar senha, usando a trava do celular. Sua digital ou rosto não sai do aparelho.`}>
        {passkeys.data?.length ? (
          <ul className="mb-3 divide-y divide-borda rounded-[8px] border border-borda">
            {passkeys.data.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  <span className="block font-semibold">{p.deviceLabel ?? 'Aparelho'}</span>
                  <span className="block text-xs text-texto-3">Cadastrado em {dataCurta(p.createdAt, me.timezone)}</span>
                </span>
                <button
                  type="button"
                  className="text-sm font-semibold text-perigo"
                  onClick={async () => {
                    await api.post(`/auth/passkeys/${encodeURIComponent(p.id)}/remove`);
                    passkeys.reload();
                  }}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {passkeySupported() ? (
          <Button
            className="w-full bg-marca hover:bg-marca-2"
            busy={busy === 'passkey'}
            onClick={async () => {
              setBusy('passkey');
              setMsg(null);
              try {
                await registerPasskey(deviceName());
                passkeys.reload();
                setMsg({ tone: 'ok', text: 'Pronto. Na próxima vez, toque em “Entrar com digital ou rosto”.' });
              } catch (e) {
                setMsg({ tone: 'error', text: e instanceof Error && e.name === 'NotAllowedError' ? 'Cancelado. Tente de novo quando quiser.' : errorMessage(e) });
              } finally {
                setBusy(null);
              }
            }}
          >
            {passkeys.data?.length ? 'Cadastrar outro aparelho' : 'Ativar neste celular'}
          </Button>
        ) : (
          <p className="text-sm text-texto-3">Este navegador não aceita entrar com biometria.</p>
        )}
      </Section>

      <Section icon={Smartphone} title="Instalar o app" text="Coloque o PontoNexo na tela inicial: abre mais rápido, funciona sem internet e recebe lembretes.">
        <InstallGuide />
      </Section>
    </div>
  );
}
