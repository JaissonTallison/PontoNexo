import { createServer, type IncomingMessage } from 'node:http';
import { createHmac } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IntegrationsService } from '../src/modules/governanca/integrations.service.js';
import { RetentionJob } from '../src/modules/governanca/retention.job.js';
import { bootApp, ownerSql, punchBody, scenario, setClock, type Scenario } from './helpers.js';

describe('operação: retenção e webhooks', () => {
  let app: NestExpressApplication;
  let s: Scenario;
  beforeAll(async () => {
    app = await bootApp();
    s = await scenario(app, { cpfIndex: 5, contractStart: '2024-06-01' });
  });
  afterAll(async () => app.close());

  it('reduz coordenadas antigas ao resultado sem quebrar a cadeia de hash', async () => {
    setClock(app, '2025-01-06T08:00:00');
    const old = await s.employee.post('/me/punches', punchBody('clock_in', s.locationId));
    setClock(app, '2025-01-06T17:00:00');
    await s.employee.post('/me/punches', punchBody('clock_out', s.locationId));
    setClock(app, null);
    await app.get(RetentionJob).run();
    const sql = ownerSql();
    const [p] = await sql`select lat, lng, accuracy_m, geo_status, coordinates_purged_at from punch_records where id = ${old.body.punch.id}`;
    await sql.end();
    expect(p!.lat).toBeNull();
    expect(p!.geo_status).toBe('inside');
    expect(p!.coordinates_purged_at).not.toBeNull();
    expect((await s.owner.get('/punches/integrity')).body.valid).toBe(true);
  });

  it('entrega eventos por webhook assinado com HMAC', async () => {
    const received: Array<{ headers: IncomingMessage['headers']; body: string }> = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.writeHead(204).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const secret = 'segredo-de-teste-com-mais-de-24-caracteres';
    const created = await s.owner.post('/integrations', { name: 'Folha', kind: 'webhook', url: `http://127.0.0.1:${port}/hook`, secret, events: ['punch.accepted'] });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    setClock(app, '2026-10-14T08:00:00');
    await s.employee.post('/me/punches', punchBody('clock_in', s.locationId));
    setClock(app, null);
    await app.get(IntegrationsService).dispatchEmployer(s.employerId);
    server.close();

    expect(received).toHaveLength(1);
    const sig = received[0]!.headers['x-pontonexo-signature'];
    expect(sig).toBe(`sha256=${createHmac('sha256', secret).update(received[0]!.body).digest('hex')}`);
    const payload = JSON.parse(received[0]!.body);
    expect(payload.event).toBe('punch.accepted');
    expect(received[0]!.body).not.toMatch(/-23\.55/);
    const list = await s.owner.get('/integrations');
    expect(list.body[0].lastStatus).toBe('sent (204)');
  });

  it('registra e acompanha incidentes', async () => {
    const inc = await s.owner.post('/incidents', { kind: 'privacy', severity: 'medium', title: 'Celular da funcionária perdido', description: 'Aparelho com sessão aberta foi perdido; sessão encerrada.', personalDataAffected: true });
    expect(inc.status).toBe(201);
    const upd = await s.owner.post(`/incidents/${inc.body.id}/updates`, { status: 'resolved', note: 'Senha trocada e sessões encerradas.' });
    expect(upd.body.status).toBe('resolved');
    expect(upd.body.updates).toHaveLength(2);
  });
});
