import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { AuditVerification } from '@pontonexo/shared';
import type { Tx } from '../db/client.js';
import { auditEvents } from '../db/schema.js';
import { chainHash } from './crypto.js';

export type AuditCategory = 'security' | 'privileged' | 'data' | 'system';

export interface AuditInput {
  employerId: string | null;
  category: AuditCategory;
  action: string;
  actorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  ip?: string | null;
  /** Nunca inclua coordenadas, CPF, senhas ou tokens. */
  metadata?: Record<string, unknown>;
}

const auditBody = (e: { employerId: string | null; seq: number; category: string; action: string; actorUserId: string | null; entityType: string | null; entityId: string | null; summary: string; metadata: unknown; createdAt: Date }) => ({
  employerId: e.employerId,
  seq: e.seq,
  category: e.category,
  action: e.action,
  actorUserId: e.actorUserId,
  entityType: e.entityType,
  entityId: e.entityId,
  summary: e.summary,
  metadata: e.metadata,
  createdAt: e.createdAt.toISOString(),
});

/** Trilha de auditoria somente-inclusão, encadeada por hash, uma cadeia por empregador (e uma da plataforma). */
@Injectable()
export class AuditService {
  async record(tx: Tx, input: AuditInput): Promise<void> {
    const key = input.employerId ?? 'platform';
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`audit:${key}`}))`);
    const scope = input.employerId ? eq(auditEvents.employerId, input.employerId) : isNull(auditEvents.employerId);
    const [last] = await tx.select({ seq: auditEvents.seq, hash: auditEvents.hash }).from(auditEvents).where(scope).orderBy(desc(auditEvents.seq)).limit(1);
    const row = {
      employerId: input.employerId,
      seq: (last?.seq ?? 0) + 1,
      category: input.category,
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      summary: input.summary,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };
    const prevHash = last?.hash ?? 'GENESIS';
    await tx.insert(auditEvents).values({ ...row, ipAddress: input.ip ?? null, prevHash, hash: chainHash(prevHash, auditBody(row)) });
  }

  async verify(tx: Tx, employerId: string | null): Promise<AuditVerification> {
    const scope = employerId ? eq(auditEvents.employerId, employerId) : isNull(auditEvents.employerId);
    let prev = 'GENESIS';
    let expectedSeq = 1;
    let checked = 0;
    let cursor = 0;
    for (;;) {
      const batch = await tx.select().from(auditEvents).where(and(scope, gt(auditEvents.seq, cursor))).orderBy(asc(auditEvents.seq)).limit(500);
      if (batch.length === 0) break;
      for (const e of batch) {
        const ok = e.seq === expectedSeq && e.prevHash === prev && e.hash === chainHash(prev, auditBody(e));
        if (!ok) return { valid: false, checked, firstBrokenSeq: e.seq };
        prev = e.hash;
        expectedSeq++;
        checked++;
        cursor = e.seq;
      }
    }
    return { valid: true, checked, firstBrokenSeq: null };
  }
}
