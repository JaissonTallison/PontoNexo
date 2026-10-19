'use client';
import type { MeView } from '@pontonexo/shared';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loading } from '@/components/ui';
import { api } from '@/lib/api';

export default function Inicio() {
  const router = useRouter();
  useEffect(() => {
    api
      .get<MeView>('/auth/me')
      .then((me) => router.replace(me.active?.role === 'employee' ? '/app' : '/painel'))
      .catch(() => router.replace('/entrar'));
  }, [router]);
  return <Loading />;
}
