import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, ownerSql, punchBody, scenario, setClock, type Scenario } from './helpers.js';

const at = (local: string) => new Date(`${local}-03:00`).toISOString();

describe('correções, espelho e fechamento', () => {
  let app: NestExpressApplication;
  let s: Scenario;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    app = await bootApp();
    s = await scenario(app, { cpfIndex: 4 });
    // terça 01/09/2026: esqueceu a saída (jornada fica aberta)
    const plan: Array<[string, string]> = [
      ['2026-09-01T08:00:00', 'clock_in'],
      ['2026-09-01T12:00:00', 'break_start'],
      ['2026-09-01T13:00:00', 'break_end'],
      // quarta 02/09: entrada registrada com atraso por engano de horário
      ['2026-09-02T08:30:00', 'clock_in'],
      ['2026-09-02T12:00:00', 'break_start'],
      ['2026-09-02T13:00:00', 'break_end'],
      ['2026-09-02T17:00:00', 'clock_out'],
    ];
    for (const [t, type] of plan) {
      setClock(app, t);
      const r = await s.employee.post('/me/punches', punchBody(type, s.locationId));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      ids[`${t}`] = r.body.punch.id;
    }
    setClock(app, null);
  });
  afterEach(() => setClock(app, null));
  afterAll(async () => app.close());

  it('funcionário pede inclusão da saída esquecida; o empregador aprova; a original não muda', async () => {
    const before = await s.owner.get(`/timesheets/${s.employeeId}?month=2026-09`);
    const d1 = before.body.days.find((d: { date: string }) => d.date === '2026-09-01');
    expect(d1.issues.map((i: { code: string }) => i.code)).toContain('missing_clock_out');

    const req = await s.employee.post('/corrections', { kind: 'include_punch', proposedType: 'clock_out', proposedTime: at('2026-09-01T17:00:00'), reason: 'Esqueci de registrar a saída, saí às 17h' });
    expect(req.status, JSON.stringify(req.body)).toBe(201);
    expect(req.body.canDecide).toBe(false);

    const selfDecide = await s.employee.post(`/corrections/${req.body.id}/decide`, { decision: 'approve', reason: 'aprovado' });
    expect(selfDecide.status).toBe(403);

    const ok = await s.owner.post(`/corrections/${req.body.id}/decide`, { decision: 'approve', reason: 'Confirmado pela rotina do dia' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('approved');

    const after = await s.owner.get(`/timesheets/${s.employeeId}?month=2026-09`);
    const day = after.body.days.find((d: { date: string }) => d.date === '2026-09-01');
    expect(day.workedSeconds).toBe(8 * 3600);
    expect(day.punches.some((p: { source: string }) => p.source === 'inclusion')).toBe(true);
    expect(after.body.treatments[0].kind).toBe('inclusion');

    const again = await s.owner.post(`/corrections/${req.body.id}/decide`, { decision: 'reject', reason: 'mudei de ideia' });
    expect(again.status).toBe(409);
  });

  it('empregador propõe ajuste; só o funcionário pode aceitar; gera desconsideração + inclusão', async () => {
    const target = ids['2026-09-02T08:30:00']!;
    const prop = await s.owner.post('/corrections', { kind: 'replace_time', employeeId: s.employeeId, targetPunchId: target, proposedTime: at('2026-09-02T08:00:00'), reason: 'Câmera da portaria mostra chegada às 8h' });
    expect(prop.status).toBe(201);
    expect(prop.body.initiatedBy).toBe('employer');
    expect((await s.owner.post(`/corrections/${prop.body.id}/decide`, { decision: 'approve', reason: 'aprovado' })).status).toBe(403);
    const accepted = await s.employee.post(`/corrections/${prop.body.id}/decide`, { decision: 'approve', reason: 'Correto, cheguei às 8h' });
    expect(accepted.status).toBe(200);

    const sheet = await s.employee.get('/me/timesheet?month=2026-09');
    const d2 = sheet.body.days.find((d: { date: string }) => d.date === '2026-09-02');
    expect(d2.workedSeconds).toBe(8 * 3600);
    expect(d2.disregarded).toHaveLength(1);

    const sql = ownerSql();
    const [orig] = await sql`select server_time from punch_records where id = ${target}`;
    await sql.end();
    expect(new Date(orig!.server_time as string).toISOString()).toBe(at('2026-09-02T08:30:00'));
  });

  it('abono de ausência elimina a falta do dia', async () => {
    const r = await s.employee.post('/corrections', { kind: 'justify_absence', absenceDate: '2026-09-03', reason: 'Consulta médica com atestado entregue' });
    await s.owner.post(`/corrections/${r.body.id}/decide`, { decision: 'approve', reason: 'Atestado conferido' });
    const sheet = await s.owner.get(`/timesheets/${s.employeeId}?month=2026-09`);
    const d3 = sheet.body.days.find((d: { date: string }) => d.date === '2026-09-03');
    expect(d3.absent).toBe(false);
    expect(d3.justified).toBe(true);
    const d4 = sheet.body.days.find((d: { date: string }) => d.date === '2026-09-04');
    expect(d4.absent).toBe(true);
  });

  it('fecha o mês com fotografia íntegra e bloqueia novos ajustes até reabrir', async () => {
    const close = await s.owner.post('/closings', { employeeId: s.employeeId, month: '2026-09' });
    expect(close.status, JSON.stringify(close.body)).toBe(201);
    const snap = await s.owner.get(`/closings/${close.body.id}/snapshot`);
    expect(snap.body.integrity).toBe(true);

    const blocked = await s.employee.post('/corrections', { kind: 'justify_absence', absenceDate: '2026-09-04', reason: 'Esqueci de entregar o atestado' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('MONTH_CLOSED');

    const ack = await s.employee.post(`/me/closings/${close.body.id}/acknowledge`, { agree: false, note: 'Falta do dia 04 tem atestado' });
    expect(ack.body.acknowledgementNote).toContain('Em desacordo');

    const reopen = await s.owner.post(`/closings/${close.body.id}/reopen`, { reason: 'Funcionária apresentou atestado do dia 04' });
    expect(reopen.body.status).toBe('reopened');
    expect((await s.employee.post('/corrections', { kind: 'justify_absence', absenceDate: '2026-09-04', reason: 'Atestado médico do dia 04' })).status).toBe(201);
  });

  it('não fecha mês em andamento', async () => {
    const res = await s.owner.post('/closings', { employeeId: s.employeeId, month: new Date().toISOString().slice(0, 7) });
    expect(res.body.code).toBe('MONTH_NOT_ENDED');
  });

  it('exporta marcações e espelho em CSV', async () => {
    const csv = await s.owner.get('/exports/punches.csv?month=2026-09');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('NSR;Funcionário');
    const sheet = await s.owner.get(`/exports/timesheet.csv?month=2026-09&employeeId=${s.employeeId}`);
    expect(sheet.text).toContain('Espelho de ponto');
  });

  it('funcionário baixa a cópia dos próprios dados e registra pedido LGPD', async () => {
    const data = await s.employee.get('/me/data-export');
    expect(data.status).toBe(200);
    expect(data.body.punches.length).toBeGreaterThan(0);
    const dsr = await s.employee.post('/me/data-requests', { kind: 'correction', details: 'Meu telefone mudou' });
    expect(dsr.status).toBe(201);
    const list = await s.owner.get('/data-requests');
    expect(list.body[0].kind).toBe('correction');
    const resp = await s.owner.post(`/data-requests/${dsr.body.id}/respond`, { status: 'answered', response: 'Telefone atualizado no cadastro.' });
    expect(resp.body.status).toBe('answered');
  });
});
