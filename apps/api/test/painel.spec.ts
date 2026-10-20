import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DailySummaryJob } from '../src/modules/governanca/daily-summary.job.js';
import { CPFS, MailService, punchBody, scenario, setClock, bootApp, type Scenario } from './helpers.js';

describe('painel do empregador: configuração, fechamento geral e resumo diário', () => {
  let app: NestExpressApplication;
  let s: Scenario;
  let second: string;
  beforeAll(async () => {
    app = await bootApp();
    s = await scenario(app, { cpfIndex: 8 });
    // segundo funcionário só com cadastro: deve aparecer como pendente de configuração
    const e = await s.owner.post('/employees', { fullName: 'Carlos Fictício', cpf: CPFS[9], createAccess: false });
    second = e.body.id;
    // setembro: a Maria trabalha um dia e pede um ajuste (fica pendente)
    for (const [t, type] of [['2026-09-01T08:00:00', 'clock_in'], ['2026-09-01T17:00:00', 'clock_out']] as const) {
      setClock(app, t);
      await s.employee.post('/me/punches', punchBody(type, s.locationId));
    }
    setClock(app, null);
  });
  afterAll(async () => app.close());

  it('mostra o que falta configurar para cada funcionário', async () => {
    const d = await s.owner.get('/dashboard');
    expect(d.body.setup.hasLocation).toBe(true);
    expect(d.body.setup.hasSchedule).toBe(true);
    const carlos = d.body.setup.pending.find((p: { employeeId: string }) => p.employeeId === second);
    expect(carlos.missing).toEqual(['contrato', 'local', 'horário', 'acesso']);
    expect(d.body.setup.pending.some((p: { employeeId: string }) => p.employeeId === s.employeeId)).toBe(false);
  });

  it('resume o mês e fecha todos, pulando quem tem pedido pendente', async () => {
    const req = await s.employee.post('/corrections', { kind: 'justify_absence', absenceDate: '2026-09-02', reason: 'Consulta médica com atestado' });
    const summary = await s.owner.get('/closings/summary?month=2026-09');
    const maria = summary.body.rows.find((r: { employeeId: string }) => r.employeeId === s.employeeId);
    expect(maria.workedSeconds).toBe(9 * 3600);
    expect(maria.pendingCorrections).toBe(1);

    const blocked = await s.owner.post('/closings/batch', { month: '2026-09' });
    expect(blocked.body.closed).toBe(0);
    expect(blocked.body.skipped[0].reason).toContain('pedido de ajuste');

    await s.owner.post(`/corrections/${req.body.id}/decide`, { decision: 'approve', reason: 'Atestado conferido' });
    const ok = await s.owner.post('/closings/batch', { month: '2026-09' });
    expect(ok.body.closed).toBe(1);
    const after = await s.owner.get('/closings/summary?month=2026-09');
    expect(after.body.rows.find((r: { employeeId: string }) => r.employeeId === s.employeeId).closing.status).toBe('closed');

    const csv = await s.owner.get('/exports/summary.csv?month=2026-09');
    expect(csv.text).toContain('Resumo do mês');
    expect(csv.text).toContain('Maria Fictícia');
  });

  it('envia o resumo diário só a partir das 8h e uma vez por dia', async () => {
    // deixa um pedido pendente para haver o que avisar
    await s.employee.post('/corrections', { kind: 'justify_absence', absenceDate: '2026-10-05', reason: 'Consulta médica com atestado' });
    const job = app.get(DailySummaryJob);
    const mail = app.get(MailService);
    const before = mail.sent.length;
    expect(await job.run(new Date('2027-01-11T07:30:00-03:00'))).toBe(0);
    const n = await job.run(new Date('2027-01-11T08:10:00-03:00'));
    expect(n).toBeGreaterThan(0);
    expect(await job.run(new Date('2027-01-11T09:00:00-03:00'))).toBe(0);
    const msg = mail.sent.slice(before).find((m) => m.to === s.ownerEmail);
    expect(msg?.text).toContain('pedido(s) de ajuste');
  });
});
