import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, punchBody, scenario, setClock, type Scenario } from './helpers.js';

/**
 * Funcionário cadastrado com o contrato em 01/09 que só começou a usar o app em 03/09:
 * 01 e 02/09 não podem aparecer como falta nem tirar horas; do 03/09 em diante a regra é a normal.
 */
describe('faltas só contam a partir da primeira marcação', () => {
  let app: NestExpressApplication;
  let s: Scenario;
  beforeAll(async () => {
    app = await bootApp();
    s = await scenario(app, { cpfIndex: 10, contractStart: '2026-09-01' });
    for (const [t, type] of [['2026-09-03T08:00:00', 'clock_in'], ['2026-09-03T17:00:00', 'clock_out']] as const) {
      setClock(app, t);
      await s.employee.post('/me/punches', punchBody(type, s.locationId));
    }
    setClock(app, null);
  });
  afterAll(async () => app.close());

  it('dias de trabalho antes da 1ª marcação ficam "antes do início", sem falta nem horas negativas', async () => {
    const t = await s.owner.get(`/timesheets/${s.employeeId}?month=2026-09`);
    expect(t.status).toBe(200);
    const day = (d: string) => t.body.days.find((x: { date: string }) => x.date === d);
    for (const d of ['2026-09-01', '2026-09-02']) {
      expect(day(d).expected.kind).toBe('not_started');
      expect(day(d).deficitSeconds).toBe(0);
    }
    // 04/09 (sexta) já é depois do início: sem marcação é falta
    expect(day('2026-09-04').expected.kind).toBe('workday');
    expect(day('2026-09-04').deficitSeconds).toBeGreaterThan(0);
    // previsto do mês não conta 01 e 02/09
    const previstoDia = day('2026-09-04').expected.expectedSeconds;
    const diasUteisAPartirDe3 = t.body.days.filter((x: { date: string; expected: { kind: string } }) => x.date >= '2026-09-03' && x.expected.kind === 'workday').length;
    expect(t.body.totals.expectedSeconds).toBe(previstoDia * diasUteisAPartirDe3);
    expect(t.body.days.filter((x: { date: string; issues: Array<{ code: string }> }) => x.date < '2026-09-03' && x.issues.some((i) => i.code === 'absence'))).toHaveLength(0);
  });
});
