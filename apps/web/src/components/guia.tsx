'use client';
import { Volume2, VolumeX } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from './session';

/*
 * Explicação de primeiro uso: boas-vindas no primeiro acesso e, na primeira vez em cada tela,
 * uma dica presa ao elemento que ela explica. Uma dica por vez, nada bloqueia o uso.
 * O que já foi visto fica guardado neste aparelho (por usuário); "Rever as explicações" zera.
 */

// ───── Leitura em voz alta (voz do próprio aparelho; nada sai dele) ─────

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string) {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR';
  u.rate = 0.95;
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('pt-br')) ?? synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('pt'));
  if (voice) u.voice = voice;
  synth.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** Botão "Ouvir": lê o texto; tocar de novo para. */
export function ListenButton({ text, tone = 'light', className = '' }: { text: string; tone?: 'light' | 'plain'; className?: string }) {
  const [on, setOn] = useState(false);
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(canSpeak()), []);
  useEffect(() => () => stopSpeaking(), []);
  if (!ok) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (on) {
          stopSpeaking();
          setOn(false);
          return;
        }
        speak(text);
        setOn(true);
        const poll = window.setInterval(() => {
          if (!window.speechSynthesis.speaking) {
            setOn(false);
            window.clearInterval(poll);
          }
        }, 400);
      }}
      aria-pressed={on}
      className={`inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-sm font-semibold ${tone === 'light' ? 'bg-realce text-marca hover:bg-borda' : 'text-marca-3 hover:bg-realce'} ${className}`}
    >
      {on ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
      {on ? 'Parar' : 'Ouvir'}
    </button>
  );
}

// ───── Estado do guia ─────

export interface Welcome {
  title: string;
  paragraphs: string[];
}

interface Registered {
  order: number;
  title: string;
  text: string;
  el: HTMLElement;
}

interface GuideValue {
  register: (id: string, tip: Registered) => () => void;
  activeId: string | null;
  restart: () => void;
}

const Ctx = createContext<GuideValue | null>(null);

export const useGuide = () => useContext(Ctx);

interface Stored {
  welcome: boolean;
  off: boolean;
  seen: string[];
}

const visible = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

export function GuideProvider({ scope, welcome, children }: { scope: 'app' | 'painel'; welcome: Welcome; children: ReactNode }) {
  const { me } = useSession();
  const key = `pn_guia_${scope}_${me.user.id}`;
  const [state, setState] = useState<Stored | null>(null);
  const tips = useRef(new Map<string, Registered>());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let s: Stored = { welcome: false, off: false, seen: [] };
    try {
      const raw = localStorage.getItem(key);
      if (raw) s = { ...s, ...(JSON.parse(raw) as Partial<Stored>) };
      // testes automatizados desligam o guia para não esbarrar nas dicas
      if (localStorage.getItem('pn_guia_off') === '1') s = { welcome: true, off: true, seen: [] };
    } catch {
      // sem armazenamento: mostra de novo na próxima visita, sem problema
    }
    setState(s);
  }, [key]);

  const save = useCallback(
    (next: Stored) => {
      setState(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // vale só nesta visita
      }
    },
    [key],
  );

  const register = useCallback((id: string, tip: Registered) => {
    tips.current.set(id, tip);
    setVersion((v) => v + 1);
    return () => {
      tips.current.delete(id);
      setVersion((v) => v + 1);
    };
  }, []);

  // dicas desta tela ainda não vistas, na ordem; elementos escondidos (menu do computador no celular) ficam de fora
  const pending = useMemo(() => {
    void version;
    if (!state || !state.welcome || state.off) return [];
    return [...tips.current.entries()]
      .filter(([id, t]) => !state.seen.includes(id) && t.el.isConnected && visible(t.el))
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id]) => id);
  }, [state, version]);
  const activeId = pending[0] ?? null;

  const dismiss = (id: string) => state && save({ ...state, seen: [...state.seen, id] });
  const restart = useCallback(() => save({ welcome: false, off: false, seen: [] }), [save]);
  const value = useMemo(() => ({ register, activeId, restart }), [register, activeId, restart]);

  const active = activeId ? tips.current.get(activeId) : undefined;

  return (
    <Ctx.Provider value={value}>
      {children}
      {state && !state.welcome ? <WelcomeDialog welcome={welcome} onDone={() => save({ ...state, welcome: true })} onSkip={() => save({ ...state, welcome: true, off: true })} /> : null}
      {active && activeId && state ? (
        <Bubble
          key={activeId}
          tip={active}
          step={1}
          total={pending.length}
          onOk={() => {
            stopSpeaking();
            dismiss(activeId);
          }}
          onOff={() => {
            stopSpeaking();
            save({ ...state, off: true });
          }}
        />
      ) : null}
    </Ctx.Provider>
  );
}

function WelcomeDialog({ welcome, onDone, onSkip }: { welcome: Welcome; onDone: () => void; onSkip: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // o foco vai para "Começar" (o showModal escolheria o primeiro botão)
    start.current?.focus();
  }, []);
  const all = [welcome.title, ...welcome.paragraphs].join('. ');
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        stopSpeaking();
        onDone();
      }}
      aria-labelledby="guia-boas-vindas"
      className="m-auto w-[min(480px,calc(100vw-24px))] rounded-[8px] border border-borda bg-card p-0 text-texto shadow-flutuante backdrop:bg-marca/50"
    >
      <div className="px-5 pt-5 pb-4">
        <img src="/brand/pontonexo-simbolo.svg" alt="" className="h-12 w-auto" />
        <h2 id="guia-boas-vindas" className="mt-3 text-xl font-bold text-marca">
          {welcome.title}
        </h2>
        <div className="mt-2 space-y-2 text-md text-texto-2">
          {welcome.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <ListenButton text={all} className="mt-4" />
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-borda px-5 py-3">
        <button
          type="button"
          className="h-10 rounded-[8px] px-2 text-sm font-semibold text-texto-3 hover:text-marca"
          onClick={() => {
            stopSpeaking();
            onSkip();
          }}
        >
          Já sei usar, não mostrar dicas
        </button>
        <button
          ref={start}
          type="button"
          className="h-11 rounded-[8px] bg-marca px-6 text-md font-semibold text-white hover:bg-marca-2"
          onClick={() => {
            stopSpeaking();
            onDone();
          }}
        >
          Começar
        </button>
      </footer>
    </dialog>
  );
}

const BUBBLE_W = 320;
const GAP = 12;

/** Balão preso ao elemento: abaixo dele quando cabe, senão acima; contorno laranja no alvo. */
function Bubble({ tip, step, total, onOk, onOff }: { tip: Registered; step: number; total: number; onOk: () => void; onOff: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; arrow: number; below: boolean; target: DOMRect } | null>(null);

  const place = useCallback(() => {
    const r = tip.el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(BUBBLE_W, vw - 24);
    const h = box.current?.offsetHeight ?? 180;
    const below = r.bottom + GAP + h < vh - 8 || r.top - GAP - h < 8;
    const top = below ? r.bottom + GAP : r.top - GAP - h;
    const center = r.left + r.width / 2;
    const left = Math.min(Math.max(12, center - w / 2), vw - w - 12);
    setPos({ top: Math.max(8, Math.min(top, vh - h - 8)), left, arrow: Math.min(Math.max(16, center - left), w - 16), below, target: r });
  }, [tip.el]);

  useEffect(() => {
    tip.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = window.setTimeout(place, 350);
    return () => window.clearTimeout(t);
  }, [tip.el, place]);

  useLayoutEffect(() => {
    place();
    let frame = 0;
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    window.addEventListener('resize', onMove);
    // capture: o painel rola dentro do <main>, não na janela
    window.addEventListener('scroll', onMove, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [place]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {pos ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-40 rounded-[8px] ring-[3px] ring-marcador ring-offset-2 ring-offset-transparent"
          style={{ top: pos.target.top, left: pos.target.left, width: pos.target.width, height: pos.target.height }}
        />
      ) : null}
      <div
        ref={box}
        role="dialog"
        aria-modal="false"
        aria-labelledby="guia-dica-titulo"
        className="fixed z-50 rounded-[8px] border border-borda bg-card p-4 text-texto shadow-flutuante"
        style={{ top: pos?.top ?? -9999, left: pos?.left ?? 0, width: `min(${BUBBLE_W}px, calc(100vw - 24px))` }}
      >
        {pos ? (
          <span
            aria-hidden
            className={`absolute size-3 rotate-45 border-borda bg-card ${pos.below ? '-top-[7px] border-t border-l' : '-bottom-[7px] border-r border-b'}`}
            style={{ left: pos.arrow - 6 }}
          />
        ) : null}
        <p className="text-xs font-semibold tracking-wide text-texto-3 uppercase">{total > 1 ? `Dica · mais ${total - step} nesta tela` : 'Dica'}</p>
        <p id="guia-dica-titulo" className="mt-0.5 text-md font-bold text-marca">
          {tip.title}
        </p>
        <p className="mt-1 text-texto-2">{tip.text}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <ListenButton text={`${tip.title}. ${tip.text}`} />
          <button type="button" autoFocus onClick={onOk} className="h-10 rounded-[8px] bg-marca px-5 font-semibold text-white hover:bg-marca-2">
            Entendi
          </button>
        </div>
        <button type="button" onClick={onOff} className="mt-2 text-sm font-semibold text-texto-3 hover:text-marca">
          Não mostrar mais dicas
        </button>
      </div>
    </>,
    document.body,
  );
}

/** Marca um elemento da tela com uma dica de primeiro uso. Sem GuideProvider, só mostra o conteúdo. */
export function Tip({ id, order, title, text, children, className = '' }: { id: string; order: number; title: string; text: string; children: ReactNode; className?: string }) {
  const guide = useGuide();
  const ref = useRef<HTMLDivElement>(null);
  const register = guide?.register;
  useEffect(() => {
    if (!register || !ref.current) return;
    return register(id, { order, title, text, el: ref.current });
  }, [register, id, order, title, text]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
