import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { runMigrations } from '../src/db/migrate.js';

/** Recria o banco de testes do zero e aplica todas as migrações (valida também a instalação limpa). */
export default async function setup() {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
  } catch {
    // CI: variáveis do ambiente
  }
  const ownerUrl = process.env.TEST_DATABASE_OWNER_URL;
  if (!ownerUrl) throw new Error('TEST_DATABASE_OWNER_URL não definida');
  const sql = postgres(ownerUrl, { max: 1, onnotice: () => undefined });
  await sql.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await sql.end();
  await runMigrations(ownerUrl);
}
