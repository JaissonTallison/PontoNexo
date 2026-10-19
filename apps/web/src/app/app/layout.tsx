'use client';
import { Clock, FileText, History, Shield, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { PrivacyGate } from '@/components/privacidade';
import { SessionProvider, useSession } from '@/components/session';
import { Empty } from '@/components/ui';

const NAV = [
  { href: '/app', label: 'Ponto', icon: Clock },
  { href: '/app/historico', label: 'Histórico', icon: History },
  { href: '/app/correcoes', label: 'Correções', icon: FileText },
  { href: '/app/privacidade', label: 'Privacidade', icon: Shield },
  { href: '/app/conta', label: 'Conta', icon: User },
];

function Shell({ children }: { children: ReactNode }) {
  const { me, reload } = useSession();
  const path = usePathname();
  if (me.active?.role !== 'employee') {
    return (
      <Empty
        title="Este acesso é do painel do empregador"
        description="O app de marcação é exclusivo para funcionários."
        action={
          <Link href="/painel" className="font-semibold text-acao underline">
            Ir para o painel
          </Link>
        }
      />
    );
  }
  if (!me.privacyAcknowledged) return <PrivacyGate onDone={reload} />;
  return (
    <div className="flex min-h-screen flex-col pb-[72px] print:block print:p-0">
      <header className="sticky top-0 z-10 print:hidden flex items-center justify-between gap-3 bg-card px-4 py-2 shadow-barra">
        <div className="min-w-0">
          <p className="truncate text-sm text-texto-3">{me.active.employerName}</p>
          <p className="truncate text-md font-bold text-marca">{me.user.name}</p>
        </div>
        <img src="/brand/pontonexo-simbolo.svg" alt="PontoNexo" className="h-9 w-auto" />
      </header>
      <main className="mx-auto w-full max-w-[640px] flex-1 px-4 py-4 print:max-w-none print:p-0">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-10 print:hidden border-t border-borda bg-card pb-[env(safe-area-inset-bottom)]" aria-label="Navegação">
        <ul className="mx-auto grid max-w-[640px] grid-cols-5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/app' ? path === '/app' : path.startsWith(href);
            return (
              <li key={href}>
                <Link href={href} aria-current={active ? 'page' : undefined} className={`flex h-[64px] flex-col items-center justify-center gap-1 text-xs font-semibold ${active ? 'text-acao' : 'text-texto-3'}`}>
                  <Icon size={22} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
