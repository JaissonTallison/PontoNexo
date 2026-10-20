'use client';
import { formatDateBR, localDate, localToInstant, type PunchType, type PunchView } from '@pontonexo/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { CASOS, isCaso, type Caso } from '@/components/casos-pedido';
import { QuickReasons } from '@/components/motivos';
import { useSession } from '@/components/session';
import { Button, Input, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { hojeLocal, hora } from '@/lib/formato';
import { useResource } from '@/lib/hooks';


const MOTIVOS: Record<Caso, string[]> = {
  esqueci: ['Esqueci de marcar na hora', 'O celular estava sem bateria', 'Estava sem internet', 'O aplicativo não funcionou'],
  errado: ['Toquei no botão errado', 'Marquei antes da hora sem querer', 'O celular demorou e marcou atrasado'],
  semquerer: ['Toquei duas vezes sem querer', 'Marquei por engano', 'O celular marcou duas vezes'],
  faltei: ['Consulta médica, tenho atestado', 'Fiquei doente', 'Combinei a folga com o empregador', 'Problema de família'],
};

const TIPOS: Array<{ type: PunchType; label: string }> = [
  { type: 'clock_in', label: 'Entrada' },
  { type: 'break_start', label: 'Pausa' },
  { type: 'break_end', label: 'Retorno' },
  { type: 'clock_out', label: 'Saída' },
];
const NOME: Record<PunchType, string> = { clock_in: 'Entrada', break_start: 'Pausa', break_end: 'Retorno', clock_out: 'Saída' };

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-[8px] border-2 p-4 text-left ${selected ? 'border-acao bg-acao-suave' : 'border-borda bg-card hover:border-borda-forte'}`}
    >
      {children}
    </button>
  );
}

function Assistente() {
  const { me } = useSession();
  const tz = me.timezone;
  const params = useSearchParams();
  const inicial = params.get('caso');
  const [caso, setCaso] = useState<Caso | null>(isCaso(inicial) ? inicial : null);
  const [step, setStep] = useState(isCaso(inicial) ? 2 : 1);
  const [day, setDay] = useState(params.get('dia') ?? hojeLocal(tz));
  const [type, setType] = useState<PunchType | null>(null);
  const [time, setTime] = useState('');
  const [target, setTarget] = useState<PunchView | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const punches = useResource<PunchView[]>(caso === 'errado' || caso === 'semquerer' ? `/me/punches?month=${day.slice(0, 7)}` : null);
  const ofDay = (punches.data ?? []).filter((p) => !p.disregarded && localDate(new Date(p.serverTime), tz) === day);

  const step2Ok = caso === 'faltei' ? Boolean(day) : caso === 'esqueci' ? Boolean(day && type && time) : caso === 'semquerer' ? Boolean(target) : Boolean(target && time);

  async function enviar() {
    if (!caso) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/corrections', {
        kind: CASOS.find((c) => c.id === caso)!.kind,
        targetPunchId: caso === 'errado' || caso === 'semquerer' ? target?.id : null,
        proposedType: caso === 'esqueci' ? type : null,
        proposedTime: caso === 'faltei' || caso === 'semquerer' ? null : localToInstant(day, time, tz).toISOString(),
        absenceDate: caso === 'faltei' ? day : null,
        reason,
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'Não foi possível enviar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-[8px] bg-acao p-6 text-white">
          <p className="text-xl font-bold">Pedido enviado</p>
          <p className="mt-1 text-white/90">Seu empregador vai analisar. Você recebe a resposta aqui no app.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/app" className="flex min-h-[56px] items-center justify-center rounded-[8px] bg-marca font-semibold text-white">
            Voltar ao ponto
          </Link>
          <Link href="/app/correcoes" className="flex min-h-[56px] items-center justify-center rounded-[8px] border border-borda-forte bg-card font-semibold text-marca">
            Ver meus pedidos
          </Link>
        </div>
      </div>
    );
  }

  const resumo =
    caso === 'esqueci'
      ? `${type ? NOME[type] : ''} no dia ${formatDateBR(day)} às ${time}`
      : caso === 'errado'
        ? `${target ? NOME[target.type] : ''} de ${target ? hora(target.serverTime, tz) : ''} para ${time}, dia ${formatDateBR(day)}`
        : caso === 'semquerer'
          ? `Desconsiderar ${target ? `${NOME[target.type]} das ${hora(target.serverTime, tz)}` : 'a marcação'}, dia ${formatDateBR(day)}`
          : `Falta no dia ${formatDateBR(day)}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {/* só no 1º passo: nos outros o botão "Voltar" embaixo já faz esse papel */}
        {step === 1 ? (
          <Link href="/app" aria-label="Voltar para a tela do ponto" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-card text-marca shadow-card active:bg-realce">
            <ArrowLeft size={22} aria-hidden />
          </Link>
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-texto-3">Passo {step} de 3</p>
          <h1 className="text-xl font-bold text-marca">{step === 1 ? 'O que aconteceu?' : step === 2 ? (caso === 'faltei' ? 'Qual dia você faltou?' : 'Conte os detalhes') : 'Confirme e envie'}</h1>
        </div>
      </div>

      {step === 1 ? (
        <div className="space-y-3">
          {CASOS.map(({ id, title, hint, icon: Icon }) => (
            <Choice
              key={id}
              selected={caso === id}
              onClick={() => {
                setCaso(id);
                setTarget(null);
                setType(null);
                setStep(2);
              }}
            >
              <span className="flex items-center gap-3">
                <Icon size={26} className="shrink-0 text-marca" aria-hidden />
                <span>
                  <span className="block text-md font-bold text-texto">{title}</span>
                  <span className="block text-sm text-texto-3">{hint}</span>
                </span>
              </span>
            </Choice>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <Input label="Qual dia?" type="date" max={hojeLocal(tz)} value={day} onChange={(e) => { setDay(e.target.value); setTarget(null); }} className="h-12" />

          {caso === 'esqueci' ? (
            <>
              <div>
                <p className="mb-2 text-sm font-semibold text-texto-2">O que você esqueceu de marcar?</p>
                <div className="grid grid-cols-2 gap-2">
                  {TIPOS.map((t) => (
                    <Choice key={t.type} selected={type === t.type} onClick={() => setType(t.type)}>
                      <span className="block text-center text-md font-bold">{t.label}</span>
                    </Choice>
                  ))}
                </div>
              </div>
              <Input label="Que horas foi?" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-12" />
            </>
          ) : null}

          {caso === 'errado' || caso === 'semquerer' ? (
            <>
              <div>
                <p className="mb-2 text-sm font-semibold text-texto-2">{caso === 'semquerer' ? 'Qual marcação foi feita sem querer?' : 'Qual marcação está errada?'}</p>
                {punches.loading ? (
                  <p className="text-texto-3">Carregando…</p>
                ) : ofDay.length ? (
                  <div className="space-y-2">
                    {ofDay.map((p) => (
                      <Choice key={p.id} selected={target?.id === p.id} onClick={() => setTarget(p)}>
                        <span className="flex justify-between font-semibold">
                          <span>{NOME[p.type]}</span>
                          <span className="font-bold tabular">{hora(p.serverTime, tz)}</span>
                        </span>
                      </Choice>
                    ))}
                  </div>
                ) : (
                  <p className="text-texto-3">Nenhuma marcação neste dia. Se você não marcou, volte e escolha “Esqueci de marcar”.</p>
                )}
              </div>
              {caso === 'semquerer' && target ? <p className="text-sm text-texto-2">Ela deixa de contar nas suas horas. O registro original continua guardado.</p> : null}
              {caso === 'errado' && target ? <Input label="Qual era o horário certo?" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-12" /> : null}
            </>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" onClick={() => setStep(1)}>
              Voltar
            </Button>
            <Button size="lg" disabled={!step2Ok} onClick={() => setStep(3)}>
              Continuar
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <div className="rounded-[8px] border border-borda bg-card p-4">
            <p className="text-sm text-texto-3">Você está pedindo</p>
            <p className="text-md font-bold text-texto">{resumo}</p>
          </div>
          {caso ? <QuickReasons title="Escolha o motivo" options={MOTIVOS[caso]} value={reason} onChange={setReason} /> : null}
          <p className="text-sm text-texto-3">Seu empregador analisa o pedido. O registro original não é apagado: o ajuste fica anotado junto.</p>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" onClick={() => setStep(2)}>
              Voltar
            </Button>
            <Button size="lg" busy={busy} disabled={reason.trim().length < 10} onClick={enviar}>
              Enviar pedido
            </Button>
          </div>
          {reason.trim().length > 0 && reason.trim().length < 10 ? <p className="text-sm text-texto-3">Escreva um pouco mais.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Assistente />
    </Suspense>
  );
}
