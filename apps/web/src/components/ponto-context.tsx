'use client';
import type { PunchContextView } from '@pontonexo/shared';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useResource, type Resource } from '@/lib/hooks';

const Ctx = createContext<Resource<PunchContextView> | null>(null);

/** Um único carregamento do contexto do funcionário, compartilhado pelo topo (sino) e pela tela de ponto. */
export function PunchContextProvider({ children }: { children: ReactNode }) {
  const res = useResource<PunchContextView>('/me/punch-context');
  const path = usePathname();
  const first = useRef(true);
  const { reload } = res;
  // ao trocar de tela, atualiza (sem buscar em dobro na primeira renderização)
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    reload();
  }, [path, reload]);
  return <Ctx.Provider value={res}>{children}</Ctx.Provider>;
}

export function usePunchContext(): Resource<PunchContextView> {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePunchContext fora do PunchContextProvider');
  return v;
}
