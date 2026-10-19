/**
 * Apaga e recria o banco de DESENVOLVIMENTO (os registros de ponto são imutáveis e não aceitam TRUNCATE).
 * Recusa rodar em produção ou contra host que não seja local.
 */
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { runMigrations } from './migrate.js';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // ambiente
}
const url = process.env.DATABASE_OWNER_URL ?? '';
if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  throw new Error('db:reset só roda em desenvolvimento, contra banco local.');
}
const sql = postgres(url, { max: 1, onnotice: () => undefined });
await sql.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
await sql.end();
await runMigrations(url);
console.log('Banco de desenvolvimento recriado.');
