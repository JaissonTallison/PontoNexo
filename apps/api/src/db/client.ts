import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Schema = typeof schema;
export type Database = PostgresJsDatabase<Schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Banco ou transação: as consultas aceitam qualquer um dos dois. */
export type Executor = Database | Tx;

export function createDatabase(url: string, max = 10) {
  const client = postgres(url, { max, onnotice: () => undefined, connection: { TimeZone: 'UTC' } });
  const db = drizzle(client, { schema, casing: 'snake_case' });
  return { db, client };
}
