import { expect, test, type Page } from '@playwright/test';

/** Religa o guia de primeiro uso (os outros testes rodam com ele desligado). */
async function guiaLigado(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('pn_guia_off');
    for (const k of Object.keys(localStorage)) if (k.startsWith('pn_guia_')) localStorage.removeItem(k);
  });
}

test.describe('guia do painel', () => {
  test.use({ storageState: 'e2e/.auth/titular.json' });
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop'));

  test('boas-vindas, dicas uma por vez e Ajuda', async ({ page }) => {
    await guiaLigado(page);
    await page.goto('/painel');
    await expect(page.getByRole('heading', { name: 'Bem-vindo ao PontoNexo' })).toBeVisible();
    await page.getByRole('button', { name: 'Começar' }).click();
    for (const titulo of ['O menu', 'Mostrar ou esconder o menu', 'Letra maior', 'Pendências', 'Sua conta e a Ajuda', 'Início']) {
      const dica = page.getByRole('dialog', { name: titulo });
      await expect(dica).toBeVisible();
      await dica.getByRole('button', { name: 'Entendi' }).click();
    }
    await expect(page.getByRole('button', { name: 'Entendi' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Menu do usuário' }).click();
    await page.getByRole('link', { name: 'Ajuda e explicações' }).click();
    await expect(page.getByRole('heading', { name: 'Ajuda e explicações' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Folha do mês' })).toBeVisible();
  });
});

test.describe('guia do app', () => {
  test.use({ storageState: 'e2e/.auth/maria.json' });
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'celular'));

  test('boas-vindas e dicas da tela de ponto', async ({ page }) => {
    await guiaLigado(page);
    await page.goto('/app');
    const ciente = page.getByRole('button', { name: 'Li e estou ciente' });
    if (await ciente.isVisible({ timeout: 3000 }).catch(() => false)) await ciente.click();
    await expect(page.getByRole('heading', { name: /Este é o seu ponto/ })).toBeVisible();
    await page.getByRole('button', { name: 'Começar' }).click();
    for (const titulo of ['Hora certa', 'Marcar o ponto', 'Seu dia', 'Avisos', 'Barra de baixo']) {
      const dica = page.getByRole('dialog', { name: titulo });
      await expect(dica).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      await dica.getByRole('button', { name: 'Entendi' }).click();
    }
    await page.getByRole('link', { name: 'Registros' }).click();
    await expect(page.getByRole('dialog', { name: 'Registros' })).toBeVisible();
  });
});
