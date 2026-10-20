'use client';
import type { PunchType, PunchView } from '@pontonexo/shared';

const SIMPLE_NAME: Record<PunchType, string> = { clock_in: 'Entrada', break_start: 'Pausa', break_end: 'Retorno', clock_out: 'Saída' };

/** Ícone e cor por tipo (a cor fica só no ícone; o cartão é branco). */
const TYPE_ICON: Record<PunchType, { icon: LucideIcon; color: string }> = {
  clock_in: { icon: LogIn, color: 'text-acao' },
  break_start: { icon: Coffee, color: 'text-marca-3' },
  break_end: { icon: RotateCcw, color: 'text-atencao' },
  clock_out: { icon: LogOut, color: 'text-perigo' },
};
import { Check, ChevronRight, Coffee, House, LogIn, LogOut, RotateCcw, Sunrise, Sunset, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { hora } from '@/lib/formato';

interface Tile {
  type: PunchType;
  n: number;
  label: string;
  icon: LucideIcon;
  /** cor do bloco quando é o próximo passo (texto branco ≥ 4,5:1) */
  active: string;
  /** cor da sombra em "r g b" */
  shade: string;
  /** marca d'água: o momento do dia (diferente do ícone do canto) */
  mark: LucideIcon;
}

const TILES: Tile[] = [
  { type: 'clock_in', n: 1, label: 'Entrada', icon: LogIn, active: 'bg-bloco-entrada', shade: '4 120 87', mark: Sunrise },
  { type: 'break_start', n: 2, label: 'Pausa', icon: Coffee, active: 'bg-bloco-pausa', shade: '29 78 216', mark: UtensilsCrossed },
  { type: 'break_end', n: 3, label: 'Retorno', icon: RotateCcw, active: 'bg-bloco-retorno', shade: '194 65 12', mark: House },
  { type: 'clock_out', n: 4, label: 'Saída', icon: LogOut, active: 'bg-bloco-saida', shade: '220 38 38', mark: Sunset },
];

const WAITING: Record<PunchType, string> = {
  clock_in: 'Jornada em andamento',
  break_start: 'Depois da entrada',
  break_end: 'Depois da pausa',
  clock_out: 'Depois da entrada',
};

/**
 * Grade 1–4 no estilo de relógio de ponto: só o(s) passo(s) permitido(s) agora ficam coloridos;
 * os demais mostram o horário já registrado hoje ou quando ficarão disponíveis.
 */
export function PunchGrid({
  allowed,
  today,
  tz,
  busyType,
  disabled,
  onPick,
}: {
  allowed: PunchType[];
  today: PunchView[];
  tz: string;
  busyType: PunchType | null;
  disabled: boolean;
  onPick: (t: PunchType) => void;
}) {
  const valid = today.filter((p) => !p.disregarded);
  return (
    <div className="grid grid-cols-2 gap-3">
      {TILES.map(({ type, n, label, icon: Icon, active, shade, mark: Mark }) => {
        const done = valid.filter((p) => p.type === type);
        const last = done.at(-1);
        const isNext = allowed.includes(type);
        const busy = busyType === type;
        const repeat = isNext && done.length > 0 && (type === 'break_start' || type === 'break_end');
        return (
          <button
            key={type}
            type="button"
            disabled={!isNext || disabled}
            onClick={() => onPick(type)}
            aria-label={isNext ? `${n}, ${label}: registrar agora` : `${n}, ${label}: ${last ? `registrado às ${hora(last.serverTime, tz)}` : 'indisponível agora'}`}
            style={{ '--sombra': shade } as React.CSSProperties}
            className={`bloco-3d relative isolate flex min-h-[148px] flex-col justify-between overflow-hidden rounded-[8px] p-4 text-left text-white ${active} disabled:cursor-default`}
          >
            <Mark size={92} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute -right-2 -bottom-1 -z-10 text-white/[0.07]" />
            <span className="flex items-start justify-between">
              <span className="text-[34px] leading-none font-bold">{n}</span>
              <Icon size={30} aria-hidden />
            </span>
            <span>
              <span className="block text-lg font-bold">
                {repeat ? `${label} (${done.length + 1}${type === 'break_start' ? 'ª' : 'º'})` : label}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-sm text-white/90">
                {busy ? (
                  'Verificando localização…'
                ) : isNext ? (
                  'Toque para registrar'
                ) : last ? (
                  <>
                    <Check size={15} aria-hidden />
                    <span className="font-bold tabular">{hora(last.serverTime, tz)}</span>
                  </>
                ) : (
                  type === 'clock_out' && allowed.includes('break_end') ? 'Depois do retorno' : WAITING[type]
                )}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Linha do tempo do dia: o que já foi registrado, em ordem. */
export function DayTimeline({ today, tz }: { today: PunchView[]; tz: string }) {
  if (!today.length) return <p className="text-texto-3">Nada registrado ainda.</p>;
  return (
    // grade de 2 colunas: as 4 marcações do dia aparecem juntas, sem arrastar para o lado
    <ol className="grid grid-cols-2 gap-2.5 pb-2" aria-label="Marcações de hoje">
      {today.map((p) => (
        <li key={p.id} className="min-w-0">
          <Link
            href={`/app/comprovante/${p.id}`}
            aria-label={`${SIMPLE_NAME[p.type]} às ${hora(p.serverTime, tz)}${p.alerts.length ? ', com observação' : ''}. Abrir comprovante`}
            className="cartao-3d block rounded-[8px] bg-card px-3 py-2.5 active:bg-realce"
          >
            {(() => {
              const { icon: TypeIcon, color } = TYPE_ICON[p.type];
              return (
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-texto-2">
                    <TypeIcon size={16} className={p.disregarded ? 'text-texto-3' : color} aria-hidden />
                    {SIMPLE_NAME[p.type]}
                  </span>
                  <ChevronRight size={16} className="text-borda-forte" aria-hidden />
                </span>
              );
            })()}
            <span className={`mt-1 block text-xl font-bold tabular ${p.disregarded ? 'text-texto-3 line-through' : 'text-marca'}`}>{hora(p.serverTime, tz)}</span>
            <span className="mt-0.5 flex items-center gap-1 text-xs text-texto-3">
              {p.disregarded ? (
                'Corrigida'
              ) : p.alerts.length ? (
                <span className="font-semibold text-atencao">Observação</span>
              ) : (
                <>
                  <Check size={13} className="text-acao" aria-hidden />
                  Registrada
                </>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
