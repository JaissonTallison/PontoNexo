'use client';
import { useEffect } from 'react';

/**
 * Service worker só em produção (lá os arquivos de /_next/static têm hash no nome e podem ficar em cache).
 * Em desenvolvimento os arquivos mudam com o mesmo nome: remove qualquer service worker e cache antigos.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
      return;
    }
    void navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((r) => r.unregister())));
    if ('caches' in window) void caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('pontonexo')).map((k) => caches.delete(k))));
  }, []);
  return null;
}
