import { expect, test, type Page } from '@playwright/test';

/** Primeiro acesso após nova versão do aviso de privacidade: confirma a ciência. */
async function abrirApp(page: Page) {
  await page.goto('/app');
  const ciente = page.getByRole('button', { name: 'Li e estou ciente' });
  await expect(ciente.or(page.getByRole('heading', { name: 'Hoje' }))).toBeVisible({ timeout: 15_000 });
  if (await ciente.isVisible()) await ciente.click();
  await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible({ timeout: 15_000 });
}

test.describe('funcionária (celular)', () => {
  test.use({ storageState: 'e2e/.auth/maria.json' });
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'celular'));

  test('marca o ponto dentro do local e recebe comprovante', async ({ page }) => {
    await abrirApp(page);
    const marcar = async () => {
      await page.getByRole('button', { name: /registrar agora/ }).first().click();
      await expect(page.getByRole('dialog')).toContainText('Você está no local de trabalho');
      await page.getByRole('button', { name: 'Sim, registrar' }).click();
    };
    await marcar();
    // regra de 30 s entre marcações: se outro teste marcou há pouco, espera e tenta de novo
    const tooSoon = page.getByText(/há menos de 30 segundos/);
    if (await tooSoon.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.waitForTimeout(31_000);
      await marcar();
    }
    await expect(page.getByText(/registrad[ao] às/)).toBeVisible();
    await page.getByRole('link', { name: 'Ver comprovante', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Autenticidade' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('empregadora (desktop)', () => {
  test.use({ storageState: 'e2e/.auth/titular.json' });
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop'));

  test('vê pendências, marcações e espelho', async ({ page }) => {
    await page.goto('/painel');
    await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
    await expect(page.getByText(/pedidos? de correção/)).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: 'Marcações' }).click();
    await expect(page.getByRole('cell', { name: /Maria Aparecida/ }).first()).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: 'Espelho e fechamento' }).click();
    // a lista de funcionários chega depois da página; repete a escolha até o espelho carregar
    await expect(async () => {
      await page.getByLabel('Funcionário').selectOption({ label: 'Maria Aparecida Souza (fictícia)' });
      await expect(page.getByRole('heading', { name: 'Dia a dia' })).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
    await page.getByRole('navigation').getByRole('link', { name: 'Correções' }).click();
    await expect(page.getByText(/Incluir saída/).first()).toBeVisible();
  });
});

test.describe('separação de áreas', () => {
  test.use({ storageState: 'e2e/.auth/jose.json' });
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop'));

  test('funcionário não acessa o painel', async ({ page }) => {
    await page.goto('/painel/funcionarios');
    await expect(page.getByText('Este acesso é do app do funcionário')).toBeVisible();
  });
});
