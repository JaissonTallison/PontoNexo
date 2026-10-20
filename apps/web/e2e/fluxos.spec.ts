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
    await expect(page.getByRole('heading', { name: 'Início', exact: true })).toBeVisible();
    await expect(page.getByText(/pedidos? de ajuste/).first()).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: 'Marcações' }).click();
    await expect(page.getByRole('cell', { name: /Maria Aparecida/ }).first()).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: 'Espelho por funcionário' }).click();
    // a lista de funcionários chega depois da página; repete a escolha até o espelho carregar
    await expect(async () => {
      await page.getByLabel('Funcionário').selectOption({ label: 'Maria Aparecida Souza (fictícia)' });
      await expect(page.getByRole('heading', { name: 'Dia a dia' })).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
    await page.getByRole('navigation').getByRole('link', { name: /Para revisar/ }).click();
    await expect(page.getByText(/Incluir saída/).first()).toBeVisible();
    await page.getByRole('tab', { name: /Ocorrências nas marcações/ }).click();
    await expect(page).toHaveURL(/aba=ocorrencias/);
  });

  test('folha do mês, letra maior e menu recolhível', async ({ page }) => {
    await page.goto('/painel/fechamento');
    await expect(page.getByRole('heading', { name: 'Folha do mês' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Exportar para o contador/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Maria Aparecida/ })).toBeVisible();

    const base = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    await page.getByRole('button', { name: /Letra maior/ }).click();
    const big = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    expect(big).toBeGreaterThan(base);
    await page.getByRole('button', { name: /Letra normal/ }).click();

    // endereços antigos continuam funcionando
    await page.goto('/painel/correcoes');
    await expect(page).toHaveURL(/painel\/revisar\?aba=ajustes/);
  });

  test('cadastro guiado de funcionário', async ({ page }) => {
    await page.goto('/painel/funcionarios/novo');
    await page.getByLabel('Nome completo').fill(`Teste Assistente ${Date.now() % 100000}`);
    // CPF fictício válido, gerado a cada execução para não repetir
    const cpf = (() => {
      const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
      const dv = (arr: number[]) => {
        const s = arr.reduce((a, d, i) => a + d * (arr.length + 1 - i), 0) % 11;
        return s < 2 ? 0 : 11 - s;
      };
      n.push(dv(n));
      n.push(dv(n));
      return n.join('');
    })();
    await page.getByLabel('CPF').fill(cpf);
    await expect(page.getByLabel('CPF')).toHaveValue(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
    await page.getByRole('button', { name: 'Salvar e continuar' }).click();
    await expect(page.getByRole('heading', { name: 'Contrato de trabalho' })).toBeVisible();
    await page.getByRole('button', { name: 'Salvar e continuar' }).click();
    await expect(page.getByRole('heading', { name: 'Horário de trabalho' })).toBeVisible();
    await page.getByRole('button', { name: 'Pular por agora' }).click();
    await expect(page.getByRole('heading', { name: 'Onde pode marcar o ponto' })).toBeVisible();
    await page.getByRole('button', { name: 'Pular por agora' }).click();
    await expect(page.getByText(/Ficou para depois: horário, local/)).toBeVisible();
    await page.getByRole('button', { name: 'Concluir cadastro' }).click();
    await expect(page).toHaveURL(/painel\/funcionarios\/[0-9a-f-]+\?novo=1/);
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
