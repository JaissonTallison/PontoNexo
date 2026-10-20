import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const rootEnv = fileURLToPath(new URL('../../../../.env', import.meta.url));
try {
  process.loadEnvFile(rootEnv);
} catch {
  // em produção as variáveis vêm do ambiente
}

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  DATABASE_OWNER_URL: z.string().optional(),
  API_PORT: z.coerce.number().int().default(5570),
  WEB_ORIGIN: z.string().default('http://localhost:5571'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  COOKIE_SECURE: bool.default(false),
  RECEIPT_SIGNING_KEY: z.string().min(40, 'RECEIPT_SIGNING_KEY ausente: rode pnpm chaves:gerar'),
  RECEIPT_KEY_ID: z.string().default('dev-1'),
  APP_ENCRYPTION_KEY: z.string().min(40, 'APP_ENCRYPTION_KEY ausente: rode pnpm chaves:gerar'),
  NTP_SERVERS: z.string().default('a.ntp.br,b.ntp.br,c.ntp.br'),
  NTP_MAX_OFFSET_MS: z.coerce.number().int().default(2000),
  NTP_CHECK_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(10),
  NTP_ENABLED: bool.default(true),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(5575),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('PontoNexo <nao-responda@pontonexo.local>'),
  /** smtp (desenvolvimento, Mailpit) ou brevo (API por HTTPS; hospedagens como o Railway bloqueiam SMTP) */
  MAIL_PROVIDER: z.enum(['smtp', 'brevo']).default('smtp'),
  BREVO_API_KEY: z.string().optional(),
  JOBS_ENABLED: bool.default(true),
  APP_VERSION: z.string().default('0.1.0'),
  SIGNUP_ENABLED: bool.default(true),
  TRUST_PROXY: bool.default(false),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:suporte@pontonexo.local'),
  REMINDERS_ENABLED: bool.default(true),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  // hospedagens como o Railway informam a porta em PORT
  const fromHost = process.env.API_PORT ?? process.env.PORT;
  const parsed = schema.safeParse({ ...process.env, ...(fromHost ? { API_PORT: fromHost } : {}), ...overrides });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${msg}`);
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.COOKIE_SECURE) {
    throw new Error('Em produção COOKIE_SECURE precisa ser true (HTTPS obrigatório).');
  }
  return parsed.data;
}
