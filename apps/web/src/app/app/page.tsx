'use client';
import {
  evaluateGeofence,
  PUNCH_TYPE_LABEL,
  type AlertCode,
  type AuthorizedLocationView,
  type DevicePosition,
  type GeofenceEvaluation,
  type PositionOutcome,
  type PunchContextView,
  type PunchCreateInput,
  type PunchResultView,
  type PunchType,
  type PunchView,
} from '@pontonexo/shared';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DayTimeline, PunchGrid } from '@/components/grade-ponto';
import { Tip } from '@/components/guia';
import { InstallCard } from '@/components/instalar';
import { QuickReasons } from '@/components/motivos';
import { Button, Dialog, ErrorState, Loading, Notice, Select } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { hora } from '@/lib/formato';
import { usePunchContext } from '@/components/ponto-context';
import { useOnline, useServerClock } from '@/lib/hooks';
import { offlineQueue, type PendingAttempt } from '@/lib/offline';

const CTX_KEY = 'pn_ctx';

interface Capture {
  outcome: PositionOutcome;
  position: DevicePosition | null;
}

function capturePosition(): Promise<Capture> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve({ outcome: 'unavailable', position: null });
    // posição pedida só agora, no toque; nada é coletado em segundo plano
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ outcome: 'ok', position: { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy } }),
      (err) => resolve({ outcome: err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable', position: null }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

const NEEDS_JUSTIFICATION: GeofenceEvaluation['status'][] = ['outside', 'low_accuracy', 'unavailable', 'denied'];

/** Frases simples, sem termos técnicos. */
const PLACE_TEXT: Record<GeofenceEvaluation['status'], string> = {
  inside: 'Você está no local de trabalho.',
  outside: 'Parece que você está fora do local de trabalho.',
  low_accuracy: 'O sinal do GPS está fraco agora.',
  unavailable: 'Não conseguimos ver sua localização.',
  denied: 'A localização está bloqueada no celular.',
  no_geofence: 'Este local não usa verificação de localização.',
};

/** Respostas prontas conforme o que aconteceu com a localização. */
const REASONS_OUTSIDE = [
  'Fui fazer compras para a casa',
  'Levei ou busquei alguém da família',
  'Estou trabalhando em outro endereço da família',
  'Saí para resolver algo pedido pelo empregador',
];
const REASONS_GPS = [
  'Estou no trabalho, mas o GPS não funcionou',
  'O sinal do celular está fraco aqui',
  'Não consegui ligar a localização do celular',
];

function reasonOptions(status: GeofenceEvaluation['status'] | null, noLocation: boolean): { title: string; options: string[] } {
  if (status === 'outside' || noLocation) return { title: 'Por que você está fora do local?', options: REASONS_OUTSIDE };
  return { title: 'O que aconteceu?', options: REASONS_GPS };
}

const QUESTION: Record<PunchType, string> = {
  clock_in: 'Registrar sua ENTRADA agora?',
  break_start: 'Começar a PAUSA agora?',
  break_end: 'Voltar da pausa agora?',
  clock_out: 'Registrar sua SAÍDA agora?',
};

const DONE: Record<PunchType, string> = {
  clock_in: 'Entrada registrada',
  break_start: 'Pausa registrada',
  break_end: 'Retorno registrado',
  clock_out: 'Saída registrada',
};

function saveSnapshot(ctx: PunchContextView) {
  try {
    localStorage.setItem(CTX_KEY, JSON.stringify({ state: ctx.state, allowedNext: ctx.allowedNext, locations: ctx.locations, timezone: ctx.timezone }));
  } catch {
    // sem armazenamento local: segue sem cópia offline
  }
}

function loadSnapshot(): Pick<PunchContextView, 'state' | 'allowedNext' | 'locations' | 'timezone'> | null {
  try {
    const raw = localStorage.getItem(CTX_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Situação do dia em duas partes curtas (rótulo + detalhe) e a cor do rótulo. */
function statusParts(ctx: PunchContextView | null, state: PunchContextView['state'], tz: string): { label: string; detail: string; tone: string } {
  const valid = (ctx?.today ?? []).filter((p) => !p.disregarded);
  const last: PunchView | undefined = valid.at(-1);
  if (state === 'working') return { label: 'Trabalhando', detail: `desde ${hora(valid.find((p) => p.type === 'clock_in')?.serverTime ?? last?.serverTime, tz)}`, tone: 'text-acao' };
  if (state === 'on_break') return { label: 'Em pausa', detail: `desde ${hora(last?.serverTime, tz)}`, tone: 'text-atencao' };
  if (last?.type === 'clock_out') return { label: 'Dia encerrado', detail: `às ${hora(last.serverTime, tz)}`, tone: 'text-marca' };
  return { label: 'Sem entrada', detail: 'ainda hoje', tone: 'text-texto-2' };
}

export default function Ponto() {
  const { data: ctx, error, loading, reload } = usePunchContext();
  const online = useOnline();
  const { now } = useServerClock(ctx?.serverTime ?? null);
  const snapshot = useMemo(() => (ctx ? null : loadSnapshot()), [ctx]);
  const view = ctx ?? (snapshot ? { ...snapshot, today: [] as PunchView[] } : null);
  const tz = view?.timezone ?? 'America/Sao_Paulo';

  const [locationId, setLocationId] = useState('');
  const [step, setStep] = useState<'idle' | 'locating' | 'confirm' | 'sending'>('idle');
  const [type, setType] = useState<PunchType | null>(null);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [justification, setJustification] = useState('');
  const [serverAlerts, setServerAlerts] = useState<Array<{ code: AlertCode; detail: string | null }>>([]);
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [result, setResult] = useState<PunchResultView | null>(null);
  const [pending, setPending] = useState<PendingAttempt[]>([]);

  useEffect(() => {
    if (ctx) saveSnapshot(ctx);
    if (ctx && !locationId && ctx.locations[0]) setLocationId(ctx.locations[0].id);
  }, [ctx, locationId]);

  const refreshPending = useCallback(async () => {
    setPending(await offlineQueue.list().catch(() => [] as PendingAttempt[]));
  }, []);

  /** Envia o que ficou guardado sem internet; cada item só sai da fila quando o servidor confirma. */
  const syncPending = useCallback(async () => {
    const list = await offlineQueue.list().catch(() => [] as PendingAttempt[]);
    for (const a of list) {
      try {
        await api.post<PunchResultView>('/me/punches', a.input);
        await offlineQueue.remove(a.input.clientRequestId);
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) break;
        await offlineQueue.add({ ...a, lastError: errorMessage(e) });
      }
    }
    await refreshPending();
    reload();
  }, [refreshPending, reload]);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);
  useEffect(() => {
    if (online) void syncPending();
  }, [online, syncPending]);

  const location: AuthorizedLocationView | null = view?.locations.find((l) => l.id === locationId) ?? null;
  const evaluation = useMemo(() => (capture ? evaluateGeofence(capture.outcome, capture.position, location?.geofence ?? null) : null), [capture, location]);
  const needsJustification = Boolean((evaluation && NEEDS_JUSTIFICATION.includes(evaluation.status)) || !locationId || serverAlerts.length);

  async function start(t: PunchType) {
    setType(t);
    setMessage(null);
    setResult(null);
    setServerAlerts([]);
    setJustification('');
    setStep('locating');
    setCapture(await capturePosition());
    setStep('confirm');
  }

  async function confirm() {
    if (!type || !capture) return;
    const input: PunchCreateInput = {
      clientRequestId: crypto.randomUUID(),
      type,
      locationId: locationId || null,
      positionOutcome: capture.outcome,
      position: capture.position,
      deviceTime: new Date().toISOString(),
      deviceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
      offline: false,
      networkType: (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType ?? null,
      justification: justification.trim() || null,
    };
    setStep('sending');
    try {
      const r = await api.post<PunchResultView>('/me/punches', input);
      setResult(r);
      setStep('idle');
      reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) {
        await offlineQueue.add({ input: { ...input, offline: true }, createdAt: input.deviceTime, lastError: null });
        await refreshPending();
        setStep('idle');
        setMessage({ tone: 'warn', text: 'Sem internet agora. Guardamos no celular e enviamos sozinho quando a internet voltar. Ainda NÃO está registrado.' });
        return;
      }
      if (e instanceof ApiError && e.code === 'JUSTIFICATION_REQUIRED') {
        setServerAlerts((e.body.alerts as Array<{ code: AlertCode; detail: string | null }>) ?? []);
        setStep('confirm');
        return;
      }
      setStep('idle');
      setMessage({ tone: 'error', text: errorMessage(e) });
      reload();
    }
  }

  if (loading && !view) return <Loading />;
  if (!view) return <ErrorState message={error?.message ?? 'Não foi possível carregar.'} onRetry={reload} />;

  const avisos = ctx?.pendingAcknowledgements ?? 0;

  return (
    <div className="space-y-4">
      {!online ? <Notice tone="warn">Sem internet. Você pode marcar: guardamos no celular e enviamos quando a internet voltar.</Notice> : null}
      {ctx && !ctx.hasActiveContract ? <Notice tone="error">Seu cadastro ainda não está completo. Fale com seu empregador.</Notice> : null}

      {(() => {
        const st = statusParts(ctx, view.state, tz);
        const hhmmss = hora(now.toISOString(), tz, true);
        return (
          <Tip id="app.relogio" order={1} title="Hora certa" text="Esta é a hora oficial, a mesma que vai no seu registro. Ao lado aparece o que você está fazendo agora: trabalhando, em pausa ou fora do horário.">
          <section className="cartao-3d rounded-[8px] bg-card px-4 py-3" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="leading-none text-marca tabular" aria-label={`Hora certa ${hhmmss.slice(0, 5)}`}>
                  <span className="text-[34px] font-bold tracking-tight">{hhmmss.slice(0, 5)}</span>
                  <span className="ml-1 text-md font-medium text-texto-3">{hhmmss.slice(5)}</span>
                </p>
                <p className="mt-1 truncate text-xs text-texto-3 first-letter:uppercase">
                  {new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(now)}
                </p>
              </div>
              <div className="shrink-0 border-l border-borda pl-3 text-right">
                <p className={`text-md font-bold ${st.tone}`}>{st.label}</p>
                <p className="text-sm text-texto-2 tabular">{st.detail}</p>
              </div>
            </div>
            {ctx?.staleSession ? <p className="mt-2 border-t border-borda pt-2 text-sm text-atencao">A última jornada ficou sem saída. Registre a entrada e depois toque em “Esqueci de marcar”.</p> : null}
          </section>
          </Tip>
        );
      })()}

      {result ? (
        <section className="rounded-[8px] bg-acao p-5 text-white" role="status">
          <p className="text-xl font-bold">
            {DONE[result.punch.type]} às {hora(result.punch.serverTime, tz)}
          </p>
          <p className="mt-1 text-white/90">{result.punch.alerts.length ? 'Seu empregador vai ver a sua explicação.' : 'Tudo certo.'}</p>
          <Link href={`/app/comprovante/${result.punch.id}`} className="mt-3 inline-block font-semibold text-white underline">
            Ver comprovante
          </Link>
        </section>
      ) : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {avisos ? (
        <Link href="/app/correcoes" className="block rounded-[8px] border border-marcador bg-atencao-suave p-4 font-semibold text-atencao">
          Você tem {avisos === 1 ? '1 item' : `${avisos} itens`} para confirmar. Toque aqui.
        </Link>
      ) : null}

      {view.locations.length > 1 ? (
        <Select label="Onde você está trabalhando hoje?" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          {view.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
          <option value="">Outro lugar</option>
        </Select>
      ) : null}

      <Tip id="app.grade" order={2} title="Marcar o ponto" text="Os quatro blocos são: 1 Entrada, 2 Pausa, 3 Retorno da pausa e 4 Saída. Toque no bloco que está aceso, confira a hora e toque em Sim, registrar. Pronto.">
      <PunchGrid
        allowed={view.allowedNext}
        today={ctx?.today ?? []}
        tz={tz}
        busyType={step === 'locating' ? type : null}
        disabled={step !== 'idle' || (ctx ? !ctx.hasActiveContract : false)}
        onPick={start}
      />
      </Tip>

      {(() => {
        const waiting = pending.filter((a) => !a.lastError);
        const refused = pending.filter((a) => a.lastError);
        return (
          <>
            {waiting.length ? (
              <section className="rounded-[8px] border border-marcador bg-atencao-suave p-4">
                <p className="font-bold text-atencao">{waiting.length === 1 ? '1 marcação esperando internet' : `${waiting.length} marcações esperando internet`}</p>
                <ul className="mt-2 space-y-1">
                  {waiting.map((a) => (
                    <li key={a.input.clientRequestId}>
                      {PUNCH_TYPE_LABEL[a.input.type]} tocada às {hora(a.createdAt, tz)}
                    </li>
                  ))}
                </ul>
                {online ? (
                  <Button variant="secondary" size="sm" className="mt-2" onClick={() => void syncPending()}>
                    Enviar agora
                  </Button>
                ) : null}
              </section>
            ) : null}
            {refused.length ? (
              <section className="rounded-[8px] border border-perigo bg-perigo-suave p-4">
                <p className="font-bold text-perigo">{refused.length === 1 ? '1 marcação não foi aceita' : `${refused.length} marcações não foram aceitas`}</p>
                <ul className="mt-2 space-y-3">
                  {refused.map((a) => (
                    <li key={a.input.clientRequestId}>
                      <p>
                        {PUNCH_TYPE_LABEL[a.input.type]} tocada às {hora(a.createdAt, tz)}
                      </p>
                      <p className="text-sm text-texto-2">{a.lastError}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Link href="/app/corrigir" className="inline-flex h-9 items-center rounded-[8px] bg-marca px-3 text-sm font-semibold text-white">
                          Pedir ajuste
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await offlineQueue.remove(a.input.clientRequestId);
                            await refreshPending();
                          }}
                        >
                          Apagar do celular
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        );
      })()}

      <InstallCard />

      <Tip id="app.hoje" order={3} title="Seu dia" text="Aqui ficam as marcações de hoje, na ordem. Cada uma tem um comprovante: toque nela para ver.">
      <section aria-label="Hoje">
        <h2 className="mb-2 text-md font-bold text-marca">Hoje</h2>
        <DayTimeline today={ctx?.today ?? []} tz={tz} />
      </section>
      </Tip>

      <Dialog
        open={step === 'confirm' || step === 'sending'}
        title={type ? QUESTION[type] : 'Confirmar'}
        onClose={() => setStep('idle')}
        footer={
          <div className="grid w-full grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={() => setStep('idle')} disabled={step === 'sending'}>
              Cancelar
            </Button>
            <Button size="lg" onClick={confirm} busy={step === 'sending'} disabled={needsJustification && justification.trim().length < 5}>
              Sim, registrar
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-center text-[44px] leading-none font-bold tracking-tight text-marca tabular">{hora(now.toISOString(), tz)}</p>
          {evaluation ? (
            <p className={`text-center font-semibold ${evaluation.status === 'inside' || evaluation.status === 'no_geofence' ? 'text-acao' : 'text-atencao'}`}>{PLACE_TEXT[evaluation.status]}</p>
          ) : null}
          {needsJustification ? (
            <QuickReasons {...reasonOptions(evaluation?.status ?? null, !locationId)} value={justification} onChange={setJustification} />
          ) : null}
          {needsJustification ? <p className="text-sm text-texto-3">Isso não é punição. Seu empregador só fica sabendo o motivo.</p> : null}
        </div>
      </Dialog>
    </div>
  );
}
