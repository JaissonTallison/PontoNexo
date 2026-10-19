import 'reflect-metadata';
import { createSocket, type Socket } from 'node:dgram';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { NestExpressApplication } from '@nestjs/platform-express';
import postgres from 'postgres';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // CI
}
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JOBS_ENABLED = 'false';
process.env.NTP_ENABLED = 'false';
process.env.WEB_ORIGIN = 'http://localhost:5571';

const { createApp } = await import('../src/bootstrap.js');
const { MailService } = await import('../src/common/mail.service.js');
const { TimeService } = await import('../src/modules/time/time.service.js');

export { MailService, TimeService };

export async function bootApp(): Promise<NestExpressApplication> {
  const app = await createApp({ logger: false });
  await app.init();
  return app;
}

/** Conexão do dono do banco (ignora RLS), para preparar cenários e conferir efeitos. */
export const ownerSql = () => postgres(process.env.TEST_DATABASE_OWNER_URL!, { max: 2, onnotice: () => undefined });
/** Conexão do papel de aplicação (sujeito a RLS e permissões). */
export const appSql = () => postgres(process.env.TEST_DATABASE_URL!, { max: 2, onnotice: () => undefined });

/** Cliente HTTP com cookies e cabeçalho anti-CSRF, como o navegador. */
export class Client {
  readonly agent: TestAgent;
  csrf = '';
  constructor(app: NestExpressApplication) {
    this.agent = request.agent(app.getHttpServer());
  }
  private capture(res: request.Response): request.Response {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    const c = raw?.find((x) => x.startsWith('pn_csrf='));
    if (c) this.csrf = decodeURIComponent(c.split(';')[0]!.slice('pn_csrf='.length));
    return res;
  }
  get(path: string) {
    return this.agent.get(`/api${path}`);
  }
  async post(path: string, body: object = {}): Promise<request.Response> {
    return this.capture(await this.agent.post(`/api${path}`).set('x-csrf-token', this.csrf).send(body));
  }
  async put(path: string, body: object = {}): Promise<request.Response> {
    return this.capture(await this.agent.put(`/api${path}`).set('x-csrf-token', this.csrf).send(body));
  }
  async del(path: string): Promise<request.Response> {
    return this.capture(await this.agent.delete(`/api${path}`).set('x-csrf-token', this.csrf));
  }
  async login(email: string, password: string): Promise<request.Response> {
    const res = await this.post('/auth/login', { email, password });
    if (res.status !== 200) throw new Error(`login falhou: ${res.status} ${JSON.stringify(res.body)}`);
    return res;
  }
}

export const PASSWORD = 'SenhaForte123';
/** CPF fictício com dígitos verificadores válidos, derivado de um número-base. */
export function makeCpf(base: number): string {
  const d = String(100_000_000 + base).slice(-9).split('').map(Number);
  const dv = (arr: number[]) => {
    const r = (arr.reduce((acc, n, i) => acc + n * (arr.length + 1 - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  d.push(dv(d));
  d.push(dv(d));
  return d.join('');
}
export const CPFS = Array.from({ length: 12 }, (_, i) => makeCpf(123_456_70 + i * 7919));

let seq = 0;
export const uniqueEmail = (prefix: string) => `${prefix}.${Date.now()}.${++seq}@teste.pontonexo.local`;

/** Residência fictícia (centro de São Paulo). */
export const HOME = { lat: -23.55052, lng: -46.633308 };

export interface Scenario {
  owner: Client;
  employee: Client;
  employerId: string;
  employeeId: string;
  locationId: string;
  ownerEmail: string;
  employeeEmail: string;
}

/** Empregador + funcionário com contrato, local autorizado, escala seg–sex 8–17 e acesso ao app. */
export async function scenario(app: NestExpressApplication, opts: { cpfIndex?: number; contractStart?: string; compensation?: 'none' | 'lc150_bank' } = {}): Promise<Scenario> {
  const owner = new Client(app);
  const ownerEmail = uniqueEmail('titular');
  const signup = await owner.post('/auth/signup', {
    name: 'Titular de Teste',
    email: ownerEmail,
    password: PASSWORD,
    employer: { displayName: 'Residência Teste', legalName: 'Titular de Teste', cpf: CPFS[7] },
    acceptTerms: true,
  });
  if (signup.status !== 201) throw new Error(`signup: ${JSON.stringify(signup.body)}`);
  const me = await owner.get('/auth/me');
  const employerId = me.body.active.employerId as string;

  const employeeEmail = uniqueEmail('funcionaria');
  const emp = await owner.post('/employees', { fullName: 'Maria Fictícia', cpf: CPFS[opts.cpfIndex ?? 0], email: employeeEmail, createAccess: false });
  if (emp.status !== 201) throw new Error(`employee: ${JSON.stringify(emp.body)}`);
  const employeeId = emp.body.id as string;

  const contract = await owner.post(`/employees/${employeeId}/contracts`, {
    startDate: opts.contractStart ?? '2026-01-01',
    regime: 'full_time',
    weeklyHours: 44,
    residesAtWorkplace: false,
    breakReductionAgreement: false,
    compensation: opts.compensation ?? 'none',
    travelAgreement: false,
    writtenAgreementRef: opts.compensation === 'lc150_bank' ? 'Acordo de compensação assinado em 02/01/2026' : null,
  });
  if (contract.status !== 201) throw new Error(`contract: ${JSON.stringify(contract.body)}`);

  const loc = await owner.post('/locations', { name: 'Residência', kind: 'residence', addressLine: 'Endereço fictício', geofence: { ...HOME, radiusM: 100, validFrom: opts.contractStart ?? '2026-01-01' } });
  const locationId = loc.body.id as string;
  await owner.post(`/employees/${employeeId}/locations`, { locationId, validFrom: opts.contractStart ?? '2026-01-01' });

  const sched = await owner.post('/schedules', {
    name: 'Seg a sex 8h–17h',
    kind: 'weekly',
    days: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '08:00', end: '17:00', breakMinutes: 60 })),
  });
  await owner.post(`/employees/${employeeId}/schedules`, { scheduleId: sched.body.id, validFrom: opts.contractStart ?? '2026-01-01' });

  // acesso por convite: o token chega por e-mail
  const mail = app.get(MailService);
  const before = mail.sent.length;
  const access = await owner.post(`/employees/${employeeId}/access`);
  if (access.status !== 200) throw new Error(`access: ${JSON.stringify(access.body)}`);
  const msg = mail.sent.slice(before).find((m) => m.to === employeeEmail);
  const token = /token=([\w-]+)/.exec(msg?.text ?? '')?.[1];
  const reset = await new Client(app).post('/auth/password/reset', { token, password: PASSWORD });
  if (reset.status !== 200) throw new Error(`reset: ${JSON.stringify(reset.body)}`);

  const employee = new Client(app);
  await employee.login(employeeEmail, PASSWORD);
  return { owner, employee, employerId, employeeId, locationId, ownerEmail, employeeEmail };
}

export function punchBody(type: string, locationId: string | null, extra: Record<string, unknown> = {}) {
  return {
    clientRequestId: randomUUID(),
    type,
    locationId,
    positionOutcome: 'ok',
    position: { lat: HOME.lat + 0.0001, lng: HOME.lng, accuracyM: 12 },
    deviceTime: new Date().toISOString(),
    deviceTimezone: 'America/Sao_Paulo',
    offline: false,
    networkType: '4g',
    justification: null,
    ...extra,
  };
}

/** Relógio controlado do servidor. */
export function setClock(app: NestExpressApplication, isoLocal: string | null) {
  const time = app.get(TimeService);
  time.useSimulatedClock(isoLocal ? () => new Date(`${isoLocal}-03:00`) : null);
}

/** Servidor SNTP falso que responde com a hora local deslocada. */
export function fakeSntp(offsetMs: number): Promise<{ port: number; close: () => void; socket: Socket }> {
  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    socket.on('message', (msg, rinfo) => {
      const out = Buffer.alloc(48);
      out[0] = 0x24; // LI 0, VN 4, modo 4 (servidor)
      out[1] = 1; // estrato 1
      msg.copy(out, 24, 40, 48); // origem = transmissão do cliente
      const write = (offset: number) => {
        const ms = Date.now() + offsetMs;
        out.writeUInt32BE(Math.floor(ms / 1000) + 2_208_988_800, offset);
        out.writeUInt32BE(Math.floor(((ms % 1000) / 1000) * 2 ** 32), offset + 4);
      };
      write(32);
      write(40);
      socket.send(out, rinfo.port, rinfo.address);
    });
    socket.bind(0, '127.0.0.1', () => resolve({ port: socket.address().port, close: () => socket.close(), socket }));
  });
}
