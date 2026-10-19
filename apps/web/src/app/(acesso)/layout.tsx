import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AcessoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-marca px-4 py-3">
        <Link href="/" className="inline-flex items-center" aria-label="PontoNexo">
          <img src="/brand/pontonexo-logo-horizontal-fundo-escuro.svg" alt="PontoNexo" className="h-9 w-auto" />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
        <div className="w-full max-w-[440px]">{children}</div>
      </main>
      <footer className="px-4 py-4 text-center text-xs text-texto-3">
        Registro eletrônico de jornada (LC 150/2015, art. 12). Sem certificação REP-P. <Link className="underline" href="/verificar">Verificar comprovante</Link>
      </footer>
    </div>
  );
}
