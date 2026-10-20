'use client';
import { Check, Mic } from 'lucide-react';
import { useState } from 'react';
import { Textarea } from './ui';
import { VoiceButton } from './voz';

/**
 * Motivo em um toque: respostas prontas em botões grandes e "Outro motivo" com texto livre.
 * O texto escolhido é enviado como está, então o empregador lê a mesma frase.
 */
export function QuickReasons({ title, options, value, onChange }: { title: string; options: string[]; value: string; onChange: (v: string) => void }) {
  const [other, setOther] = useState(false);
  const picked = !other && options.includes(value);
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-md font-bold text-texto">{title}</legend>
      {options.map((o) => {
        const on = !other && value === o;
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => {
              setOther(false);
              onChange(o);
            }}
            className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-[8px] border-2 px-4 py-2 text-left text-base font-semibold ${on ? 'border-acao bg-acao-suave text-texto' : 'border-borda bg-card text-texto hover:border-borda-forte'}`}
          >
            {o}
            {on ? <Check size={20} className="shrink-0 text-acao" aria-hidden /> : null}
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={other}
        onClick={() => {
          setOther(true);
          if (picked) onChange('');
        }}
        className={`flex min-h-[52px] w-full items-center rounded-[8px] border-2 px-4 py-2 text-left text-base font-semibold ${other ? 'border-acao bg-acao-suave' : 'border-dashed border-borda-forte bg-card text-texto-2'}`}
      >
        Outro motivo
      </button>
      {other ? (
        <div className="space-y-2">
          <VoiceButton onText={(t) => onChange(value.trim() ? `${value.trim()} ${t}` : t)} />
          <Textarea label="Motivo" value={value} onChange={(e) => onChange(e.target.value)} rows={3} maxLength={500} />
          <p className="flex items-center gap-1 text-sm text-texto-3">
            <Mic size={16} aria-hidden /> Também dá para usar o microfone do teclado.
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}
