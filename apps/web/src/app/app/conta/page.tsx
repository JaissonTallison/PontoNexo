'use client';
import { Building2, ChevronRight, CircleHelp, KeyRound, LogOut, ShieldCheck, Smartphone, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { api } from '@/lib/api';

function initials(name: string) {
  const parts = name.replace(/\(.*?\)/g, '').trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''}`.toUpperCase();
}

function Option({ href, icon: Icon, title, hint }: { href: string; icon: LucideIcon; title: string; hint: string }) {
  return (
    <li>
      <Link href={href} className="flex min-h-[64px] items-center gap-3 px-4 py-3 active:bg-realce">
        <Icon size={24} className="shrink-0 text-marca" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-md font-semibold text-texto">{title}</span>
          <span className="block text-sm text-texto-3">{hint}</span>
        </span>
        <ChevronRight size={20} className="shrink-0 text-borda-forte" aria-hidden />
      </Link>
    </li>
  );
}

export default function Perfil() {
  const { me } = useSession();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="space-y-4">
      <section className="flex items-center gap-4 rounded-[8px] bg-marca p-5 text-white shadow-card">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-[8px] bg-marcador text-xl font-bold text-marca" aria-hidden>
          {initials(me.user.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-lg font-bold">{me.user.name}</span>
          <span className="block truncate text-sm text-white/80">{me.user.email}</span>
          <span className="block truncate text-sm text-white/80">{me.active?.employerName}</span>
        </span>
      </section>

      <ul className="divide-y divide-borda overflow-hidden rounded-[8px] bg-card shadow-card">
        <Option href="/app/conta/celular" icon={Smartphone} title="Este celular" hint="Lembretes e instalar o app" />
        <Option href="/app/conta/senha" icon={KeyRound} title="Trocar senha" hint="Crie uma senha nova para entrar" />
        <Option href="/app/privacidade" icon={ShieldCheck} title="Meus dados e privacidade" hint="Baixar meus dados e fazer pedidos" />
        <Option href="/app/ajuda" icon={CircleHelp} title="Como usar o app" hint="Passo a passo simples" />
      </ul>

      {me.memberships.length > 1 ? (
        <section>
          <h2 className="mb-1 px-1 text-xs font-bold tracking-wide text-texto-3 uppercase">Onde eu trabalho</h2>
          <ul className="divide-y divide-borda overflow-hidden rounded-[8px] bg-card shadow-card">
            {me.memberships.map((m) => {
              const current = m.employerId === me.active?.employerId;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={current}
                    onClick={async () => {
                      await api.post('/auth/switch-employer', { employerId: m.employerId });
                      window.location.href = m.role === 'employee' ? '/app' : '/painel';
                    }}
                    className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left active:bg-realce"
                  >
                    <Building2 size={22} className="shrink-0 text-marca" aria-hidden />
                    <span className="flex-1 font-semibold">{m.employerName}</span>
                    {current ? <span className="text-sm font-semibold text-acao">Atual</span> : <span className="text-sm text-texto-3">Trocar</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <button
        type="button"
        disabled={leaving}
        onClick={async () => {
          setLeaving(true);
          await api.post('/auth/logout').catch(() => undefined);
          router.replace('/entrar');
        }}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-[8px] bg-perigo text-md font-semibold text-white shadow-card active:brightness-95"
      >
        <LogOut size={20} aria-hidden />
        {leaving ? 'Saindo…' : 'Sair do app'}
      </button>
    </div>
  );
}
