import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RemindersJob } from '../src/modules/notificacoes/reminders.job.js';
import { bootApp, Client, ownerSql, punchBody, scenario, setClock, type Scenario } from './helpers.js';

describe('avisos e PDF', () => {
  let app: NestExpressApplication;
  let s: Scenario;
  beforeAll(async () => {
    app = await bootApp();
    s = await scenario(app, { cpfIndex: 6 });
    await s.owner.put(`/employees/${s.employeeId}`, { fullName: 'Maria Fictícia', email: s.employeeEmail, phone: '(11) 98765-0001', status: 'active' });
  });
  afterAll(async () => app.close());

  it('gera o comprovante em PDF no servidor', async () => {
    setClock(app, '2026-10-15T08:00:00');
    const r = await s.employee.post('/me/punches', punchBody('clock_in', s.locationId));
    setClock(app, null);
    const pdf = await s.employee.get(`/me/receipts/${r.body.punch.id}/pdf`).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(Buffer.from(pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect((await s.owner.get(`/punches/${r.body.punch.id}/receipt.pdf`)).status).toBe(200);
  });

  it('avisa resposta de pedido no sino até o funcionário abrir os pedidos', async () => {
    const req = await s.employee.post('/corrections', { kind: 'justify_absence', absenceDate: '2026-10-14', reason: 'Consulta médica com atestado' });
    await s.owner.post(`/corrections/${req.body.id}/decide`, { decision: 'approve', reason: 'Atestado conferido' });
    expect((await s.employee.get('/me/punch-context')).body.unseenDecisions).toBe(1);
    await s.employee.post('/me/corrections/seen');
    expect((await s.employee.get('/me/punch-context')).body.unseenDecisions).toBe(0);
  });

  it('envia lembrete de saída pela escala uma única vez', async () => {
    // servidor de push falso em HTTPS (o web-push só envia por HTTPS), com certificado temporário
    const dir = mkdtempSync(join(tmpdir(), 'pn-push-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem')], { stdio: 'ignore' });
    const tls = { key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) };
    rmSync(dir, { recursive: true, force: true });
    const previousTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const hits: IncomingMessage['headers'][] = [];
    const server = createServer(tls, (req, res) => {
      hits.push(req.headers);
      req.resume();
      req.on('end', () => res.writeHead(201).end());
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    // chaves de inscrição válidas (P-256) geradas como o navegador faria
    const { createECDH, randomBytes } = await import('node:crypto');
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const sub = await s.employee.post('/me/push/subscribe', {
      endpoint: `https://127.0.0.1:${port}/push/abc`,
      keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
    });
    expect(sub.status).toBe(200);

    // jornada aberta em 15/10 desde 08:00; escala termina 17:00 → lembrete às 17:30
    const job = app.get(RemindersJob);
    expect(await job.run(new Date('2026-10-15T17:30:00-03:00'))).toBe(1);
    expect(await job.run(new Date('2026-10-15T17:40:00-03:00'))).toBe(0);
    server.close();
    if (previousTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTls;
    expect(hits.length).toBe(1);
    expect(String(hits[0]!.authorization)).toMatch(/^vapid /);
  });
});
