'use client';
import { can, type MeView, type Permission } from '@pontonexo/shared';
import { createContext, useContext, type ReactNode } from 'react';
import { useResource } from '@/lib/hooks';
import { ErrorState, Loading } from './ui';

interface SessionValue {
  me: MeView;
  can: (p: Permission) => boolean;
  reload: () => void;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, error, loading, reload } = useResource<MeView>('/auth/me');
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Não foi possível carregar a sessão.'} onRetry={reload} />;
  const value: SessionValue = {
    me: data,
    can: (p) => (data.active ? can(data.active.role, p) : false),
    reload,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession fora do SessionProvider');
  return v;
}
