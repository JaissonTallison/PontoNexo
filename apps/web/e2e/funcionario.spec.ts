import { expect, test, type Page } from '@playwright/test';

const SENHA = 'PontoNexo2026';

/** Primeiro acesso após nova versão do aviso de privacidade: confirma a ciência. */
async function abrirApp(page: Page) {
  await page.goto('/app');
  const ciente = page.getByRole('button', { name: 'Li e estou ciente' });
  await expect(ciente.or(page.getByRole('heading', { name: 'Hoje' }))).toBeVisible({ timeout: 15_000 });
  if (await ciente.isVisible()) await ciente.click();
  await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible({ timeout: 15_000 });
}

test.beforeEach(({}, info) => test.skip(info.project.name !== 'celular'));

test('login é só por e-mail e senha', async ({ page }) => {
  await page.goto('/entrar');
  await expect(page.getByLabel('E-mail')).toBeVisible();
  await expect(page.getByLabel('Senha')).toBeVisible();
  await expect(page.getByText(/Receber código|código por SMS|digital ou rosto/i)).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test.describe('com sessão da Maria', () => {
test.use({ storageState: 'e2e/.auth/maria.json' });

test('“Esqueci de marcar” envia o pedido em 3 passos', async ({ page }) => {
  await abrirApp(page);
  await page.getByRole('link', { name: 'Esqueci' }).click();
  await page.getByRole('button', { name: /Esqueci de marcar/ }).click();
  await expect(page.getByText('Passo 2 de 3')).toBeVisible();
  await page.getByLabel('Qual dia?').fill('2026-10-08');
  await page.getByRole('button', { name: 'Saída', exact: true }).click();
  await page.getByLabel('Que horas foi?').fill('17:05');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Passo 3 de 3')).toBeVisible();
  await expect(page.getByText(/Saída no dia 08\/10\/2026 às 17:05/)).toBeVisible();
  await page.getByRole('button', { name: 'O celular estava sem bateria' }).click();
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await expect(page.getByText('Pedido enviado')).toBeVisible();
});

test('Perfil leva a Este celular e valida a troca de senha', async ({ page }) => {
  await abrirApp(page);
  await page.getByRole('link', { name: 'Perfil' }).click();
  await page.getByRole('link', { name: /Este celular/ }).click();
  await expect(page.getByRole('heading', { name: 'Lembretes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /digital ou rosto/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Instalar o app' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.getByRole('link', { name: /Trocar senha/ }).click();
  await page.getByLabel('Senha atual').fill(SENHA);
  await page.getByLabel('Senha nova', { exact: true }).fill('NovaSenha123');
  await page.getByLabel('Repita a senha nova').fill('OutraSenha456');
  await page.getByRole('button', { name: 'Salvar senha nova' }).click();
  await expect(page.getByText('As duas senhas novas não são iguais.')).toBeVisible();
});
});

test.describe('com sessão do José', () => {
test.use({ storageState: 'e2e/.auth/jose.json' });

test('sem internet a marcação fica guardada e é enviada quando a conexão volta', async ({ page, context }) => {
  // outro funcionário: a regra de 30 s entre marcações não pode colidir com o teste de marcação da Maria
  await abrirApp(page);
  await expect(page.getByRole('button', { name: /registrar agora/ }).first()).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: /registrar agora/ }).first().click();
  await page.getByRole('button', { name: 'Sim, registrar' }).click();
  await expect(page.getByText(/Ainda NÃO está registrado/)).toBeVisible();
  await expect(page.getByText(/esperando internet/)).toBeVisible();
  await expect(page.getByText('Sem internet', { exact: true })).toBeVisible();
  await context.setOffline(false);
  // ao reconectar a fila é processada: some de "esperando internet" (registrada ou, se recusada, aparece como não aceita)
  await expect(page.getByText(/esperando internet/)).toBeHidden({ timeout: 15_000 });
});
});
