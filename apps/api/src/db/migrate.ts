import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from './client.js';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // variáveis do ambiente
}

/** Aplica as migrações com o papel dono. `--test` usa o banco de testes. */
export async function runMigrations(url: string) {
  const { db, client } = createDatabase(url, 1);
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
  } finally {
    await client.end();
  }
}

/**
 * Garante o papel de aplicação (sem posse de tabelas, sujeito à RLS) antes das migrações.
 * Em desenvolvimento quem cria é o infra/postgres/init; em hospedagem gerenciada (Railway) é este passo.
 */
export async function ensureAppRole(url: string, user: string, password: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(user)) throw new Error('APP_DB_USER inválido');
  const { client } = createDatabase(url, 1);
  try {
    const exists = await client`SELECT 1 FROM pg_roles WHERE rolname = ${user}`;
    const pw = password.replace(/'/g, "''");
    if (!exists.length) await client.unsafe(`CREATE ROLE ${user} LOGIN PASSWORD '${pw}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    else await client.unsafe(`ALTER ROLE ${user} WITH LOGIN PASSWORD '${pw}'`);
    const [row] = await client<Array<{ db: string }>>`SELECT current_database() AS db`;
    if (row) await client.unsafe(`GRANT CONNECT ON DATABASE "${row.db.replace(/"/g, '""')}" TO ${user}`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.argv.includes('--test') ? process.env.TEST_DATABASE_OWNER_URL : process.env.DATABASE_OWNER_URL;
  if (!url) throw new Error('DATABASE_OWNER_URL não definida');
  if (process.env.APP_DB_PASSWORD) await ensureAppRole(url, process.env.APP_DB_USER ?? 'pontonexo_app', process.env.APP_DB_PASSWORD);
  await runMigrations(url);
  console.log('Migrações aplicadas.');
}
