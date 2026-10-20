'use client';
import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/* Tipos mínimos da Web Speech API (não fazem parte do lib.dom do TypeScript) */
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  isFinal: boolean;
  0: SpeechAlternative;
}
interface SpeechEvent {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechResult };
}
interface SpeechRecognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognizerCtor = new () => SpeechRecognizer;

function getRecognizer(): RecognizerCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'O microfone foi bloqueado. Libere o microfone nas configurações do navegador.',
  'service-not-allowed': 'O microfone foi bloqueado. Libere o microfone nas configurações do navegador.',
  'no-speech': 'Não ouvimos nada. Toque e fale de novo.',
  network: 'Sem internet para transformar a fala em texto. Escreva o motivo.',
  'audio-capture': 'Não encontramos o microfone do celular.',
};

/**
 * Botão "Falar": grava e devolve o texto quando a pessoa termina.
 * A transcrição é feita pelo serviço de voz do navegador (Google/Apple); o PontoNexo não recebe nem guarda áudio.
 */
export function VoiceButton({ onText }: { onText: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRecognizer | null>(null);
  const finalText = useRef('');

  useEffect(() => setSupported(getRecognizer() !== null), []);
  useEffect(() => () => rec.current?.stop(), []);

  if (!supported) return null;

  function start() {
    const Ctor = getRecognizer();
    if (!Ctor) return;
    setError(null);
    setLive('');
    finalText.current = '';
    const r = new Ctor();
    r.lang = 'pt-BR';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) finalText.current += res[0].transcript;
        else interim += res[0].transcript;
      }
      setLive(`${finalText.current}${interim}`);
    };
    r.onerror = (e) => setError(ERRORS[e.error] ?? 'Não foi possível ouvir. Tente de novo ou escreva.');
    r.onend = () => {
      setListening(false);
      const text = finalText.current.trim();
      if (text) onText(text.charAt(0).toUpperCase() + text.slice(1));
    };
    rec.current = r;
    r.start();
    setListening(true);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => (listening ? rec.current?.stop() : start())}
        className={`flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[8px] text-md font-semibold ${listening ? 'bg-perigo text-white' : 'bg-marca text-white'}`}
        aria-live="polite"
      >
        {listening ? <Square size={20} aria-hidden /> : <Mic size={22} aria-hidden />}
        {listening ? 'Ouvindo… toque para terminar' : 'Falar o motivo'}
      </button>
      {listening && live ? <p className="mt-2 text-texto-2 italic">“{live}”</p> : null}
      {error ? <p className="mt-2 text-sm text-perigo">{error}</p> : null}
      {!listening ? <p className="mt-1 text-xs text-texto-3">A fala vira texto pelo serviço de voz do celular. Nenhum áudio é guardado.</p> : null}
    </div>
  );
}
