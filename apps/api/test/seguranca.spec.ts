import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appSql, bootApp, ownerSql, punchBody, scenario, setClock, type Scenario } from './helpers.js';

describe('isolamento, permissões e imutabilidade', () => {
  let app: NestExpressApplication;
  let a: Scenario;
  let b: Scenario;
  let punchId: string;

  beforeAll(async () => {
    app = await bootApp();
    a = await scenario(app, { cpfIndex: 2 });
    b = await scenario(app, { cpfIndex: 3 });
    setClock(app, '2026-10-13T08:00:00');
    const r = await a.employee.post('/me/punches', punchBody('clock_in', a.locationId));
    punchId = r.body.punch.id;
    setClock(app, null);
  });
  afterAll(async () => app.close());

  it('empregador não enxerga dados de outro empregador', async () => {
    expect((await b.owner.get(`/employees/${a.employeeId}`)).status).toBe(404);
    expect((await b.owner.get(`/punches?employeeId=${a.employeeId}`)).body.total).toBe(0);
    expect((await b.owner.get(`/punches/${punchId}/receipt`)).status).toBe(404);
    expect((await b.owner.get(`/timesheets/${a.employeeId}?month=2026-10`)).status).toBe(404);
    const list = await b.owner.get('/employees');
    expect(list.body.items.map((e: { id: string }) => e.id)).not.toContain(a.employeeId);
  });

  it('funcionário só acessa os próprios dados e não usa rotas do empregador', async () => {
    expect((await a.employee.get('/employees')).status).toBe(403);
    expect((await a.employee.get('/punches')).status).toBe(403);
    expect((await a.employee.get('/audit')).status).toBe(403);
    expect((await a.employee.post('/closings', { employeeId: a.employeeId, month: '2026-09' })).status).toBe(403);
    expect((await b.employee.get(`/me/receipts/${punchId}`)).status).toBe(404);
    expect((await a.employee.get(`/me/receipts/${punchId}`)).status).toBe(200);
  });

  it('empregador não marca ponto pelo funcionário', async () => {
    const res = await a.owner.post('/me/punches', punchBody('clock_in', a.locationId));
    expect(res.status).toBe(403);
  });

  it('não existe rota para editar ou apagar marcação', async () => {
    expect((await a.owner.put(`/punches/${punchId}`, { type: 'clock_out' })).status).toBe(404);
    expect((await a.owner.del(`/punches/${punchId}`)).status).toBe(404);
  });

  it('RLS do banco filtra outro empregador mesmo sem filtro na consulta', async () => {
    const sql = appSql();
    const rows = await sql.begin(async (tx) => {
      await tx`select set_config('app.employer_id', ${b.employerId}, true)`;
      return tx`select id from punch_records where id = ${punchId}`;
    });
    const none = await sql`select count(*)::int as n from employees`;
    await sql.end();
    expect(rows).toHaveLength(0);
    expect(none[0]!.n).toBe(0);
  });

  it('papel da aplicação não tem UPDATE/DELETE em marcações nem auditoria', async () => {
    const sql = appSql();
    await expect(
      sql.begin(async (tx) => {
        await tx`select set_config('app.employer_id', ${a.employerId}, true)`;
        await tx`update punch_records set type = 'clock_out' where id = ${punchId}`;
      }),
    ).rejects.toThrow(/permission denied/);
    await expect(
      sql.begin(async (tx) => {
        await tx`select set_config('app.employer_id', ${a.employerId}, true)`;
        await tx`delete from audit_events`;
      }),
    ).rejects.toThrow(/permission denied/);
    await sql.end();
  });

  it('nem o dono do banco altera ou apaga registros originais (gatilhos)', async () => {
    const sql = ownerSql();
    await expect(sql`update punch_records set type = 'clock_out' where id = ${punchId}`).rejects.toThrow(/Registro imutável/);
    await expect(sql`delete from receipts`).rejects.toThrow(/Registro imutável/);
    await expect(sql`truncate audit_events`).rejects.toThrow(/TRUNCATE não é permitido/);
    // a exceção da retenção só zera coordenadas e exige a função controlada
    await expect(sql`update punch_records set lat = null, lng = null, accuracy_m = null, coordinates_purged_at = now(), type = 'clock_out' where id = ${punchId}`).rejects.toThrow(/Registro imutável/);
    await sql.end();
  });

  it('logs de auditoria não guardam coordenadas nem CPF', async () => {
    const sql = ownerSql();
    const rows = await sql`select metadata::text as m, summary from audit_events where employer_id = ${a.employerId}`;
    const [emp] = await sql`select cpf from employees where id = ${a.employeeId}`;
    await sql.end();
    const blob = rows.map((r) => `${r.m} ${r.summary}`).join(' ');
    expect(blob).not.toContain(emp!.cpf);
    expect(blob).not.toMatch(/-23\.55/);
  });

  it('verifica as cadeias de auditoria e de marcações', async () => {
    const res = await a.owner.post('/audit/verify');
    expect(res.body.audit.valid).toBe(true);
    expect(res.body.punches.valid).toBe(true);
  });
});
