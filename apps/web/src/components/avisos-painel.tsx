'use client';
import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { currentPushSubscription, disablePush, enablePush, pushSupported } from '@/lib/dispositivo';
import { useSession } from './session';
import { Button, Card, Notice } from './ui';

/** Avisos do empregador: notificação neste aparelho quando chega pedido de ajuste e resumo diário por e-mail. */
export function EmployerNotices() {
  const { me } = useSession();
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => {
    setSupported(pushSupported());
    void currentPushSubscription().then((s) => setOn(Boolean(s)));
  }, []);

  async function toggle() {
    setBusy(true);
    setMsg(null);
    try {
      if (on) {
        await disablePush();
        setOn(false);
        setMsg({ tone: 'ok', text: 'Avisos desligados neste aparelho.' });
      } else {
        const r = await enablePush();
        if (r === 'ok') {
          setOn(true);
          setMsg({ tone: 'ok', text: 'Avisos ligados. Enviamos uma notificação de teste.' });
        } else if (r === 'denied') setMsg({ tone: 'error', text: 'As notificações estão bloqueadas neste navegador. Libere nas configurações do site.' });
        else setMsg({ tone: 'error', text: 'Os avisos ainda não estão disponíveis neste servidor.' });
      }
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Não foi possível concluir.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Avisos">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Notificação neste aparelho</p>
            <p className="text-sm text-texto-2">Avisamos quando um funcionário pedir ajuste no ponto.</p>
          </div>
          {supported ? (
            <Button variant={on ? 'secondary' : 'primary'} busy={busy} onClick={toggle}>
              <Bell size={18} aria-hidden /> {on ? 'Desligar avisos' : 'Ligar avisos'}
            </Button>
          ) : (
            <p className="text-sm text-texto-3">Este navegador não recebe notificações.</p>
          )}
        </div>
        <div className="border-t border-borda pt-4">
          <p className="font-semibold">Resumo diário por e-mail</p>
          <p className="text-sm text-texto-2">
            Quando houver algo pendente, enviamos às 8h um resumo para {me.user.email}: pedidos de ajuste, ocorrências, quem ainda não chegou e mês sem fechamento.
          </p>
        </div>
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      </div>
    </Card>
  );
}
