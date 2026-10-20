import { FileCheck2, MapPin, Smartphone } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BackToLogin } from '@/components/voltar-acesso';

const BENEFITS = [
  { icon: Smartphone, title: 'Ponto pelo celular', text: 'Sem relógio na parede. A hora é a do servidor.' },
  { icon: MapPin, title: 'Local conferido na hora', text: 'Só no momento da marcação, sem rastrear ninguém.' },
  { icon: FileCheck2, title: 'Comprovante e espelho', text: 'Registros guardados, corrigidos com histórico.' },
];

export default function AcessoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(420px,5fr)_7fr]">
      {/* painel da marca (computador) */}
      <aside className="relative hidden overflow-hidden bg-marca px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <img src="/brand/pontonexo-simbolo-mono-branco.svg" alt="" aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 w-[460px] opacity-[0.04]" />
        <Link href="/" aria-label="PontoNexo">
          <img src="/brand/pontonexo-logo-horizontal-fundo-escuro.svg" alt="PontoNexo" className="h-14 w-auto" />
        </Link>
        <div className="relative max-w-md">
          <p className="text-[34px] leading-tight font-bold">
            Jornada registrada.
            <br />
            <span className="text-marcador">Gestão simplificada.</span>
          </p>
          <ul className="mt-10 space-y-6">
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <Icon size={24} className="mt-0.5 shrink-0 text-marcador" aria-hidden />
                <span>
                  <span className="block text-md font-semibold">{title}</span>
                  <span className="block text-sm text-white/70">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">Controle de jornada para trabalho doméstico · LC 150/2015, art. 12</p>
      </aside>

      <div className="flex min-h-screen flex-col">
        {/* faixa da marca (celular) */}
        <header className="bg-marca px-5 py-4 lg:hidden">
          <Link href="/" aria-label="PontoNexo">
            <img src="/brand/pontonexo-logo-horizontal-fundo-escuro.svg" alt="PontoNexo" className="h-10 w-auto" />
          </Link>
        </header>
        <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center lg:px-10">
          <div className="w-full max-w-[440px]">
            <BackToLogin />
            {children}
          </div>
        </main>
        <footer className="px-4 pb-6 text-center text-xs text-texto-3">
          Registro eletrônico de jornada (LC 150/2015, art. 12), sem certificação REP-P ·{' '}
          <Link className="underline" href="/verificar">
            Verificar comprovante
          </Link>
        </footer>
      </div>
    </div>
  );
}
