import { defineConfig, devices } from '@playwright/test';

// Pré-requisito: API em :5570 e web em :5571 (pnpm dev ou build + start) com o seed aplicado.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 45_000,
  workers: 1,
  // PW_CHROMIUM permite usar um Chromium já baixado (ex.: cache de outra versão do Playwright)
  use: { ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}), baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5571', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'], geolocation: { latitude: -23.561414, longitude: -46.655881, accuracy: 12 }, permissions: ['geolocation'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
  ],
});
