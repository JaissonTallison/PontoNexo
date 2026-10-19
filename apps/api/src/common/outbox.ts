import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import { integrationOutbox, integrations } from '../db/schema.js';

export type OutboxEvent = 'punch.accepted' | 'treatment.created' | 'closing.closed';

/**
 * Enfileira o evento para cada integração ativa inscrita, na mesma transação do fato.
 * O envio é feito depois pelo despachante (entrega pelo menos uma vez). Sem coordenadas nem CPF.
 */
export async function enqueueEvent(tx: Tx, employerId: string, eventType: OutboxEvent, payload: Record<string, unknown>) {
  const targets = await tx
    .select({ id: integrations.id })
    .from(integrations)
    .where(and(eq(integrations.employerId, employerId), eq(integrations.active, true), sql`${eventType} = any(${integrations.events})`));
  if (!targets.length) return;
  await tx.insert(integrationOutbox).values(targets.map((t) => ({ employerId, integrationId: t.id, eventType, payload: { event: eventType, employerId, occurredAt: new Date().toISOString(), data: payload } })));
}
