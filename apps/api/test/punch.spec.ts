import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../src/config/env.js';
import { ENV } from '../src/common/tokens.js';
import { bootApp, Client, fakeSntp, HOME, ownerSql, punchBody, scenario, setClock, TimeService, type Scenario } from './helpers.js';

describe('registro de ponto', () => {
  let app: NestExpressApplication;
  let s: Scenario;
  beforeAll(async () => {
    app = await bootApp();
    s = await scenario(app);
  });
  afterEach(() => setClock(app, null));
  afterAll(async () => app.close());

  const punch = (c: Client, type: string, extra: Record<string, unknown> = {}) => c.post('/me/punches', punchBody(type, s.locationId, extra));

  it('registra jornada com vários intervalos, NSR sequencial e comprovante verificável', async () => {
    const times = ['2026-10-05T08:00:10', '2026-10-05T10:00:00', '2026-10-05T10:15:00', '2026-10-05T12:00:00', '2026-10-05T13:00:00', '2026-10-05T17:01:00'];
    const types = ['clock_in', 'break_start', 'break_end', 'break_start', 'break_end', 'clock_out'];
    const nsrs: number[] = [];
    for (let i = 0; i < types.length; i++) {
      setClock(app, times[i]!);
      const res = await punch(s.employee, types[i]!, { deviceTime: new Date(`${times[i]}-03:00`).toISOString() });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.punch.geoStatus).toBe('inside');
      nsrs.push(res.body.punch.nsr);
      if (i === 0) {
        expect(res.body.receipt.payload.title).toBe('Comprovante de Registro de Ponto do Trabalhador');
        expect(res.body.receipt.payload.localTime).toBe('05/10/2026 08:00:10');
        const v = await new Client(app).get(`/receipts/verify/${res.body.receipt.code}`);
        expect(v.body.valid).toBe(true);
        expect(JSON.stringify(v.body)).not.toContain(res.body.receipt.payload.employee.cpf);
      }
    }
    expect(nsrs).toEqual(nsrs.map((_, i) => nsrs[0]! + i));
    const sheet = await s.employee.get('/me/timesheet?month=2026-10');
    const day = sheet.body.days.find((d: { date: string }) => d.date === '2026-10-05');
    expect(day.workedSeconds).toBe(9 * 3600 + 50 - 75 * 60); // 8:00:10 → 17:01:00 menos 1h15 de intervalos
    expect(day.issues.map((i: { code: string }) => i.code)).toContain('multiple_breaks');
  });

  it('valida a sequência no servidor e registra a recusa na auditoria', async () => {
    setClock(app, '2026-10-06T08:00:00');
    const res = await punch(s.employee, 'break_end');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SEQUENCE_INVALID');
    expect(res.body.allowedNext).toEqual(['clock_in']);
    const audit = await s.owner.get('/audit?action=punch.rejected');
    expect(audit.body.total).toBeGreaterThan(0);
  });

  it('é idempotente: reenviar o mesmo pedido devolve a mesma marcação', async () => {
    setClock(app, '2026-10-06T08:01:00');
    const body = punchBody('clock_in', s.locationId);
    const a = await s.employee.post('/me/punches', body);
    const b = await s.employee.post('/me/punches', body);
    expect(a.status).toBe(201);
    expect(b.body.replayed).toBe(true);
    expect(b.body.punch.nsr).toBe(a.body.punch.nsr);
  });

  it('recusa marcação duplicada em menos de 30 segundos', async () => {
    setClock(app, '2026-10-06T08:01:20');
    const res = await punch(s.employee, 'break_start');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TOO_SOON');
  });

  it('fora do raio exige justificativa e aceita com ocorrência, sem penalidade', async () => {
    setClock(app, '2026-10-06T12:00:00');
    const far = { position: { lat: HOME.lat + 0.01, lng: HOME.lng, accuracyM: 10 } };
    const noJust = await punch(s.employee, 'break_start', far);
    expect(noJust.status).toBe(422);
    expect(noJust.body.code).toBe('JUSTIFICATION_REQUIRED');
    expect(noJust.body.alerts[0].code).toBe('outside_geofence');
    const ok = await punch(s.employee, 'break_start', { ...far, justification: 'Fui à farmácia buscar remédio da família' });
    expect(ok.status).toBe(201);
    expect(ok.body.punch.geoStatus).toBe('outside');
    expect(ok.body.punch.alerts.map((a: { code: string }) => a.code)).toContain('outside_geofence');
  });

  it('GPS negado ou impreciso vira ocorrência com justificativa', async () => {
    setClock(app, '2026-10-06T13:00:00');
    const denied = await punch(s.employee, 'break_end', { positionOutcome: 'denied', position: null, justification: 'Celular sem permissão de localização' });
    expect(denied.status).toBe(201);
    expect(denied.body.punch.geoStatus).toBe('denied');
    setClock(app, '2026-10-06T17:00:00');
    const blurry = await punch(s.employee, 'clock_out', { position: { lat: HOME.lat + 0.001, lng: HOME.lng, accuracyM: 800 }, justification: 'Sinal fraco dentro de casa' });
    expect(blurry.body.punch.geoStatus).toBe('low_accuracy');
  });

  it('registra envio offline pela hora de recebimento e anota a hora do aparelho', async () => {
    setClock(app, '2026-10-07T08:40:00');
    const res = await punch(s.employee, 'clock_in', { offline: true, deviceTime: new Date('2026-10-07T08:02:00-03:00').toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.punch.origin).toBe('offline_sync');
    expect(res.body.punch.serverTime).toBe('2026-10-07T11:40:00.000Z');
    const alert = res.body.punch.alerts.find((a: { code: string }) => a.code === 'offline_submission');
    expect(alert.detail).toContain('07/10/2026 08:02:00');
  });

  it('aponta relógio do aparelho divergente', async () => {
    setClock(app, '2026-10-07T12:00:00');
    const res = await punch(s.employee, 'break_start', { deviceTime: new Date('2026-10-07T12:20:00-03:00').toISOString() });
    expect(res.body.punch.alerts.map((a: { code: string }) => a.code)).toContain('device_clock_divergence');
  });

  it('jornada esquecida aberta é encerrada como pendente e a nova entrada é aceita', async () => {
    // a jornada de 07/10 ficou em intervalo; 20 h depois a próxima marcação válida é a entrada
    setClock(app, '2026-10-08T09:00:00');
    const res = await punch(s.employee, 'clock_in');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.punch.alerts.map((a: { code: string }) => a.code)).toContain('stale_session_closed');
    setClock(app, '2026-10-08T18:00:00');
    await punch(s.employee, 'clock_out');
  });

  it('calcula jornada noturna que vira o dia', async () => {
    setClock(app, '2026-10-09T22:00:00');
    await punch(s.employee, 'clock_in');
    setClock(app, '2026-10-10T02:00:00');
    await punch(s.employee, 'break_start');
    setClock(app, '2026-10-10T03:00:00');
    await punch(s.employee, 'break_end');
    setClock(app, '2026-10-10T06:00:00');
    expect((await punch(s.employee, 'clock_out')).status).toBe(201);
    const sheet = await s.owner.get(`/timesheets/${s.employeeId}?month=2026-10`);
    const d9 = sheet.body.days.find((d: { date: string }) => d.date === '2026-10-09');
    expect(d9.workedSeconds).toBe(7 * 3600);
    expect(d9.nightSeconds).toBe(6 * 3600);
    expect(sheet.body.days.find((d: { date: string }) => d.date === '2026-10-10').workedSeconds).toBe(0);
  });

  it('mantém a cadeia de hash íntegra', async () => {
    const integrity = await s.owner.get('/punches/integrity');
    expect(integrity.body.valid).toBe(true);
    expect(integrity.body.checked).toBeGreaterThan(10);
  });

  it('mede a defasagem por SNTP, abre incidente e marca as marcações seguintes', async () => {
    const fake = await fakeSntp(5000);
    const env = app.get<Env>(ENV);
    env.NTP_SERVERS = `127.0.0.1:${fake.port}`;
    const time = app.get(TimeService);
    await time.check();
    fake.close();
    expect(time.status().status).toBe('drift');
    expect(Math.abs(time.status().offsetMs! - 5000)).toBeLessThan(500);
    const owner = ownerSql();
    const [inc] = await owner`select status from incidents where dedupe_key = 'time_sync:drift'`;
    await owner.end();
    expect(inc?.status).toBe('open');
    setClock(app, '2026-10-12T08:00:00');
    const res = await punch(s.employee, 'clock_in');
    expect(res.body.punch.clockStatus).toBe('drift');
    expect(res.body.punch.alerts.map((a: { code: string }) => a.code)).toContain('server_clock_drift');

    const ok = await fakeSntp(3);
    env.NTP_SERVERS = `127.0.0.1:${ok.port}`;
    await time.check();
    ok.close();
    expect(time.status().status).toBe('synced');
  });
});
