'use client';
import type { PunchCreateInput } from '@pontonexo/shared';

/**
 * Fila local de tentativas de marcação feitas sem conexão (IndexedDB).
 * Uma tentativa NÃO é marcação registrada: só passa a valer quando o servidor confirmar.
 * O envio usa o mesmo clientRequestId, então reenviar não duplica.
 */
const DB = 'pontonexo';
const STORE = 'tentativas';

export interface PendingAttempt {
  input: PunchCreateInput;
  createdAt: string;
  lastError: string | null;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'input.clientRequestId' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    t.oncomplete = () => db.close();
  });
}

export const offlineQueue = {
  add: (a: PendingAttempt) => tx('readwrite', (s) => s.put(a)),
  list: () => tx<PendingAttempt[]>('readonly', (s) => s.getAll() as IDBRequest<PendingAttempt[]>),
  remove: (id: string) => tx('readwrite', (s) => s.delete(id)),
};
