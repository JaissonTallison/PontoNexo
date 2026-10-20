'use client';
import { ChevronRight, ShieldCheck, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { CASOS } from '@/components/casos-pedido';
import { BackBar } from '@/components/ui';

function Opcao({ href, icon: Icon, title, hint }: { href: string; icon: LucideIcon; title: string; hint: string }) {
  return (
    <Link href={href} className="cartao-3d flex items-center gap-3 rounded-[8px] bg-card p-4 active:bg-realce">
      <Icon size={26} className="shrink-0 text-marca" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-md font-bold text-texto">{title}</span>
        <span className="block text-sm text-texto-3">{hint}</span>
      </span>
      <ChevronRight size={20} className="shrink-0 text-borda-forte" aria-hidden />
    </Link>
  );
}

/** Todos os tipos de pedido num lugar só: ajustes no ponto (vão para o passo a passo do "Esqueci") e pedidos sobre os próprios dados. */
export default function NovoPedido() {
  return (
    <div>
      <BackBar title="Novo pedido" fallback="/app/correcoes" />
      <p className="mb-3 text-texto-2">O que você precisa?</p>

      <h2 className="mb-2 text-sm font-bold tracking-wide text-texto-3 uppercase">Ajuste no ponto</h2>
      <div className="space-y-2.5">
        {CASOS.map((c) => (
          <Opcao key={c.id} href={`/app/corrigir?caso=${c.id}`} icon={c.icon} title={c.title} hint={c.hint} />
        ))}
      </div>

      <h2 className="mt-6 mb-2 text-sm font-bold tracking-wide text-texto-3 uppercase">Seus dados</h2>
      <Opcao href="/app/privacidade" icon={ShieldCheck} title="Pedido sobre meus dados" hint="Ver, corrigir ou receber uma cópia dos seus dados" />
    </div>
  );
}
