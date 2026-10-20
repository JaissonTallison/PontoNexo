'use client';
import { useEffect } from 'react';

/**
 * Produção: service worker completo (casca offline + notificações).
 * Desenvolvimento: registra com ?dev=1, que só cuida de notificações e não guarda arquivos em cache
 * (os arquivos do modo dev mudam com o mesmo nome e um cache velho quebraria a página).
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const dev = process.env.NODE_ENV !== 'production';
    if (dev && 'caches' in window) void caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('pontonexo')).map((k) => caches.delete(k))));
    navigator.serviceWorker.register(dev ? '/sw.js?dev=1' : '/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
