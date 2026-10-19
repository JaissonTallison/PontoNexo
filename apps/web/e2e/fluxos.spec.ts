import { expect, test } from '@playwright/test';

const SENHA = 'PontoNexo2026';

async function entrar(page: import('@playwright/test').Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('funcionária marca entrada pelo celular e recebe comprovante', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular');
  await entrar(page, 'maria@pontonexo.local');
  await expect(page).toHaveURL(/\/app$/);
  const ciente = page.getByRole('button', { name: 'Li e estou ciente' });
  if (await ciente.isVisible().catch(() => false)) await ciente.click();
  const botao = page.getByRole('button', { name: /Registrar entrada|Iniciar intervalo|Encerrar intervalo|Registrar saída/ }).first();
  await botao.click();
  await expect(page.getByRole('dialog')).toContainText('Dentro do raio do local');
  await page.getByRole('button', { name: 'Confirmar registro' }).click();
  await expect(page.getByText(/registrada às/)).toBeVisible();
  await page.getByRole('link', { name: 'Ver comprovante' }).click();
  await expect(page.getByText('Comprovante de Registro de Ponto do Trabalhador')).toBeVisible();
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(scroll).toBeLessThanOrEqual(0);
});

test('empregadora vê pendências, marcações e espelho', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await entrar(page, 'titular@pontonexo.local');
  await expect(page).toHaveURL(/\/painel$/);
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect(page.getByText(/pedidos? de correção/)).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Marcações' }).click();
  await expect(page.getByRole('cell', { name: /Maria Aparecida/ }).first()).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Espelho e fechamento' }).click();
  await expect(page.getByLabel('Funcionário').locator('option', { hasText: 'Maria Aparecida' })).toHaveCount(1);
  await page.getByLabel('Funcionário').selectOption({ label: 'Maria Aparecida Souza (fictícia)' });
  await expect(page.getByText('Resumo').or(page.getByText('Dia a dia'))).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Correções' }).click();
  await expect(page.getByText(/Incluir saída/)).toBeVisible();
});

test('funcionário não acessa o painel', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await entrar(page, 'jose@pontonexo.local');
  await expect(page).toHaveURL(/\/app$/);
  await page.goto('/painel/funcionarios');
  await expect(page.getByText('Este acesso é do app do funcionário')).toBeVisible();
});
