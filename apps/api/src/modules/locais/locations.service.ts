import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { addDays, type geofenceSchema, type locationCreateSchema, type locationUpdateSchema } from '@pontonexo/shared';
import type { z } from 'zod';
import type { Tx } from '../../db/client.js';
import { employeeWorkLocations, geofences, workLocations } from '../../db/schema.js';
import { AuditService } from '../../common/audit.service.js';
import type { EmployerScope } from '../../common/auth/decorators.js';
import { conflict, notFound } from '../../common/errors.js';
import type { RequestMeta } from '../../common/http.js';
import { TenantDb } from '../../common/tenant.js';
import { todayIn } from '../../common/util.js';

/** Cerca vigente na data (a mais recente iniciada até ela). */
export async function activeGeofence(tx: Tx, locationId: string, date: string) {
  const rows = await tx
    .select()
    .from(geofences)
    .where(and(eq(geofences.locationId, locationId), lte(geofences.validFrom, date), or(isNull(geofences.validTo), gte(geofences.validTo, date))))
    .orderBy(asc(geofences.validFrom), asc(geofences.createdAt));
  return rows[rows.length - 1] ?? null;
}

@Injectable()
export class LocationsService {
  constructor(
    private readonly tenant: TenantDb,
    private readonly audit: AuditService,
  ) {}

  async list(scope: EmployerScope) {
    const { employerId, timezone } = scope.membership;
    const today = todayIn(timezone);
    return this.tenant.run(employerId, async (tx) => {
      const locs = await tx.select().from(workLocations).where(eq(workLocations.employerId, employerId)).orderBy(asc(workLocations.name));
      const counts = await tx
        .select({ locationId: employeeWorkLocations.locationId, n: count() })
        .from(employeeWorkLocations)
        .where(
          and(
            eq(employeeWorkLocations.employerId, employerId),
            isNull(employeeWorkLocations.revokedAt),
            lte(employeeWorkLocations.validFrom, today),
            or(isNull(employeeWorkLocations.validTo), gte(employeeWorkLocations.validTo, today)),
          ),
        )
        .groupBy(employeeWorkLocations.locationId);
      const out = [];
      for (const l of locs) {
        const fence = await activeGeofence(tx, l.id, today);
        out.push({
          id: l.id,
          name: l.name,
          kind: l.kind,
          addressLine: l.addressLine,
          active: l.active,
          geofence: fence ? { id: fence.id, lat: fence.centerLat, lng: fence.centerLng, radiusM: fence.radiusM, validFrom: fence.validFrom } : null,
          authorizedEmployees: counts.find((c) => c.locationId === l.id)?.n ?? 0,
        });
      }
      return out;
    });
  }

  async get(scope: EmployerScope, id: string) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const [l] = await tx.select().from(workLocations).where(and(eq(workLocations.id, id), eq(workLocations.employerId, employerId)));
      if (!l) throw notFound('Local');
      const history = await tx.select().from(geofences).where(eq(geofences.locationId, id)).orderBy(asc(geofences.validFrom), asc(geofences.createdAt));
      return {
        ...l,
        createdAt: l.createdAt.toISOString(),
        geofences: history.map((g) => ({ id: g.id, lat: g.centerLat, lng: g.centerLng, radiusM: g.radiusM, validFrom: g.validFrom, validTo: g.validTo, createdAt: g.createdAt.toISOString() })),
      };
    });
  }

  async create(scope: EmployerScope, input: z.infer<typeof locationCreateSchema>, meta: RequestMeta) {
    const { employerId, timezone } = scope.membership;
    if (input.kind !== 'travel' && !input.geofence) throw conflict('GEOFENCE_REQUIRED', 'Residência e locais externos precisam de cerca virtual.');
    return this.tenant.run(employerId, async (tx) => {
      const [loc] = await tx.insert(workLocations).values({ employerId, name: input.name, kind: input.kind, addressLine: input.addressLine ?? null }).returning();
      if (input.geofence) {
        await tx.insert(geofences).values({
          employerId,
          locationId: loc!.id,
          centerLat: round6(input.geofence.lat),
          centerLng: round6(input.geofence.lng),
          radiusM: input.geofence.radiusM,
          validFrom: input.geofence.validFrom ?? todayIn(timezone),
          createdByUserId: scope.userId,
        });
      }
      await this.audit.record(tx, {
        employerId,
        category: 'data',
        action: 'location.created',
        actorUserId: scope.userId,
        entityType: 'work_location',
        entityId: loc!.id,
        summary: `Local "${input.name}" cadastrado`,
        ip: meta.ip,
        metadata: { kind: input.kind, radiusM: input.geofence?.radiusM ?? null },
      });
      return { id: loc!.id };
    });
  }

  async update(scope: EmployerScope, id: string, input: z.infer<typeof locationUpdateSchema>, meta: RequestMeta) {
    const { employerId } = scope.membership;
    await this.tenant.run(employerId, async (tx) => {
      const res = await tx
        .update(workLocations)
        .set({ name: input.name, addressLine: input.addressLine ?? null, active: input.active })
        .where(and(eq(workLocations.id, id), eq(workLocations.employerId, employerId)))
        .returning({ id: workLocations.id });
      if (!res.length) throw notFound('Local');
      await this.audit.record(tx, { employerId, category: 'data', action: 'location.updated', actorUserId: scope.userId, entityType: 'work_location', entityId: id, summary: 'Local atualizado', ip: meta.ip, metadata: { active: input.active } });
    });
  }

  /** Nova versão da cerca. A anterior é encerrada no dia anterior; marcações antigas guardam a cerca usada. */
  async newGeofence(scope: EmployerScope, locationId: string, input: z.infer<typeof geofenceSchema>, meta: RequestMeta) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const [loc] = await tx.select().from(workLocations).where(and(eq(workLocations.id, locationId), eq(workLocations.employerId, employerId)));
      if (!loc) throw notFound('Local');
      const open = await tx.select().from(geofences).where(and(eq(geofences.locationId, locationId), isNull(geofences.validTo)));
      for (const g of open) {
        if (g.validFrom > input.validFrom) throw conflict('GEOFENCE_OVERLAP', 'Já existe uma cerca com início posterior a esta data.');
        await tx.update(geofences).set({ validTo: g.validFrom === input.validFrom ? g.validFrom : addDays(input.validFrom, -1) }).where(eq(geofences.id, g.id));
      }
      const [created] = await tx
        .insert(geofences)
        .values({ employerId, locationId, centerLat: round6(input.lat), centerLng: round6(input.lng), radiusM: input.radiusM, validFrom: input.validFrom, createdByUserId: scope.userId })
        .returning({ id: geofences.id });
      await this.audit.record(tx, {
        employerId,
        category: 'data',
        action: 'geofence.created',
        actorUserId: scope.userId,
        entityType: 'geofence',
        entityId: created!.id,
        summary: `Cerca do local "${loc.name}" redefinida (raio ${input.radiusM} m)`,
        ip: meta.ip,
        metadata: { radiusM: input.radiusM, validFrom: input.validFrom },
      });
      return { id: created!.id };
    });
  }
}

export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
