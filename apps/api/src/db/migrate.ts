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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.argv.includes('--test') ? process.env.TEST_DATABASE_OWNER_URL : process.env.DATABASE_OWNER_URL;
  if (!url) throw new Error('DATABASE_OWNER_URL não definida');
  await runMigrations(url);
  console.log('Migrações aplicadas.');
}
