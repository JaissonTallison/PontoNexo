'use client';
import type { Permission } from '@pontonexo/shared';
import { ROLE_LABEL } from '@pontonexo/shared';
import {
  CalendarDays,
  ClipboardCheck,
  FileClock,
  FileSearch,
  Gauge,
  ListChecks,
  MapPin,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  FileText,
  ChevronRight,
  ALargeSmall,
  Siren,
  Bell,
  ChevronDown,
  LogOut,
  User,
  Users,
  X,
} from 'lucide-react';
import type { DashboardBadges, TimeView } from '@pontonexo/shared';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { hora } from '@/lib/formato';
import { useResource, useServerClock } from '@/lib/hooks';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SessionProvider, useSession } from '@/components/session';
import { Empty } from '@/components/ui';

interface NavItem {
  href: string;
  label: string;
  icon: typeof Gauge;
  perm: Permission;
  /** número de pendências mostrado ao lado do item */
  badge?: (b: DashboardBadges) => number;
}

/** Menu em linguagem do dia a dia, na ordem em que o empregador usa. "Mais opções" fica recolhido. */
const GROUPS: Array<{ title: string; items: NavItem[]; advanced?: boolean }> = [
  {
    title: 'Dia a dia',
    items: [
      { href: '/painel', label: 'Início', icon: Gauge, perm: 'employer.read' },
      { href: '/painel/funcionarios', label: 'Funcionários', icon: Users, perm: 'employees.read' },
      { href: '/painel/marcacoes', label: 'Marcações', icon: FileClock, perm: 'punches.read' },
      { href: '/painel/revisar', label: 'Para revisar', icon: ListChecks, perm: 'punches.read', badge: (b) => b.pendingCorrections + b.openAlerts },
    ],
  },
  {
    title: 'Fim do mês',
    items: [
      { href: '/painel/fechamento', label: 'Folha do mês', icon: ClipboardCheck, perm: 'timesheets.read' },
      { href: '/painel/espelho', label: 'Espelho por funcionário', icon: FileText, perm: 'timesheets.read' },
    ],
  },
  {
    title: 'Configurar',
    items: [
      { href: '/painel/locais', label: 'Casa e locais', icon: MapPin, perm: 'employees.read' },
      { href: '/painel/escalas', label: 'Horários e feriados', icon: CalendarDays, perm: 'employees.read' },
      { href: '/painel/configuracoes', label: 'Usuários e dados', icon: Settings, perm: 'settings.manage' },
    ],
  },
  {
    title: 'Mais opções',
    advanced: true,
    items: [
      { href: '/painel/auditoria', label: 'Auditoria', icon: FileSearch, perm: 'audit.read' },
      { href: '/painel/incidentes', label: 'Incidentes', icon: Siren, perm: 'incidents.manage', badge: (b) => b.openIncidents },
      { href: '/painel/privacidade', label: 'Privacidade (LGPD)', icon: ShieldCheck, perm: 'privacy.manage', badge: (b) => b.overdueDataRequests },
    ],
  },
];

const FONT_KEY = 'pn_letra_maior';

/** Letra maior para quem enxerga pouco: aumenta toda a escala tipográfica do painel e fica guardada no aparelho. */
function useBigText() {
  const [big, setBig] = useState(false);
  useEffect(() => {
    let on = false;
    try {
      on = localStorage.getItem(FONT_KEY) === '1';
    } catch {
      on = false;
    }
    setBig(on);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('letra-maior', big);
    return () => document.documentElement.classList.remove('letra-maior');
  }, [big]);
  const toggle = () =>
    setBig((v) => {
      try {
        localStorage.setItem(FONT_KEY, v ? '0' : '1');
      } catch {
        // sem armazenamento: vale só nesta visita
      }
      return !v;
    });
  return { big, toggle };
}

/** Barra superior: empregador, data e hora oficial, sino de pendências e menu do usuário. */
function TopBar({ onMenu, collapsed, badges }: { onMenu: () => void; collapsed: boolean; badges: DashboardBadges | null }) {
  const { me } = useSession();
  const router = useRouter();
  const path = usePathname();
  const tz = me.timezone;
  const time = useResource<TimeView>('/time');
  const { now } = useServerClock(time.data?.serverTime ?? null);
  const text = useBigText();
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setBellOpen(false);
    setUserOpen(false);
  }, [path]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setBellOpen(false);
        setUserOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const b = badges;
  const items = b
    ? [
        { n: b.pendingCorrections, text: b.pendingCorrections === 1 ? 'pedido de ajuste para decidir' : 'pedidos de ajuste para decidir', href: '/painel/revisar?aba=ajustes' },
        { n: b.openAlerts, text: b.openAlerts === 1 ? 'ocorrência para revisar' : 'ocorrências para revisar', href: '/painel/revisar?aba=ocorrencias' },
        { n: b.overdueDataRequests, text: b.overdueDataRequests === 1 ? 'pedido LGPD vencido' : 'pedidos LGPD vencidos', href: '/painel/privacidade' },
        { n: b.openIncidents, text: b.openIncidents === 1 ? 'incidente em aberto' : 'incidentes em aberto', href: '/painel/incidentes' },
      ].filter((i) => i.n > 0)
    : [];
  const total = items.reduce((a, i) => a + i.n, 0);
  const clock = time.data?.clockStatus;
  const longDate = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const initials = me.user.name.replace(/\(.*?\)/g, '').trim().split(/\s+/).map((p) => p[0] ?? '').slice(0, 2).join('').toUpperCase();

  return (
    <header ref={ref} className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-card px-4 py-2 shadow-barra print:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] text-marca hover:bg-realce" onClick={onMenu} aria-label={collapsed ? 'Expandir menu' : 'Recolher ou abrir menu'} title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
          <span className="lg:hidden">
            <Menu size={22} aria-hidden />
          </span>
          <span className="hidden lg:block">{collapsed ? <PanelLeftOpen size={22} aria-hidden /> : <PanelLeftClose size={22} aria-hidden />}</span>
        </button>
        <div className="min-w-0">
          <p className="truncate font-bold text-marca">{me.active?.employerName}</p>
          <p className="truncate text-xs text-texto-3 first-letter:uppercase">{longDate}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-3">
        <div className="hidden border-r border-borda pr-4 text-right sm:block" title={clock === 'synced' ? 'Relógio do servidor conferido com a hora oficial (NTP.br)' : 'Sincronização do relógio em verificação'}>
          <p className="text-lg leading-none font-bold text-marca tabular">{hora(now.toISOString(), tz, true)}</p>
          <p className={`mt-0.5 text-xs ${clock === 'synced' ? 'text-texto-3' : 'text-atencao'}`}>{clock === 'synced' ? 'Hora oficial sincronizada' : clock === 'drift' ? 'Relógio com defasagem' : 'Relógio em verificação'}</p>
        </div>

        <button
          onClick={text.toggle}
          aria-pressed={text.big}
          title={text.big ? 'Voltar ao tamanho normal da letra' : 'Aumentar a letra'}
          className={`flex h-10 items-center gap-1.5 rounded-[8px] px-2.5 font-bold ${text.big ? 'bg-marca text-white hover:bg-marca-2' : 'text-marca hover:bg-realce'}`}
        >
          <ALargeSmall size={22} aria-hidden />
          <span className="hidden text-sm xl:inline">{text.big ? 'Letra normal' : 'Letra maior'}</span>
        </button>

        <div className="relative">
          <button
            onClick={() => {
              setBellOpen(!bellOpen);
              setUserOpen(false);
            }}
            className="relative flex h-10 w-10 items-center justify-center rounded-[8px] text-marca hover:bg-realce"
            aria-label={total ? `${total} pendências` : 'Pendências'}
            aria-expanded={bellOpen}
          >
            <Bell size={22} aria-hidden />
            {total ? (
              <span className="absolute top-1 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-[6px] bg-marcador px-1 text-[11px] font-bold text-marca tabular" aria-hidden>
                {total > 99 ? '99+' : total}
              </span>
            ) : null}
          </button>
          {bellOpen ? (
            <div className="absolute right-0 mt-2 w-[min(340px,calc(100vw-24px))] rounded-[8px] border border-borda bg-card p-2 shadow-flutuante">
              <p className="px-2 py-1 text-xs font-bold tracking-wide text-texto-3 uppercase">Pendências</p>
              {items.length ? (
                <ul>
                  {items.map((i) => (
                    <li key={i.href}>
                      <Link href={i.href} className="flex items-center gap-3 rounded-[8px] px-2 py-2.5 hover:bg-realce">
                        <span className="min-w-8 text-right text-lg font-bold text-marca tabular">{i.n}</span>
                        <span className="text-sm text-texto">{i.text}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-3 text-sm text-texto-3">Nada pendente. Tudo em dia.</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            onClick={() => {
              setUserOpen(!userOpen);
              setBellOpen(false);
            }}
            className="flex items-center gap-2 rounded-[8px] px-2 py-1 hover:bg-realce"
            aria-expanded={userOpen}
            aria-label="Menu do usuário"
          >
            <span className="flex size-9 items-center justify-center rounded-[8px] bg-marca-suave text-sm font-bold text-marca" aria-hidden>
              {initials}
            </span>
            <span className="hidden text-left md:block">
              <span className="block text-sm font-semibold">{me.user.name}</span>
              <span className="block text-xs text-texto-3">{me.active ? ROLE_LABEL[me.active.role] : ''}</span>
            </span>
            <ChevronDown size={16} className="text-texto-3" aria-hidden />
          </button>
          {userOpen ? (
            <div className="absolute right-0 mt-2 w-60 rounded-[8px] border border-borda bg-card p-1 shadow-flutuante">
              <Link href="/painel/conta" className="flex items-center gap-2 rounded-[8px] px-3 py-2.5 text-sm hover:bg-realce">
                <User size={18} className="text-marca" aria-hidden /> Minha conta e senha
              </Link>
              <button
                onClick={async () => {
                  await api.post('/auth/logout').catch(() => undefined);
                  router.replace('/entrar');
                }}
                className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left text-sm text-perigo hover:bg-perigo-suave"
              >
                <LogOut size={18} aria-hidden /> Sair
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

const COLLAPSE_KEY = 'pn_menu_recolhido';

function Shell({ children }: { children: ReactNode }) {
  const { me, can } = useSession();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const badges = useResource<DashboardBadges>(`/dashboard/badges?_=${encodeURIComponent(path)}`);
  // o conteúdo rola dentro do <main>: ao trocar de tela, volta ao topo (o Next só faz isso com a janela)
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [path]);
  const inAdvanced = GROUPS.some((g) => g.advanced && g.items.some((i) => path.startsWith(i.href)));
  const [moreOpen, setMoreOpen] = useState(inAdvanced);
  useEffect(() => {
    if (inAdvanced) setMoreOpen(true);
  }, [inAdvanced]);
  // etiqueta do item no menu recolhido (posição fixa: o menu tem rolagem própria e cortaria a etiqueta)
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);
  const showTip = (label: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 10 });
  };
  useEffect(() => {
    setTip(null);
  }, [path, collapsed]);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      setCollapsed(false);
    }
  }, []);
  const toggle = () => {
    // celular/tablet: abre a gaveta; computador: recolhe ou expande o menu
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setCollapsed((c) => {
        try {
          localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
        } catch {
          // sem armazenamento: vale só nesta visita
        }
        return !c;
      });
    } else setOpen(true);
  };

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
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => can(n.perm)) })).filter((g) => g.items.length);
  const link = ({ href, label, icon: Icon, badge }: NavItem, mini: boolean) => {
    const active = href === '/painel' ? path === '/painel' : path.startsWith(href);
    const n = badge && badges.data ? badge(badges.data) : 0;
    const tipText = n ? `${label} · ${n}` : label;
    return (
      <li key={href}>
        <Link
          href={href}
          onClick={() => setOpen(false)}
          aria-current={active ? 'page' : undefined}
          onMouseEnter={mini ? (e) => showTip(tipText, e.currentTarget) : undefined}
          onMouseLeave={mini ? () => setTip(null) : undefined}
          onFocus={mini ? (e) => showTip(tipText, e.currentTarget) : undefined}
          onBlur={mini ? () => setTip(null) : undefined}
          className={`relative flex items-center rounded-[8px] text-sm font-semibold ${mini ? 'h-11 justify-center' : 'gap-3 px-3 py-2.5'} ${active ? 'bg-marca-3 text-white' : 'text-white/80 hover:bg-marca-2 hover:text-white'}`}
        >
          <Icon size={mini ? 21 : 19} className="shrink-0 text-marcador" aria-hidden />
          <span className={mini ? 'sr-only' : 'flex-1'}>{label}</span>
          {n ? (
            <span className={`rounded-[6px] bg-marcador font-bold text-marca tabular ${mini ? 'absolute top-0.5 right-0.5 px-1 text-[11px]' : 'px-1.5 text-xs'}`}>
              <span className="sr-only">, pendências: </span>
              {n > 99 ? '99+' : n}
            </span>
          ) : null}
        </Link>
      </li>
    );
  };
  const nav = (mini: boolean) => (
    <nav aria-label="Menu principal" className="flex h-full flex-col">
      <div className={`flex shrink-0 items-center ${mini ? 'justify-center px-2 py-5' : 'px-5 py-6'}`}>
        <Link href="/painel" aria-label="PontoNexo · Início">
          {mini ? (
            <img src="/brand/pontonexo-simbolo-fundo-escuro.svg" alt="PontoNexo" className="h-11 w-auto" />
          ) : (
            <img src="/brand/pontonexo-logo-horizontal-fundo-escuro.svg" alt="PontoNexo" className="h-14 w-auto" />
          )}
        </Link>
      </div>
      {/* só a lista rola; logo e rodapé ficam parados */}
      <div className={`menu-rolagem min-h-0 flex-1 space-y-4 overflow-y-auto pb-3 ${mini ? 'px-2' : 'px-3'}`} onScroll={() => setTip(null)}>
        {groups.map((g) => {
          const shown = !g.advanced || mini || moreOpen;
          return (
            <div key={g.title}>
              {mini ? (
                <div className="mx-2 mb-2 border-t border-white/15" aria-hidden />
              ) : g.advanced ? (
                <button
                  onClick={() => setMoreOpen(!moreOpen)}
                  aria-expanded={moreOpen}
                  className="flex w-full items-center justify-between rounded-[8px] px-3 py-1.5 text-xs font-bold tracking-wide text-white/60 uppercase hover:text-white"
                >
                  {g.title}
                  <ChevronRight size={16} className={`transition-transform ${moreOpen ? 'rotate-90' : ''}`} aria-hidden />
                </button>
              ) : (
                <p className="px-3 pb-1.5 text-xs font-bold tracking-wide text-white/60 uppercase">{g.title}</p>
              )}
              {shown ? <ul className="space-y-1">{g.items.map((i) => link(i, mini))}</ul> : null}
            </div>
          );
        })}
      </div>
      {mini ? null : <p className="shrink-0 border-t border-white/10 px-5 py-4 text-xs text-white/60">Registro conforme LC 150/2015, art. 12. Sem certificação REP-P.</p>}
    </nav>
  );
  return (
    <div className={`h-dvh overflow-hidden print:block print:h-auto print:overflow-visible ${collapsed ? 'lg:grid lg:grid-cols-[76px_1fr]' : 'lg:grid lg:grid-cols-[264px_1fr]'}`}>
      <aside className="sticky top-0 hidden h-screen overflow-hidden bg-marca lg:block print:hidden">
        {nav(collapsed)}
      </aside>
      {collapsed && tip ? (
        <div role="tooltip" className="pointer-events-none fixed z-50 hidden -translate-y-1/2 lg:block" style={{ top: tip.top, left: tip.left }}>
          <span className="absolute top-1/2 -left-1 size-2.5 -translate-y-1/2 rotate-45 bg-card" aria-hidden />
          <span className="relative block rounded-[8px] bg-card px-3 py-2 text-sm font-bold whitespace-nowrap text-marca shadow-flutuante">{tip.label}</span>
        </div>
      ) : null}
      {open ? (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-marca/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] overflow-hidden bg-marca">
            <button className="absolute top-3 right-3 rounded-[8px] p-1 text-white" onClick={() => setOpen(false)} aria-label="Fechar menu">
              <X size={20} />
            </button>
            {nav(false)}
          </aside>
        </div>
      ) : null}
      {/* a barra superior fica fixa; só o conteúdo rola, com a barra de rolagem abaixo dela */}
      <div className="flex h-dvh min-w-0 flex-col print:block print:h-auto">
        <TopBar onMenu={toggle} collapsed={collapsed} badges={badges.data} />
        <main ref={mainRef} className="conteudo-rolagem min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6 print:overflow-visible print:p-0">
          {children}
        </main>
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
