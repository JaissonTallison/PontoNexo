import type { ApiErrorBody } from '@pontonexo/shared';

/** Erro da API com código estável e campos para o formulário. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function csrf(): string {
  const m = document.cookie.match(/(?:^|; )pn_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : '';
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'x-csrf-token': csrf() } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Sem conexão com o servidor. Verifique a internet e tente de novo.');
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  const data: unknown = type.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const e = (typeof data === 'object' && data ? data : {}) as Partial<ApiErrorBody> & Record<string, unknown>;
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      window.location.href = `/entrar?voltar=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(res.status, e.code ?? 'HTTP', e.message ?? `Erro ${res.status}`, e.fields ?? {}, e);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => call<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => call<T>('PUT', path, body),
  del: <T>(path: string) => call<T>('DELETE', path),
};

export const errorMessage = (e: unknown) => (e instanceof ApiError ? e.message : 'Não foi possível concluir. Tente de novo.');

/** Monta query string ignorando vazios. */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
}
