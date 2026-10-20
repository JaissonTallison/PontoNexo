'use client';
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api } from './api';

// ───── Notificações ─────

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Pede permissão, inscreve este aparelho e manda uma notificação de teste. */
export async function enablePush(): Promise<'ok' | 'denied' | 'unsupported' | 'off'> {
  if (!pushSupported()) return 'unsupported';
  const { enabled, publicKey } = await api.get<{ enabled: boolean; publicKey: string }>('/me/push/public-key');
  if (!enabled) return 'off';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api.post('/me/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
  await api.post('/me/push/test').catch(() => undefined);
  return 'ok';
}

export async function disablePush() {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await api.post('/me/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe();
}

// ───── Biometria (passkey) ─────

export const passkeySupported = () => typeof window !== 'undefined' && browserSupportsWebAuthn();

export async function registerPasskey(deviceLabel: string) {
  const { challengeId, options } = await api.post<{ challengeId: string; options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>('/auth/passkeys/register/options');
  const response = await startRegistration({ optionsJSON: options });
  await api.post('/auth/passkeys/register', { challengeId, response, deviceLabel });
}

export async function loginWithPasskey() {
  const { challengeId, options } = await api.post<{ challengeId: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>('/auth/passkeys/login/options');
  const response = await startAuthentication({ optionsJSON: options });
  await api.post('/auth/passkeys/login', { challengeId, response });
}

// ───── Instalação (PWA) ─────

export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
