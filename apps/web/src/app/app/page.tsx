'use client';
import {
  ALERT_LABEL,
  evaluateGeofence,
  GEO_STATUS_LABEL,
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
import { Button, Card, Dialog, Empty, ErrorState, Loading, Notice, Select, Textarea, Tone } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { hora } from '@/lib/formato';
import { useOnline, useResource, useServerClock } from '@/lib/hooks';
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

function punchStatus(p: PunchView): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  if (p.disregarded) return { text: 'Desconsiderada por correção', tone: 'muted' };
  if (p.alerts.length) return { text: `Registrada com ocorrência: ${ALERT_LABEL[p.alerts[0]!.code]}`, tone: 'warn' };
  return { text: 'Registrada', tone: 'ok' };
}

const ACTION_LABEL: Record<PunchType, string> = {
  clock_in: 'Registrar entrada',
  break_start: 'Iniciar intervalo',
  break_end: 'Encerrar intervalo',
  clock_out: 'Registrar saída',
};

function saveSnapshot(ctx: PunchContextView) {
  try {
    localStorage.setItem(CTX_KEY, JSON.stringify({ state: ctx.state, allowedNext: ctx.allowedNext, locations: ctx.locations, timezone: ctx.timezone, savedAt: new Date().toISOString() }));
  } catch {
    // armazenamento indisponível: segue sem cópia offline
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

export default function Ponto() {
  const { data: ctx, error, loading, reload } = useResource<PunchContextView>('/me/punch-context');
  const online = useOnline();
  const { now } = useServerClock(ctx?.serverTime ?? null);
  const snapshot = useMemo(() => (ctx ? null : loadSnapshot()), [ctx]);
  const view = ctx ?? (snapshot ? { ...snapshot, today: [] as PunchView[] } : null);
  const tz = view?.timezone ?? 'America/Sao_Paulo';

  const [locationId, setLocationId] = useState<string>('');
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
    try {
      setPending(await offlineQueue.list());
    } catch {
      setPending([]);
    }
  }, []);

  /** Envia as tentativas guardadas; cada uma só sai da fila quando o servidor confirma. */
  const syncPending = useCallback(async () => {
    const list = await offlineQueue.list().catch(() => [] as PendingAttempt[]);
    for (const a of list) {
      try {
        await api.post<PunchResultView>('/me/punches', a.input);
        await offlineQueue.remove(a.input.clientRequestId);
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) break; // ainda sem conexão
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
  const needsJustification = Boolean(
    (evaluation && NEEDS_JUSTIFICATION.includes(evaluation.status)) || !locationId || serverAlerts.length || (location === null && view?.locations.length === 0),
  );

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
        setMessage({ tone: 'warn', text: 'Sem conexão. A tentativa foi guardada neste aparelho e ainda NÃO está registrada. Ela será enviada assim que houver internet.' });
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

  const since = ctx?.today.filter((p) => !p.disregarded).at(-1);
  const stateText =
    view.state === 'working' ? `Em jornada${since ? ` desde ${hora(since.serverTime, tz)}` : ''}` : view.state === 'on_break' ? `Em intervalo${since ? ` desde ${hora(since.serverTime, tz)}` : ''}` : 'Fora de jornada';

  return (
    <div className="space-y-4">
      {!online ? (
        <Notice tone="warn">Sem conexão. Marcações feitas agora ficam pendentes no aparelho e só valem quando o servidor confirmar.</Notice>
      ) : null}
      {ctx && !ctx.hasActiveContract ? <Notice tone="error">Não há contrato vigente. Fale com o empregador antes de marcar.</Notice> : null}

      <section className="rounded-[8px] border border-borda bg-card p-5 shadow-card" aria-live="polite">
        <p className="font-mono text-[44px] leading-none font-medium text-marca tabular" aria-label="Hora do servidor">
          {hora(now.toISOString(), tz, true)}
        </p>
        <p className="mt-2 text-sm text-texto-3">
          {new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(now)} · hora oficial do servidor
          {ctx?.clockStatus === 'drift' ? <Tone tone="warn"> · relógio do servidor em verificação</Tone> : null}
        </p>
        <p className="mt-3 text-md font-semibold text-texto">{stateText}</p>
        {ctx?.staleSession ? <p className="mt-1 text-sm text-atencao">A jornada anterior ficou sem saída. Registre a entrada de hoje e peça a correção da saída.</p> : null}
      </section>

      {view.locations.length > 1 ? (
        <Select label="Local de trabalho" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          {view.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
          <option value="">Outro local (justificar)</option>
        </Select>
      ) : view.locations.length === 0 ? (
        <Notice tone="warn">Nenhum local autorizado. A marcação será registrada como "outro local" e exige justificativa.</Notice>
      ) : (
        <p className="text-sm text-texto-2">
          Local: <span className="font-semibold text-texto">{view.locations[0]!.name}</span>
        </p>
      )}

      <div className="grid gap-3">
        {view.allowedNext.map((t, i) => (
          <Button key={t} size="xl" variant={i === 0 ? 'primary' : 'secondary'} className="w-full" busy={step === 'locating' && type === t} disabled={step !== 'idle' || (ctx ? !ctx.hasActiveContract : false)} onClick={() => start(t)}>
            {ACTION_LABEL[t]}
          </Button>
        ))}
      </div>
      {step === 'locating' ? <p className="text-center text-sm text-texto-3">Obtendo localização…</p> : null}

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {result ? (
        <Card>
          <p className="text-md font-bold text-acao">
            {PUNCH_TYPE_LABEL[result.punch.type]} registrada às {hora(result.punch.serverTime, tz, true)}
          </p>
          <p className="mt-1 text-sm text-texto-2 tabular">
            NSR {result.punch.nsr} · comprovante <span className="font-mono">{result.receipt.code}</span>
          </p>
          {result.punch.alerts.length ? (
            <p className="mt-2 text-sm text-atencao">
              Registrada com ocorrência: {result.punch.alerts.map((a) => ALERT_LABEL[a.code]).join('; ')}. Isso não é penalidade: o empregador vai analisar com a sua justificativa.
            </p>
          ) : null}
          <Link href={`/app/comprovante/${result.punch.id}`} className="mt-3 inline-block font-semibold text-acao underline">
            Ver comprovante
          </Link>
        </Card>
      ) : null}

      {pending.length ? (
        <Card title={pending.length === 1 ? '1 tentativa pendente de envio' : `${pending.length} tentativas pendentes de envio`}>
          <p className="mb-3 text-sm text-atencao">Ainda NÃO registradas. Serão enviadas automaticamente quando houver conexão.</p>
          <ul className="divide-y divide-borda">
            {pending.map((a) => (
              <li key={a.input.clientRequestId} className="py-2">
                <p className="font-semibold">
                  {PUNCH_TYPE_LABEL[a.input.type]} · tocado às {hora(a.createdAt, tz)} (relógio do aparelho)
                </p>
                {a.lastError ? <p className="text-sm text-perigo">Não aceita: {a.lastError}</p> : null}
                {a.lastError ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1"
                    onClick={async () => {
                      if (!window.confirm('Descartar esta tentativa do aparelho? Ela nunca foi registrada. Se a marcação era necessária, peça a correção.')) return;
                      await offlineQueue.remove(a.input.clientRequestId);
                      await refreshPending();
                    }}
                  >
                    Descartar do aparelho
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {online ? (
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => void syncPending()}>
              Enviar agora
            </Button>
          ) : null}
        </Card>
      ) : null}

      <Card title="Hoje">
        {ctx && ctx.today.length ? (
          <ul className="divide-y divide-borda">
            {ctx.today.map((p) => {
              const st = punchStatus(p);
              return (
                <li key={p.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <p className="font-semibold">
                      <span className="font-mono tabular">{hora(p.serverTime, tz)}</span> · {PUNCH_TYPE_LABEL[p.type]}
                    </p>
                    <p className="text-sm">
                      <Tone tone={st.tone}>{st.text}</Tone>
                    </p>
                  </div>
                  <Link href={`/app/comprovante/${p.id}`} className="shrink-0 text-sm font-semibold text-acao underline">
                    Comprovante
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty title="Nenhuma marcação hoje" />
        )}
      </Card>

      <Dialog
        open={step === 'confirm' || step === 'sending'}
        title={type ? `Confirmar: ${PUNCH_TYPE_LABEL[type].toLowerCase()}` : 'Confirmar'}
        onClose={() => setStep('idle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStep('idle')} disabled={step === 'sending'}>
              Cancelar
            </Button>
            <Button onClick={confirm} busy={step === 'sending'} disabled={needsJustification && justification.trim().length < 5}>
              Confirmar registro
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>
            Hora aproximada <span className="font-mono font-semibold tabular">{hora(now.toISOString(), tz)}</span>. Vale a hora do servidor no recebimento.
          </p>
          <p>
            Local: <span className="font-semibold">{location?.name ?? 'Outro local'}</span>
          </p>
          {evaluation ? (
            <p className="text-sm">
              <Tone tone={evaluation.status === 'inside' ? 'ok' : evaluation.status === 'no_geofence' ? 'muted' : 'warn'}>{GEO_STATUS_LABEL[evaluation.status]}</Tone>
              {evaluation.distanceM !== null && capture?.position ? (
                <span className="text-texto-3">
                  {' '}
                  · {evaluation.distanceM} m do local, precisão {Math.round(capture.position.accuracyM)} m
                </span>
              ) : null}
            </p>
          ) : null}
          {serverAlerts.length ? <Notice tone="warn">{serverAlerts.map((a) => ALERT_LABEL[a.code]).join('; ')}</Notice> : null}
          {needsJustification ? (
            <Textarea
              label="Justificativa"
              hint="Obrigatória quando a localização não confirma o local. Não é punição: vai para análise do empregador."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              maxLength={500}
            />
          ) : null}
          <p className="text-xs text-texto-3">GPS é um indício de local, não uma prova. A posição é lida só neste momento.</p>
        </div>
      </Dialog>
    </div>
  );
}
