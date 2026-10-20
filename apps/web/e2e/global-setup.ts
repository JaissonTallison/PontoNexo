import { request, type FullConfig } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/** Faz login uma vez por usuário e salva a sessão (o login real tem limite de tentativas por minuto). */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:5571';
  mkdirSync('e2e/.auth', { recursive: true });
  for (const [file, email] of [
    ['maria', 'maria@pontonexo.local'],
    ['jose', 'jose@pontonexo.local'],
    ['titular', 'titular@pontonexo.local'],
  ] as const) {
    const ctx = await request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
    let res = await ctx.post('/api/auth/login', { data: { email, password: 'PontoNexo2026' } });
    // limite de 10 logins por minuto por endereço: se rodou outro teste há pouco, espera e repete
    if (res.status() === 429) {
      await new Promise((r) => setTimeout(r, 61_000));
      res = await ctx.post('/api/auth/login', { data: { email, password: 'PontoNexo2026' } });
    }
    if (!res.ok()) throw new Error(`login de ${email} falhou: ${res.status()} ${await res.text()}`);
    const path = `e2e/.auth/${file}.json`;
    await ctx.storageState({ path });
    await ctx.dispose();
    // guia de primeiro uso desligado nos testes gerais (o teste do guia religa)
    const state = JSON.parse(readFileSync(path, 'utf8')) as { cookies: unknown[]; origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }> };
    state.origins = [{ origin: new URL(baseURL).origin, localStorage: [{ name: 'pn_guia_off', value: '1' }] }];
    writeFileSync(path, JSON.stringify(state));
  }
}
