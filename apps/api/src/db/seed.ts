/**
 * Dados FICTÍCIOS para desenvolvimento. Nenhuma pessoa, CPF ou endereço real.
 * Uso: pnpm db:seed   (recusa rodar em produção; não duplica se já existir)
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import request from 'supertest';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // ambiente
}
if (process.env.NODE_ENV === 'production') throw new Error('Seed recusado em produção.');
process.env.JOBS_ENABLED = 'false';
process.env.NTP_ENABLED = 'false';
process.env.PN_SEEDING = 'true';

const { createApp } = await import('../bootstrap.js');
const { TimeService } = await import('../modules/time/time.service.js');
const { hashPassword } = await import('../modules/auth/auth.service.js');
const { addDays, isoWeekday, localDate } = await import('@pontonexo/shared');

const SENHA = 'PontoNexo2026';
const TZ = 'America/Sao_Paulo';
const owner = postgres(process.env.DATABASE_OWNER_URL!, { max: 1, onnotice: () => undefined });
const [exists] = await owner`select id from users where lower(email) = 'titular@pontonexo.local'`;
if (exists) {
  console.log('Seed já aplicado (titular@pontonexo.local existe). Nada a fazer.');
  await owner.end();
  process.exit(0);
}

const app = await createApp({ logger: false });
await app.init();
const time = app.get(TimeService);
const server = app.getHttpServer();
const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5571';

function client() {
  const agent = request.agent(server);
  let csrf = '';
  const take = (res: request.Response, where: string) => {
    const c = (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((x) => x.startsWith('pn_csrf='));
    if (c) csrf = decodeURIComponent(c.split(';')[0]!.slice(8));
    if (res.status >= 400) throw new Error(`${where}: ${res.status} ${JSON.stringify(res.body)}`);
    return res;
  };
  return {
    get: async (p: string) => take(await agent.get(`/api${p}`), `GET ${p}`),
    post: async (p: string, body: object = {}) => take(await agent.post(`/api${p}`).set('x-csrf-token', csrf).set('origin', origin).send(body), `POST ${p}`),
  };
}

const cpf = (base: number) => {
  const d = String(base).padStart(9, '0').split('').map(Number);
  const dv = (a: number[]) => {
    const r = (a.reduce((s, n, i) => s + n * (a.length + 1 - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  d.push(dv(d));
  d.push(dv(d));
  return d.join('');
};

const titular = client();
await titular.post('/auth/signup', {
  name: 'Helena Duarte (fictícia)',
  email: 'titular@pontonexo.local',
  password: SENHA,
  employer: { displayName: 'Residência Duarte', legalName: 'Helena Duarte (fictícia)', cpf: cpf(314159265) },
  acceptTerms: true,
});
await titular.post('/users/invite', { name: 'Ricardo Duarte (fictício)', email: 'gestor@pontonexo.local', role: 'employer_manager' });
await titular.post('/users/invite', { name: 'Escritório Contábil Exemplo', email: 'contador@pontonexo.local', role: 'accountant' });

const cozinheira = (await titular.post('/job-roles', { name: 'Cozinheira', description: 'Preparo das refeições da família' })).body.id;
const cuidador = (await titular.post('/job-roles', { name: 'Cuidador', description: 'Acompanhamento noturno de pessoa idosa' })).body.id;

const res = (await titular.post('/locations', { name: 'Residência', kind: 'residence', addressLine: 'Endereço fictício, São Paulo/SP', geofence: { lat: -23.561414, lng: -46.655881, radiusM: 100, validFrom: '2026-01-01' } })).body.id;
const campo = (await titular.post('/locations', { name: 'Casa de campo', kind: 'external', addressLine: 'Endereço fictício, Atibaia/SP', geofence: { lat: -23.116932, lng: -46.550191, radiusM: 150, validFrom: '2026-01-01' } })).body.id;
const viagem = (await titular.post('/locations', { name: 'Acompanhamento em viagem', kind: 'travel', addressLine: null, geofence: null })).body.id;

const semana = (await titular.post('/schedules', {
  name: 'Seg a sex 8h–17h, sáb 8h–12h',
  kind: 'weekly',
  days: [...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '08:00', end: '17:00', breakMinutes: 60 })), { weekday: 6, start: '08:00', end: '12:00', breakMinutes: 0 }],
})).body.id;
const plantao = (await titular.post('/schedules', { name: 'Plantão 12×36 noturno', kind: 'cycle_12x36', cycleAnchorDate: '2026-09-01', cycleStart: '19:00', cycleEnd: '07:00', cycleBreakMinutes: 60 })).body.id;
await titular.post('/holidays', { date: '2026-01-25', name: 'Aniversário de São Paulo', scope: 'municipal' });

const maria = (await titular.post('/employees', { fullName: 'Maria Aparecida Souza (fictícia)', cpf: cpf(271828182), email: 'maria@pontonexo.local', phone: '(11) 90000-0001', jobRoleId: cozinheira })).body.id;
const jose = (await titular.post('/employees', { fullName: 'José Carlos Lima (fictício)', cpf: cpf(161803398), email: 'jose@pontonexo.local', phone: '(11) 90000-0002', jobRoleId: cuidador })).body.id;

await titular.post(`/employees/${maria}/contracts`, { jobRoleId: cozinheira, startDate: '2025-03-10', regime: 'full_time', weeklyHours: 44, residesAtWorkplace: false, breakReductionAgreement: false, compensation: 'lc150_bank', travelAgreement: true, writtenAgreementRef: 'Acordo de compensação e de viagem assinados em 10/03/2025' });
await titular.post(`/employees/${jose}/contracts`, { jobRoleId: cuidador, startDate: '2026-08-01', regime: 'shift_12x36', weeklyHours: 42, residesAtWorkplace: false, breakReductionAgreement: false, compensation: 'none', travelAgreement: false, writtenAgreementRef: 'Acordo 12x36 assinado em 01/08/2026' });
for (const l of [res, campo, viagem]) await titular.post(`/employees/${maria}/locations`, { locationId: l, validFrom: '2026-01-01' });
await titular.post(`/employees/${jose}/locations`, { locationId: res, validFrom: '2026-08-01' });
await titular.post(`/employees/${maria}/schedules`, { scheduleId: semana, validFrom: '2026-01-01' });
await titular.post(`/employees/${jose}/schedules`, { scheduleId: plantao, validFrom: '2026-08-01' });
await titular.post(`/employees/${maria}/access`);
await titular.post(`/employees/${jose}/access`);

// senhas definidas direto (no uso real, cada pessoa define a sua pelo link do e-mail)
const hash = await hashPassword(SENHA);
await owner`update users set password_hash = ${hash} where lower(email) like '%@pontonexo.local' and password_hash is null`;

const mariaApp = client();
await mariaApp.post('/auth/login', { email: 'maria@pontonexo.local', password: SENHA });
const joseApp = client();
await joseApp.post('/auth/login', { email: 'jose@pontonexo.local', password: SENHA });

const HOME = { lat: -23.561414, lng: -46.655881 };
const jitter = (seed: number, max: number) => ((seed * 7919) % (2 * max + 1)) - max;
const punch = async (c: ReturnType<typeof client>, local: string, type: string, extra: Record<string, unknown> = {}) => {
  const at = new Date(`${local}:00-03:00`);
  time.useSimulatedClock(() => at);
  await c.post('/me/punches', {
    clientRequestId: randomUUID(),
    type,
    locationId: res,
    positionOutcome: 'ok',
    position: { lat: HOME.lat + 0.00012, lng: HOME.lng - 0.0001, accuracyM: 14 },
    deviceTime: at.toISOString(),
    deviceTimezone: TZ,
    offline: false,
    networkType: 'wifi',
    justification: null,
    ...extra,
  });
};
const hm = (base: string, deltaMin: number) => {
  const [h, m] = base.split(':').map(Number);
  const t = h! * 60 + m! + deltaMin;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

const today = localDate(new Date(), TZ);
let n = 0;
for (let d = '2026-09-01'; d < today; d = addDays(d, 1)) {
  n++;
  const wd = isoWeekday(d);
  if (wd === 7) continue;
  if (d === '2026-09-07' || d === '2026-10-12') continue; // feriados nacionais
  if (d === '2026-09-23') continue; // falta para exemplo de abono
  if (wd === 6) {
    await punch(mariaApp, `${d}T${hm('08:00', jitter(n, 4))}`, 'clock_in');
    await punch(mariaApp, `${d}T${hm('12:00', jitter(n + 1, 5))}`, 'clock_out');
    continue;
  }
  await punch(mariaApp, `${d}T${hm('08:00', jitter(n, 6))}`, 'clock_in');
  if (d === '2026-09-16') {
    await punch(mariaApp, `${d}T10:05`, 'break_start', { position: { lat: HOME.lat + 0.006, lng: HOME.lng, accuracyM: 9 }, justification: 'Fui ao mercado comprar ingredientes a pedido da família' });
    await punch(mariaApp, `${d}T10:25`, 'break_end');
  }
  await punch(mariaApp, `${d}T${hm('12:00', jitter(n + 2, 7))}`, 'break_start');
  await punch(mariaApp, `${d}T${hm('13:00', jitter(n + 3, 6))}`, 'break_end');
  if (d === '2026-10-08') continue; // esqueceu a saída
  await punch(mariaApp, `${d}T${hm('17:00', jitter(n + 4, 12) + (d === '2026-09-29' ? 75 : 0))}`, 'clock_out');
}

// José: plantões 12x36 noturnos (atravessam a meia-noite)
for (let d = '2026-09-01'; d < addDays(today, -1); d = addDays(d, 2)) {
  await punch(joseApp, `${d}T${hm('19:00', jitter(n++, 5))}`, 'clock_in');
  await punch(joseApp, `${addDays(d, 1)}T01:00`, 'break_start');
  await punch(joseApp, `${addDays(d, 1)}T02:00`, 'break_end');
  await punch(joseApp, `${addDays(d, 1)}T${hm('07:00', jitter(n++, 6))}`, 'clock_out');
}
time.useSimulatedClock(null);

// pendências para explorar o fluxo
await mariaApp.post('/corrections', { kind: 'include_punch', proposedType: 'clock_out', proposedTime: new Date('2026-10-08T17:05:00-03:00').toISOString(), reason: 'Esqueci de registrar a saída no dia 08/10; saí às 17h05.' });
await mariaApp.post('/corrections', { kind: 'justify_absence', absenceDate: '2026-09-23', reason: 'Consulta médica; atestado entregue à empregadora.' });

await app.close();
await owner.end();
console.log(`Seed concluído. Acesso (senha ${SENHA}):
  titular@pontonexo.local  — empregadora (painel)
  gestor@pontonexo.local   — gestor delegado
  contador@pontonexo.local — contador (somente leitura)
  maria@pontonexo.local    — funcionária (app)
  jose@pontonexo.local     — funcionário 12x36 (app)`);
