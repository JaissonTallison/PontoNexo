import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { ROLE_PERMISSIONS, type Permission, type RoleCode } from '@pontonexo/shared';
import type { Env } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { sessions, users } from '../../db/schema.js';
import { randomToken, sha256 } from '../crypto.js';
import type { RequestMeta } from '../http.js';
import { DB, ENV } from '../tokens.js';
import type { ActiveMembership, AuthContext } from './context.js';

/** "Manter conectado": vale para funcionário e empregador, no aparelho em que foi marcado. */
const REMEMBER_DAYS = 30;
const TOUCH_INTERVAL_MS = 5 * 60_000;

interface MembershipRow extends Record<string, unknown> {
  user_role_id: string;
  employer_id: string;
  employer_name: string;
  role_code: RoleCode;
  employee_id: string | null;
  timezone: string;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async memberships(userId: string): Promise<ActiveMembership[]> {
    const rows = await this.db.execute<MembershipRow>(sql`select * from pn_user_memberships(${userId})`);
    return rows.map((r) => ({
      id: r.user_role_id,
      employerId: r.employer_id,
      employerName: r.employer_name,
      role: r.role_code,
      employeeId: r.employee_id,
      timezone: r.timezone,
    }));
  }

  expiryFor(remember: boolean): Date {
    const ms = remember ? REMEMBER_DAYS * 86_400_000 : this.env.SESSION_TTL_HOURS * 3_600_000;
    return new Date(Date.now() + ms);
  }

  async create(userId: string, membership: ActiveMembership | null, meta: RequestMeta, remember = false) {
    const token = randomToken(32);
    const csrfToken = randomToken(24);
    const expiresAt = this.expiryFor(remember);
    const [row] = await this.db
      .insert(sessions)
      .values({
        userId,
        tokenHash: sha256(token),
        csrfToken,
        activeUserRoleId: membership?.id ?? null,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        expiresAt,
      })
      .returning({ id: sessions.id });
    return { token, csrfToken, expiresAt, sessionId: row!.id };
  }

  async resolve(token: string): Promise<AuthContext | null> {
    if (token.length < 20 || token.length > 100) return null;
    const [row] = await this.db
      .select({ s: sessions, u: { id: users.id, name: users.name, email: users.email, status: users.status } })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt)))
      .limit(1);
    if (!row || row.u.status !== 'active' || row.s.expiresAt.getTime() <= Date.now()) return null;

    let membership: ActiveMembership | null = null;
    if (row.s.activeUserRoleId) {
      membership = (await this.memberships(row.u.id)).find((m) => m.id === row.s.activeUserRoleId) ?? null;
    }
    if (Date.now() - row.s.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.s.id));
    }
    const permissions: ReadonlySet<Permission> = membership ? ROLE_PERMISSIONS[membership.role] : new Set();
    return {
      userId: row.u.id,
      userName: row.u.name,
      email: row.u.email,
      sessionId: row.s.id,
      csrfToken: row.s.csrfToken,
      membership,
      permissions,
    };
  }

  async setActive(sessionId: string, membership: ActiveMembership) {
    await this.db.update(sessions).set({ activeUserRoleId: membership.id }).where(eq(sessions.id, sessionId));
  }

  async revoke(sessionId: string, userId: string) {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  async revokeAll(userId: string, exceptSessionId?: string) {
    const conds = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
    if (exceptSessionId) conds.push(ne(sessions.id, exceptSessionId));
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(and(...conds));
  }
}
