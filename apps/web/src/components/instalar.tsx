'use client';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isIos, isStandalone } from '@/lib/dispositivo';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// o navegador dispara o evento uma vez; guardamos para usar quando a pessoa tocar
let deferred: InstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
  });
}

const DISMISS_KEY = 'pn_instalar_dispensado';

/** Explica como colocar o app na tela inicial (Android: botão; iPhone: passo a passo). */
export function InstallGuide({ compact = false, onDone }: { compact?: boolean; onDone?: () => void }) {
  const [installed, setInstalled] = useState(true);
  const [canPrompt, setCanPrompt] = useState(false);
  useEffect(() => {
    setInstalled(isStandalone());
    setCanPrompt(deferred !== null);
    const id = setInterval(() => setCanPrompt(deferred !== null), 1000);
    return () => clearInterval(id);
  }, []);
  if (installed) return compact ? null : <p className="text-texto-2">O app já está instalado neste celular.</p>;

  if (canPrompt) {
    return (
      <button
        type="button"
        onClick={async () => {
          await deferred?.prompt();
          const choice = await deferred?.userChoice;
          if (choice?.outcome === 'accepted') {
            deferred = null;
            onDone?.();
          }
        }}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-marca font-semibold text-white"
      >
        <Download size={20} aria-hidden /> Instalar o app no celular
      </button>
    );
  }
  if (isIos()) {
    return (
      <ol className="space-y-2 text-texto-2">
        <li className="flex items-center gap-2">
          <span className="font-bold text-marca">1.</span> No Safari, toque em <Share size={18} className="text-marca" aria-label="Compartilhar" /> (quadrado com seta).
        </li>
        <li className="flex items-center gap-2">
          <span className="font-bold text-marca">2.</span> Toque em <SquarePlus size={18} className="text-marca" aria-hidden /> “Adicionar à Tela de Início”.
        </li>
        <li className="flex items-center gap-2">
          <span className="font-bold text-marca">3.</span> Toque em “Adicionar”. Pronto: o PontoNexo vira um ícone.
        </li>
      </ol>
    );
  }
  return <p className="text-texto-2">No menu do navegador (três pontinhos), toque em “Instalar app” ou “Adicionar à tela inicial”.</p>;
}

/** Cartão discreto na tela de ponto até a pessoa instalar ou dispensar. */
export function InstallCard() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      dismissed = false;
    }
    setShow(!dismissed && !isStandalone());
  }, []);
  if (!show) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // sem armazenamento: só esconde agora
    }
    setShow(false);
  };
  return (
    <section className="rounded-[8px] bg-card p-4 shadow-card">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="font-bold text-marca">Coloque o PontoNexo na tela inicial</p>
        <button type="button" onClick={dismiss} className="-m-1 rounded-[8px] p-1 text-texto-3" aria-label="Agora não">
          <X size={18} />
        </button>
      </div>
      <p className="mb-3 text-sm text-texto-2">Abre mais rápido, funciona sem internet e recebe os lembretes.</p>
      <InstallGuide compact onDone={dismiss} />
    </section>
  );
}
