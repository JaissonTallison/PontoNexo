'use client';
import { Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';

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
