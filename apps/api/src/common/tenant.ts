import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database, Tx } from '../db/client.js';
import { DB } from './tokens.js';

/**
 * Toda consulta a dados de um empregador roda dentro de uma transação com `app.employer_id`
 * definido (SET LOCAL). A RLS do banco recusa linhas de outro empregador mesmo que um filtro
 * seja esquecido no código.
 */
@Injectable()
export class TenantDb {
  constructor(@Inject(DB) readonly db: Database) {}

  run<T>(employerId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.employer_id', ${employerId}, true)`);
      return fn(tx);
    });
  }

  /** Contexto da plataforma: não enxerga dados de nenhum empregador. */
  platform<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.employer_id', '', true)`);
      return fn(tx);
    });
  }
}
