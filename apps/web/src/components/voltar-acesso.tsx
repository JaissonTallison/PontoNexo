'use client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** "Voltar para entrar" nas telas de acesso que não são o próprio login. */
export function BackToLogin() {
  const path = usePathname();
  if (path === '/entrar') return null;
  return (
    <Link href="/entrar" className="cartao-3d mb-4 inline-flex h-11 items-center gap-2 rounded-[8px] bg-card px-4 font-semibold text-marca active:bg-realce">
      <ArrowLeft size={20} aria-hidden />
      Voltar
    </Link>
  );
}
