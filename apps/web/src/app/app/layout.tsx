'use client';
import { Bell, CalendarDays, CircleHelp, Clock, Inbox, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { PunchContextProvider, usePunchContext } from '@/components/ponto-context';
import { useOnline } from '@/lib/hooks';
import { offlineQueue } from '@/lib/offline';
import { PrivacyGate } from '@/components/privacidade';
import { SessionProvider, useSession } from '@/components/session';
import { Empty } from '@/components/ui';

const TABS = [
  { href: '/app', label: 'Ponto', icon: Clock },
  { href: '/app/historico', label: 'Registros', icon: CalendarDays },
  { href: '/app/corrigir', label: 'Esqueci', icon: CircleHelp },
  { href: '/app/correcoes', label: 'Pedidos', icon: Inbox },
  { href: '/app/conta', label: 'Perfil', icon: UserRound },
];

/** Conexão, marcações guardadas sem internet e avisos que pedem resposta do funcionário. */
function HeaderStatus({ path }: { path: string }) {
  const online = useOnline();
  const [queued, setQueued] = useState(0);
  const ctx = usePunchContext();
  // itens para responder + respostas do empregador ainda não vistas
  const avisos = (ctx.data?.pendingAcknowledgements ?? 0) + (ctx.data?.unseenDecisions ?? 0);

  useEffect(() => {
    let alive = true;
    const read = () => offlineQueue.list().then((l) => alive && setQueued(l.length)).catch(() => undefined);
    void read();
    const id = setInterval(read, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [path, online]);

  return (
    <span className="flex shrink-0 items-center gap-3">
      {!online || queued ? (
        <span className="text-right text-xs leading-tight font-semibold text-marcador" role="status">
          {!online ? 'Sem internet' : null}
          {queued ? <span className="block">{queued === 1 ? '1 para enviar' : `${queued} para enviar`}</span> : null}
        </span>
      ) : null}
      <Link href="/app/correcoes" className="relative flex h-11 w-11 items-center justify-center rounded-[8px] text-white active:bg-white/10" aria-label={avisos ? `${avisos} ${avisos === 1 ? 'aviso novo' : 'avisos novos'}` : 'Avisos'}>
        <Bell size={24} aria-hidden />
        {avisos ? (
          <span className="absolute top-1 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-[6px] bg-marcador px-1 text-[11px] font-bold text-marca tabular" aria-hidden>
            {avisos > 9 ? '9+' : avisos}
          </span>
        ) : null}
      </Link>
    </span>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { me, reload } = useSession();
  const path = usePathname();

  if (me.active?.role !== 'employee') {
    return <Empty title="Este acesso é do painel do empregador" action={<Link href="/painel" className="font-semibold text-acao underline">Ir para o painel</Link>} />;
  }
  if (!me.privacyAcknowledged) return <PrivacyGate onDone={reload} />;
  const firstName = me.user.name.split(' ')[0];

  const isActive = (href: string) => (href === '/app' ? path === '/app' || path.startsWith('/app/comprovante') : href === '/app/conta' ? path.startsWith('/app/conta') || path === '/app/privacidade' || path === '/app/ajuda' : path.startsWith(href));

  const tabs = (
    <ul className="mx-auto grid max-w-[640px] grid-cols-5">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        const link = (
          <Link
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex h-[72px] flex-col items-center justify-center gap-1 text-xs ${active ? 'font-bold text-white' : 'font-semibold text-white/70'}`}
          >
            {/* fundo marinho: ativo em branco pleno e laranja da marca no traço; inativos em branco suave */}
            <Icon size={28} strokeWidth={active ? 2.4 : 1.7} className={active ? 'text-marcador' : 'text-white/70'} aria-hidden />
            {label}
          </Link>
        );
        return (
          <li key={href}>
            {link}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="min-h-screen pb-[calc(76px+env(safe-area-inset-bottom))] print:p-0">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-marca px-4 py-2.5 print:hidden">
        <img src="/brand/pontonexo-simbolo-fundo-escuro.svg" alt="" className="h-10 w-auto shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-md font-bold text-white">Olá, {firstName}</span>
          <span className="block truncate text-xs text-borda-forte">{me.active.employerName}</span>
        </span>
        <HeaderStatus path={path} />
      </header>
      <main className="mx-auto w-full max-w-[640px] px-4 py-4 print:max-w-none print:p-0">{children}</main>
      <nav aria-label="Navegação" className="fixed inset-x-0 bottom-0 z-20 bg-marca pb-[env(safe-area-inset-bottom)] print:hidden">
        {tabs}
      </nav>
    </div>
  );
}

/** O contexto de ponto só existe para quem tem vínculo de funcionário. */
function EmployeeOnly({ children }: { children: ReactNode }) {
  const { me } = useSession();
  if (me.active?.role !== 'employee') {
    return <Empty title="Este acesso é do painel do empregador" action={<Link href="/painel" className="font-semibold text-acao underline">Ir para o painel</Link>} />;
  }
  return <>{children}</>;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  // barra de rolagem escondida só enquanto o app do funcionário está aberto
  useEffect(() => {
    document.documentElement.classList.add('app-sem-barra');
    return () => document.documentElement.classList.remove('app-sem-barra');
  }, []);
  return (
    <SessionProvider>
      <EmployeeOnly>
        <PunchContextProvider>
          <Shell>{children}</Shell>
        </PunchContextProvider>
      </EmployeeOnly>
    </SessionProvider>
  );
}
