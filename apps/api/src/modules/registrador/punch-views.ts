import { and, asc, desc, eq, gte, inArray, lt, type SQL } from 'drizzle-orm';
import type { PunchAlertView, PunchView, ReceiptPayload, ReceiptView } from '@pontonexo/shared';
import type { Tx } from '../../db/client.js';
import { employees, punchAlerts, punchRecords, receipts, treatments } from '../../db/schema.js';

type PunchRow = typeof punchRecords.$inferSelect;
type ReceiptRow = typeof receipts.$inferSelect;

export const receiptView = (r: ReceiptRow): ReceiptView => ({
  id: r.id,
  code: r.code,
  issuedAt: r.issuedAt.toISOString(),
  payload: r.payload as ReceiptPayload,
  hash: r.hash,
  signature: r.signature,
  keyId: r.keyId,
  algorithm: 'Ed25519',
});

/** Monta as visões de marcação com ocorrências, comprovante e indicação de desconsideração. */
export async function punchViews(tx: Tx, rows: PunchRow[]): Promise<PunchView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const alerts = await tx.select().from(punchAlerts).where(inArray(punchAlerts.punchRecordId, ids)).orderBy(asc(punchAlerts.createdAt));
  const recs = await tx.select({ punchRecordId: receipts.punchRecordId, code: receipts.code }).from(receipts).where(inArray(receipts.punchRecordId, ids));
  const dis = await tx.select({ punchRecordId: treatments.punchRecordId }).from(treatments).where(and(eq(treatments.kind, 'disregard'), inArray(treatments.punchRecordId, ids)));
  const empIds = [...new Set(rows.map((r) => r.employeeId))];
  const emps = await tx.select({ id: employees.id, fullName: employees.fullName }).from(employees).where(inArray(employees.id, empIds));
  const disregarded = new Set(dis.map((d) => d.punchRecordId));
  return rows.map((p) => ({
    id: p.id,
    nsr: p.nsr,
    type: p.type,
    serverTime: p.serverTime.toISOString(),
    deviceTime: p.deviceTime?.toISOString() ?? null,
    origin: p.origin,
    clockStatus: p.clockStatus,
    locationId: p.locationId,
    locationName: p.locationName,
    geoStatus: p.geoStatus,
    distanceM: p.distanceM,
    accuracyM: p.accuracyM,
    justification: p.justification,
    disregarded: disregarded.has(p.id),
    alerts: alerts
      .filter((a) => a.punchRecordId === p.id)
      .map((a): PunchAlertView => ({ id: a.id, code: a.code, detail: a.detail, status: a.status, reviewNote: a.reviewNote })),
    receiptCode: recs.find((r) => r.punchRecordId === p.id)?.code ?? '',
    employeeId: p.employeeId,
    employeeName: emps.find((e) => e.id === p.employeeId)?.fullName ?? '',
  }));
}

export async function punchesBetween(tx: Tx, employeeId: string, from: Date, to: Date, extra?: SQL) {
  const conds = [eq(punchRecords.employeeId, employeeId), gte(punchRecords.serverTime, from), lt(punchRecords.serverTime, to)];
  if (extra) conds.push(extra);
  return tx.select().from(punchRecords).where(and(...conds)).orderBy(asc(punchRecords.serverTime));
}

export async function lastPunch(tx: Tx, employeeId: string) {
  const [p] = await tx.select().from(punchRecords).where(eq(punchRecords.employeeId, employeeId)).orderBy(desc(punchRecords.serverTime)).limit(1);
  return p ?? null;
}
