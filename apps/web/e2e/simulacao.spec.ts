import { devices, expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/*
 * Simulação de ponta a ponta com vários usuários, do jeito que o sistema é usado no dia a dia:
 * empregadora nova se cadastra, configura a casa, cadastra 3 funcionários pelo assistente,
 * cada um recebe o convite por e-mail (Mailpit), define a senha e marca o ponto no celular;
 * pedidos de ajuste, ocorrência fora do local, proposta do empregador, gestor convidado,
 * fechamento do mês com ciência, pedido LGPD, espelho, exportação e auditoria.
 *
 * Usa um empregador novo a cada execução (não mexe nos dados de demonstração).
 * Pré-requisitos: API + web (pnpm dev) e Mailpit (docker compose) rodando.
 */

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:5576';
const SENHA = 'Simulacao2026';
const CASA = { latitude: -23.561414, longitude: -46.655881 };
const LONGE = { latitude: -23.5874, longitude: -46.6576 }; // ~3 km da casa
const n = String(Date.now() % 1_000_000);

function cpf(): string {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (a: number[]) => {
    const s = a.reduce((t, x, i) => t + x * (a.length + 1 - i), 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  d.push(dv(d));
  d.push(dv(d));
  return d.join('');
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoje = new Date();
const inicioMesPassado = iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1));
/** dia útil anterior a hoje dentro do mês atual (para pedidos que não caem no mês que será fechado) */
function diaUtilAnterior(): string {
  for (let d = hoje.getDate() - 1; d >= 1; d--) {
    const x = new Date(hoje.getFullYear(), hoje.getMonth(), d);
    if (x.getDay() !== 0 && x.getDay() !== 6) return iso(x);
  }
  return iso(hoje);
}

/** Link do último e-mail enviado para o endereço (convite ou redefinição de senha). */
async function linkDoEmail(page: Page, to: string): Promise<string> {
  let link = '';
  await expect(async () => {
    const list = (await (await page.request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json()) as { messages: Array<{ ID: string }> };
    const id = list.messages[0]?.ID;
    expect(id).toBeTruthy();
    const msg = (await (await page.request.get(`${MAILPIT}/api/v1/message/${id}`)).json()) as { Text: string };
    link = /https?:\/\/\S+redefinir-senha\?\S+/.exec(msg.Text)?.[0] ?? '';
    expect(link).not.toBe('');
  }).toPass({ timeout: 20_000 });
  // o link aponta para WEB_ORIGIN; usa o endereço em que o teste está rodando
  const u = new URL(link);
  return `${u.pathname}${u.search}`;
}

/** Contexto com o guia de primeiro uso desligado (o guia tem teste próprio). */
async function novoContexto(browser: Browser, baseURL: string, celular: boolean): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    ...(celular ? devices['Pixel 7'] : { viewport: { width: 1366, height: 860 } }),
    baseURL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    ...(celular ? { geolocation: { ...CASA, accuracy: 12 }, permissions: ['geolocation'] } : {}),
  });
  await ctx.addInitScript(() => localStorage.setItem('pn_guia_off', '1'));
  return ctx;
}

/**
 * Login e senha têm limite de 10 tentativas por minuto por endereço. Aqui todos os usuários saem do
 * mesmo computador; se o limite for atingido, espera o minuto e repete (como faria uma pessoa).
 */
async function comLimite(page: Page, acao: () => Promise<void>) {
  await acao();
  const limite = page.getByText('Muitas tentativas em pouco tempo');
  if (await limite.isVisible({ timeout: 2500 }).catch(() => false)) {
    await page.waitForTimeout(61_000);
    await acao();
  }
}

async function definirSenhaEEntrar(page: Page, link: string, email: string) {
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Definir sua senha' })).toBeVisible();
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByLabel('Repita a senha').fill(SENHA);
  await comLimite(page, () => page.getByRole('button', { name: 'Salvar senha' }).click());
  await expect(page.getByText('Senha salva.')).toBeVisible();
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(SENHA);
  await comLimite(page, () => page.getByRole('button', { name: 'Entrar', exact: true }).click());
}

async function abrirApp(page: Page) {
  const ciente = page.getByRole('button', { name: 'Li e estou ciente' });
  await expect(ciente.or(page.getByRole('heading', { name: 'Hoje' }))).toBeVisible({ timeout: 20_000 });
  if (await ciente.isVisible()) await ciente.click();
  await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible({ timeout: 20_000 });
}

/** Toca no bloco aceso, confirma e, se pedir, escolhe o motivo. Respeita a regra de 30 s entre marcações. */
async function marcar(page: Page, motivo?: string) {
  const tentar = async () => {
    await page.getByRole('button', { name: /registrar agora/ }).first().click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByRole('button', { name: 'Sim, registrar' })).toBeVisible({ timeout: 20_000 });
    if (motivo) await dialogo.getByRole('button', { name: motivo }).click();
    await dialogo.getByRole('button', { name: 'Sim, registrar' }).click();
  };
  await tentar();
  const cedo = page.getByText(/há menos de 30 segundos/);
  if (await cedo.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.waitForTimeout(31_000);
    await tentar();
  }
  await expect(page.getByText(/registrad[ao] às/)).toBeVisible({ timeout: 20_000 });
}

interface Pessoa {
  nome: string;
  funcao: string;
  email: string;
  ctx?: BrowserContext;
  page?: Page;
}

test.describe('simulação do dia a dia com vários usuários', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop'));
  test.setTimeout(10 * 60_000);
  test.use({ actionTimeout: 20_000 });

  test('empregadora, gestor e três funcionários de ponta a ponta', async ({ browser, baseURL }) => {
    const base = baseURL ?? 'http://localhost:5571';
    const dona = { nome: `Helena Simulação ${n}`, email: `sim-${n}@pontonexo.local`, casa: `Residência Simulação ${n}` };
    const gestor = { nome: `Paulo Gestor ${n}`, email: `sim-gestor-${n}@pontonexo.local` };
    const equipe: Pessoa[] = [
      { nome: `Ana Cozinheira ${n}`, funcao: 'Cozinheira', email: `sim-ana-${n}@pontonexo.local` },
      { nome: `Bruno Caseiro ${n}`, funcao: 'Caseiro', email: `sim-bruno-${n}@pontonexo.local` },
      { nome: `Carla Babá ${n}`, funcao: 'Babá', email: `sim-carla-${n}@pontonexo.local` },
    ];
    const [ana, bruno, carla] = equipe as [Pessoa, Pessoa, Pessoa];

    const adminCtx = await novoContexto(browser, base, false);
    const admin = await adminCtx.newPage();

    await test.step('empregadora cria a conta', async () => {
      await admin.goto('/cadastro');
      await admin.getByLabel('Seu nome completo').fill(dona.nome);
      await admin.getByLabel('E-mail').fill(dona.email);
      await admin.getByLabel('Senha').fill(SENHA);
      await admin.getByLabel('Como identificar a residência').fill(dona.casa);
      await admin.getByLabel('CPF do empregador').fill(cpf());
      await admin.getByLabel('Li e concordo com os termos de uso e o aviso de privacidade').check();
      await admin.getByRole('button', { name: 'Criar conta' }).click();
      await expect(admin.getByRole('heading', { name: 'Início', exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(admin.getByRole('heading', { name: 'Primeiros passos' })).toBeVisible();
    });

    await test.step('cadastra a casa com a área no mapa', async () => {
      await admin.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Casa e locais' }).click();
      await admin.getByRole('button', { name: 'Novo local' }).click();
      const d = admin.getByRole('dialog', { name: 'Novo local' });
      await d.getByLabel('Nome').fill('Casa da família');
      await d.getByLabel('Latitude').fill(String(CASA.latitude));
      await d.getByLabel('Longitude').fill(String(CASA.longitude));
      await d.getByLabel('Raio (m)').fill('150');
      await d.getByRole('button', { name: 'Salvar local' }).click();
      await expect(admin.getByText('Local cadastrado.')).toBeVisible();
      await expect(admin.getByText('Casa da família').filter({ visible: true }).first()).toBeVisible();
    });

    await test.step('cadastra três funcionários pelo assistente', async () => {
      for (const [i, p] of equipe.entries()) {
        await admin.goto('/painel/funcionarios/novo');
        await admin.getByLabel('Nome completo').fill(p.nome);
        await admin.getByLabel('CPF').fill(cpf());
        await admin.getByLabel('Celular').fill(`1198${n.padStart(6, '0').slice(0, 3)}${i}${i}${i}${i}`);
        await admin.getByLabel('E-mail').fill(p.email);
        await admin.getByRole('button', { name: 'Salvar e continuar' }).click();

        await expect(admin.getByRole('heading', { name: 'Contrato de trabalho' })).toBeVisible();
        await admin.getByLabel('Começou a trabalhar em').fill(inicioMesPassado);
        await admin.getByRole('button', { name: 'Salvar e continuar' }).click();

        await expect(admin.getByRole('heading', { name: 'Horário de trabalho' })).toBeVisible();
        // o primeiro cria o horário comercial; os outros reaproveitam
        if (i > 0) await admin.getByRole('radio', { name: /Seg a sex, 08:00 às 17:00/ }).check();
        await admin.getByRole('button', { name: 'Salvar e continuar' }).click();

        await expect(admin.getByRole('heading', { name: 'Onde pode marcar o ponto' })).toBeVisible();
        await expect(admin.getByRole('checkbox', { name: /Casa da família/ })).toBeChecked();
        await admin.getByRole('button', { name: 'Salvar e continuar' }).click();

        await expect(admin.getByRole('heading', { name: 'Acesso ao app' })).toBeVisible();
        await admin.getByRole('button', { name: 'Concluir cadastro' }).click();
        await expect(admin).toHaveURL(/painel\/funcionarios\/[0-9a-f-]+\?novo=1/);
      }
      await admin.goto('/painel');
      // casa, horário, funcionários e convites prontos: o roteiro de configuração some
      await expect(admin.getByRole('heading', { name: 'Hoje, por funcionário' })).toBeVisible();
      await expect(admin.getByRole('heading', { name: 'Primeiros passos' })).toBeHidden();
    });

    await test.step('cada funcionário recebe o convite, cria a senha e entra no app', async () => {
      for (const p of equipe) {
        p.ctx = await novoContexto(browser, base, true);
        p.page = await p.ctx.newPage();
        await definirSenhaEEntrar(p.page, await linkDoEmail(p.page, p.email), p.email);
        await abrirApp(p.page);
      }
    });

    await test.step('jornada no celular: entrada, pausa fora do local, retorno e saída', async () => {
      // os três chegam ao mesmo tempo
      await Promise.all(equipe.map((p) => marcar(p.page!)));
      await expect(ana.page!.getByText('Trabalhando').filter({ visible: true }).first()).toBeVisible();
      await ana.page!.waitForTimeout(31_000);
      // Bruno sai para o mercado: a pausa é marcada longe da casa e pede o motivo
      await bruno.ctx!.setGeolocation({ ...LONGE, accuracy: 15 });
      await Promise.all([marcar(ana.page!), marcar(bruno.page!, 'Fui fazer compras para a casa')]);
      await bruno.ctx!.setGeolocation({ ...CASA, accuracy: 12 });
      await ana.page!.waitForTimeout(31_000);
      await Promise.all([marcar(ana.page!), marcar(bruno.page!)]);
      await ana.page!.waitForTimeout(31_000);
      await marcar(ana.page!);
      await expect(ana.page!.getByRole('heading', { name: 'Hoje' })).toBeVisible();
      // comprovante da última marcação
      await ana.page!.getByRole('link', { name: 'Ver comprovante', exact: true }).click();
      await expect(ana.page!.getByRole('heading', { name: 'Autenticidade' })).toBeVisible();
    });

    await test.step('Carla esqueceu de marcar a saída e pede o ajuste', async () => {
      const c = carla.page!;
      await c.goto('/app');
      await c.getByRole('link', { name: 'Esqueci' }).click();
      await c.getByRole('button', { name: /Esqueci de marcar/ }).click();
      await c.getByLabel('Qual dia?').fill(diaUtilAnterior());
      await c.getByRole('button', { name: 'Saída', exact: true }).click();
      await c.getByLabel('Que horas foi?').fill('17:05');
      await c.getByRole('button', { name: 'Continuar' }).click();
      await c.getByRole('button', { name: 'O celular estava sem bateria' }).click();
      await c.getByRole('button', { name: 'Enviar pedido' }).click();
      await expect(c.getByText('Pedido enviado')).toBeVisible();
    });

    await test.step('Bruno pede uma cópia dos próprios dados (LGPD)', async () => {
      const b = bruno.page!;
      await b.goto('/app/privacidade');
      await b.getByLabel('Tipo de pedido').selectOption({ label: 'Portabilidade (cópia dos dados)' });
      await b.getByLabel('Detalhes').fill('Quero uma cópia das minhas marcações deste ano.');
      await b.getByRole('button', { name: 'Enviar pedido' }).click();
      await expect(b.locator('li').filter({ hasText: 'Portabilidade (cópia dos dados)' }).first()).toBeVisible();
    });

    await test.step('empregadora acompanha o dia, aprova o ajuste e revisa a ocorrência', async () => {
      await admin.goto('/painel');
      await expect(admin.getByRole('heading', { name: 'Hoje, por funcionário' })).toBeVisible();
      for (const p of equipe) await expect(admin.getByText(p.nome).filter({ visible: true }).first()).toBeVisible();

      await admin.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: /Para revisar/ }).click();
      await admin.getByRole('button', { name: 'Analisar' }).first().click();
      const d = admin.getByRole('dialog', { name: 'Analisar solicitação' });
      await d.getByLabel('Motivo da decisão').fill('Conferido com a Carla, saiu no horário.');
      await d.getByRole('button', { name: 'Aprovar' }).click();
      await expect(admin.getByText('Decisão registrada.')).toBeVisible();

      await admin.getByRole('tab', { name: /Ocorrências nas marcações/ }).click();
      await expect(admin.getByText(bruno.nome).filter({ visible: true }).first()).toBeVisible();
      await admin.getByRole('button', { name: 'Registrar revisão' }).first().click();
      const r = admin.getByRole('dialog', { name: 'Revisar ocorrência' });
      await r.getByLabel('Análise').fill('Combinado: o Bruno foi ao mercado a pedido da família.');
      await r.getByRole('button', { name: 'Salvar revisão' }).click();
      await expect(r).toBeHidden();
    });

    await test.step('empregadora propõe um abono e a Ana concorda pelo app', async () => {
      await admin.goto('/painel/revisar?aba=ajustes');
      await admin.getByRole('button', { name: 'Propor ajuste' }).click();
      const d = admin.getByRole('dialog', { name: 'Propor ajuste ao funcionário' });
      await d.getByLabel('Funcionário').selectOption({ label: ana.nome });
      await d.getByLabel('O que precisa ser corrigido').selectOption({ label: 'Justificar ausência (abono)' });
      await d.getByLabel('Dia da ausência').fill(diaUtilAnterior());
      await d.getByLabel('Motivo').fill('Dispensada para consulta médica, com atestado.');
      await d.getByRole('button', { name: /Enviar proposta ao funcionário/ }).click();
      await expect(admin.getByText(/Proposta enviada/)).toBeVisible();

      const a = ana.page!;
      await a.goto('/app/correcoes');
      await a.getByRole('button', { name: 'Responder' }).first().click();
      const r = a.getByRole('dialog', { name: 'Seu empregador pediu um ajuste' });
      await r.getByLabel('Seu comentário').fill('Isso mesmo, obrigada.');
      await r.getByRole('button', { name: 'Concordo', exact: true }).click();
      await expect(r).toBeHidden();
    });

    await test.step('empregadora convida um gestor, que entra e acompanha as marcações', async () => {
      await admin.goto('/painel/configuracoes');
      await admin.getByRole('tab', { name: 'Usuários' }).click();
      await admin.getByRole('button', { name: 'Convidar' }).click();
      const d = admin.getByRole('dialog', { name: 'Convidar usuário' });
      await d.getByLabel('Nome').fill(gestor.nome);
      await d.getByLabel('E-mail').fill(gestor.email);
      await d.getByRole('button', { name: 'Enviar convite' }).click();
      await expect(admin.getByText('Convite enviado.')).toBeVisible();

      const gCtx = await novoContexto(browser, base, false);
      const g = await gCtx.newPage();
      await definirSenhaEEntrar(g, await linkDoEmail(g, gestor.email), gestor.email);
      await expect(g.getByRole('heading', { name: 'Início', exact: true })).toBeVisible({ timeout: 20_000 });
      await g.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Marcações' }).click();
      await expect(g.getByText(ana.nome).filter({ visible: true }).first()).toBeVisible();
      await gCtx.close();
    });

    await test.step('fim do mês: fecha o mês passado de todos e a Carla registra ciência', async () => {
      await admin.goto('/painel/fechamento');
      for (const p of equipe) await expect(admin.getByText(p.nome).filter({ visible: true }).first()).toBeVisible();
      await admin.getByRole('button', { name: /Fechar o mês de todos/ }).click();
      await admin.getByRole('dialog').getByRole('button', { name: 'Fechar o mês' }).click();
      await expect(admin.getByText(/3 meses fechados/)).toBeVisible();
      await expect(admin.getByText('Fechado, falta ciência').filter({ visible: true }).first()).toBeVisible();

      const c = carla.page!;
      await c.goto('/app/correcoes');
      await c.getByRole('tab', { name: /Fechamentos/ }).click();
      await c.getByRole('button', { name: 'Estou de acordo' }).first().click();
      await expect(c.getByText('Ciência registrada').filter({ visible: true }).first()).toBeVisible();
    });

    await test.step('empregadora responde o pedido LGPD', async () => {
      await admin.goto('/painel/privacidade');
      await admin.getByRole('button', { name: 'Responder' }).first().click();
      const d = admin.getByRole('dialog');
      await d.getByLabel('Resposta').fill('Cópia enviada por e-mail em PDF e CSV.');
      await d.getByRole('button', { name: 'Enviar resposta' }).click();
      await expect(admin.getByText('Respondido').filter({ visible: true }).first()).toBeVisible();
    });

    await test.step('espelho, exportação para o contador e auditoria', async () => {
      await admin.goto('/painel/espelho');
      await admin.getByLabel('Funcionário').selectOption({ label: ana.nome });
      await expect(admin.getByRole('heading', { name: 'Dia a dia' })).toBeVisible();

      const mes = inicioMesPassado.slice(0, 7);
      const csv = await admin.request.get(`/api/exports/summary.csv?month=${mes}`);
      expect(csv.status()).toBe(200);
      const texto = await csv.text();
      for (const p of equipe) expect(texto).toContain(p.nome);

      await admin.goto('/painel/auditoria');
      await admin.getByRole('button', { name: 'Verificar integridade' }).click();
      await expect(admin.getByText(/Trilha de auditoria: íntegra/)).toBeVisible();
      await expect(admin.getByText(/Marcações: íntegras/)).toBeVisible();
    });

    await test.step('todos saem do sistema', async () => {
      for (const p of equipe) await p.ctx!.close();
      await admin.getByRole('button', { name: 'Menu do usuário' }).click();
      await admin.getByRole('button', { name: 'Sair' }).click();
      await expect(admin).toHaveURL(/entrar/);
      await adminCtx.close();
    });
  });
});
