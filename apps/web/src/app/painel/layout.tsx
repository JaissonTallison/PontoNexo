'use client';
import type { Permission } from '@pontonexo/shared';
import { ROLE_LABEL } from '@pontonexo/shared';
import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  FileClock,
  FileSearch,
  Gauge,
  ListChecks,
  MapPin,
  Menu,
  Settings,
  ShieldCheck,
  Siren,
  User,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { SessionProvider, useSession } from '@/components/session';
import { Empty } from '@/components/ui';

const NAV: Array<{ href: string; label: string; icon: typeof Gauge; perm: Permission }> = [
  { href: '/painel', label: 'Visão geral', icon: Gauge, perm: 'employer.read' },
  { href: '/painel/funcionarios', label: 'Funcionários', icon: Users, perm: 'employees.read' },
  { href: '/painel/marcacoes', label: 'Marcações', icon: FileClock, perm: 'punches.read' },
  { href: '/painel/ocorrencias', label: 'Ocorrências', icon: AlertTriangle, perm: 'punches.read' },
  { href: '/painel/correcoes', label: 'Correções', icon: ListChecks, perm: 'corrections.read' },
  { href: '/painel/espelho', label: 'Espelho e fechamento', icon: ClipboardCheck, perm: 'timesheets.read' },
  { href: '/painel/locais', label: 'Locais', icon: MapPin, perm: 'employees.read' },
  { href: '/painel/escalas', label: 'Escalas e feriados', icon: CalendarDays, perm: 'employees.read' },
  { href: '/painel/auditoria', label: 'Auditoria', icon: FileSearch, perm: 'audit.read' },
  { href: '/painel/incidentes', label: 'Incidentes', icon: Siren, perm: 'incidents.manage' },
  { href: '/painel/privacidade', label: 'Privacidade (LGPD)', icon: ShieldCheck, perm: 'privacy.manage' },
  { href: '/painel/configuracoes', label: 'Configurações', icon: Settings, perm: 'settings.manage' },
];

function Shell({ children }: { children: ReactNode }) {
  const { me, can } = useSession();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (!me.active || me.active.role === 'employee') {
    return (
      <Empty
        title="Este acesso é do app do funcionário"
        action={
          <Link href="/app" className="font-semibold text-acao underline">
            Ir para o app
          </Link>
        }
      />
    );
  }
  const items = NAV.filter((n) => can(n.perm));
  const nav = (
    <nav aria-label="Menu principal" className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <img src="/brand/pontonexo-logo-horizontal-fundo-escuro.svg" alt="PontoNexo" className="h-10 w-auto" />
      </div>
      <ul className="flex-1 space-y-0.5 px-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === '/painel' ? path === '/painel' : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-[8px] px-3 py-2 text-sm font-semibold ${active ? 'bg-marca-3 text-white' : 'text-borda-forte hover:bg-marca-2 hover:text-white'}`}
              >
                <Icon size={18} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="px-4 py-3 text-xs text-borda-forte">Registro conforme LC 150/2015, art. 12. Sem certificação REP-P.</p>
    </nav>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr] print:block">
      <aside className="hidden bg-marca lg:block print:hidden">{nav}</aside>
      {open ? (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-marca/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[264px] bg-marca">
            <button className="absolute top-3 right-3 rounded-[8px] p-1 text-white" onClick={() => setOpen(false)} aria-label="Fechar menu">
              <X size={20} />
            </button>
            {nav}
          </aside>
        </div>
      ) : null}
      <div className="min-w-0">
        <header className="sticky top-0 z-20 print:hidden flex items-center justify-between gap-3 bg-card px-4 py-2 shadow-barra">
          <div className="flex min-w-0 items-center gap-2">
            <button className="rounded-[8px] p-1 text-marca lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
              <Menu size={22} />
            </button>
            <p className="truncate font-semibold text-marca">{me.active.employerName}</p>
          </div>
          <Link href="/painel/conta" className="flex items-center gap-2 rounded-[8px] px-2 py-1 hover:bg-realce">
            <span className="hidden text-right sm:block">
              <span className="block text-sm font-semibold">{me.user.name}</span>
              <span className="block text-xs text-texto-3">{ROLE_LABEL[me.active.role]}</span>
            </span>
            <User size={20} className="text-marca" aria-label="Conta" />
          </Link>
        </header>
        <main className="px-4 py-5 lg:px-6 print:p-0">{children}</main>
      </div>
    </div>
  );
}

export default function PainelLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
