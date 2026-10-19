import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, Client, CPFS, MailService, PASSWORD, uniqueEmail } from './helpers.js';

describe('autenticação e sessão', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await bootApp();
  });
  afterAll(async () => app.close());

  const signup = async (c: Client, email: string) =>
    c.post('/auth/signup', { name: 'Titular', email, password: PASSWORD, employer: { displayName: 'Casa', legalName: 'Titular', cpf: CPFS[1] }, acceptTerms: true });

  it('cadastra empregador com titular e abre sessão com cookies seguros', async () => {
    const c = new Client(app);
    const res = await signup(c, uniqueEmail('a'));
    expect(res.status).toBe(201);
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join(' ');
    expect(cookies).toMatch(/pn_session=[^;]+;.*HttpOnly/);
    expect(cookies).toMatch(/SameSite=Strict/);
    const me = await c.get('/auth/me');
    expect(me.body.active.role).toBe('employer_owner');
    expect(me.body.permissions).toContain('corrections.decide');
    expect(me.body.permissions).not.toContain('punch.self');
  });

  it('recusa senha fraca, CPF inválido e e-mail repetido', async () => {
    const c = new Client(app);
    const bad = await c.post('/auth/signup', { name: 'X Y Z', email: uniqueEmail('b'), password: '123', employer: { displayName: 'Casa', legalName: 'Titular', cpf: '11111111111' }, acceptTerms: true });
    expect(bad.status).toBe(422);
    expect(bad.body.fields).toHaveProperty('password');
    expect(bad.body.fields).toHaveProperty(['employer.cpf']);
    const email = uniqueEmail('c');
    await signup(new Client(app), email);
    expect((await signup(new Client(app), email)).status).toBe(409);
  });

  it('exige sessão e token anti-CSRF', async () => {
    const anon = new Client(app);
    expect((await anon.get('/employees')).status).toBe(401);
    const c = new Client(app);
    await signup(c, uniqueEmail('d'));
    const noCsrf = await c.agent.post('/api/job-roles').send({ name: 'Cozinheira' });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.code).toBe('CSRF');
    const otherOrigin = await c.agent.post('/api/job-roles').set('x-csrf-token', c.csrf).set('origin', 'https://atacante.example').send({ name: 'Cozinheira' });
    expect(otherOrigin.body.code).toBe('ORIGIN');
    expect((await c.post('/job-roles', { name: 'Cozinheira' })).status).toBe(201);
  });

  it('bloqueia a conta após 5 senhas erradas com mensagem genérica', async () => {
    const email = uniqueEmail('e');
    await signup(new Client(app), email);
    const c = new Client(app);
    for (let i = 0; i < 5; i++) expect((await c.post('/auth/login', { email, password: 'errada-123' })).status).toBe(401);
    const locked = await c.post('/auth/login', { email, password: PASSWORD });
    expect(locked.status).toBe(401);
    expect(locked.body.code).toBe('INVALID_CREDENTIALS');
    const unknown = await c.post('/auth/login', { email: uniqueEmail('naoexiste'), password: PASSWORD });
    expect(unknown.body.message).toBe(locked.body.message);
  });

  it('recupera a senha por link de uso único e encerra as sessões antigas', async () => {
    const email = uniqueEmail('f');
    const first = new Client(app);
    await signup(first, email);
    const mail = app.get(MailService);
    const before = mail.sent.length;
    const forgot = await new Client(app).post('/auth/password/forgot', { email });
    expect(forgot.status).toBe(200);
    const anonymous = await new Client(app).post('/auth/password/forgot', { email: uniqueEmail('ninguem') });
    expect(anonymous.body).toEqual(forgot.body);
    const token = /token=([\w-]+)/.exec(mail.sent.slice(before).find((m) => m.to === email)!.text)![1];
    const c = new Client(app);
    expect((await c.post('/auth/password/reset', { token, password: 'NovaSenha456' })).status).toBe(200);
    expect((await c.post('/auth/password/reset', { token, password: 'OutraSenha789' })).status).toBe(400);
    expect((await first.get('/auth/me')).status).toBe(401);
    await c.login(email, 'NovaSenha456');
    expect((await c.get('/auth/me')).status).toBe(200);
  });

  it('limita tentativas de login por origem (429)', async () => {
    process.env.THROTTLE_IN_TESTS = 'true';
    try {
      const c = new Client(app);
      const codes: number[] = [];
      for (let i = 0; i < 12; i++) codes.push((await c.post('/auth/login', { email: uniqueEmail('rl'), password: 'x' })).status);
      expect(codes).toContain(429);
    } finally {
      process.env.THROTTLE_IN_TESTS = 'false';
    }
  });

  it('encerra a sessão no logout', async () => {
    const c = new Client(app);
    await signup(c, uniqueEmail('g'));
    expect((await c.post('/auth/logout')).status).toBe(200);
    expect((await c.get('/auth/me')).status).toBe(401);
  });

  it('documenta a API com os schemas de entrada', async () => {
    const res = await new Client(app).get('/docs/json');
    expect(res.status).toBe(200);
    const body = res.body.paths['/api/me/punches'].post.requestBody.content['application/json'].schema;
    const props = body.properties ?? body.$ref;
    expect(props).toBeTruthy();
  });
});
