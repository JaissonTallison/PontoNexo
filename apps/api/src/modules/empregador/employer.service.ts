import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { maskCpf, ROLE_LABEL, type RoleCode } from '@pontonexo/shared';
import type { z } from 'zod';
import type { employerUpdateSchema, inviteUserSchema } from '@pontonexo/shared';
import type { Env } from '../../config/env.js';
import type { Database } from '../../db/client.js';
import { employers, userRoles, users } from '../../db/schema.js';
import { AuditService } from '../../common/audit.service.js';
import type { EmployerScope } from '../../common/auth/decorators.js';
import { conflict, forbidden, notFound } from '../../common/errors.js';
import type { RequestMeta } from '../../common/http.js';
import { MailService } from '../../common/mail.service.js';
import { TenantDb } from '../../common/tenant.js';
import { DB, ENV } from '../../common/tokens.js';
import { changedFields } from '../../common/util.js';
import { AuthService } from '../auth/auth.service.js';

@Injectable()
export class EmployerService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly tenant: TenantDb,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
    private readonly mail: MailService,
  ) {}

  async get(scope: EmployerScope) {
    return this.tenant.run(scope.membership.employerId, async (tx) => {
      const [e] = await tx.select().from(employers).where(eq(employers.id, scope.membership.employerId));
      if (!e) throw notFound('Empregador');
      return {
        id: e.id,
        displayName: e.displayName,
        legalName: e.legalName,
        documentMasked: maskCpf(e.documentCpf),
        timezone: e.timezone,
        addressLine: e.addressLine,
        city: e.city,
        state: e.state,
      };
    });
  }

  async update(scope: EmployerScope, input: z.infer<typeof employerUpdateSchema>, meta: RequestMeta) {
    const id = scope.membership.employerId;
    await this.tenant.run(id, async (tx) => {
      const [before] = await tx.select().from(employers).where(eq(employers.id, id));
      if (!before) throw notFound('Empregador');
      const patch = { ...input, addressLine: input.addressLine ?? null, city: input.city ?? null, state: input.state ?? null };
      await tx.update(employers).set({ ...patch, updatedAt: new Date() }).where(eq(employers.id, id));
      await this.audit.record(tx, {
        employerId: id,
        category: 'privileged',
        action: 'employer.updated',
        actorUserId: scope.userId,
        entityType: 'employer',
        entityId: id,
        summary: 'Dados do empregador atualizados',
        ip: meta.ip,
        metadata: { fields: changedFields(before, patch) },
      });
    });
    return this.get(scope);
  }

  async listUsers(scope: EmployerScope) {
    const rows = await this.db
      .select({ ur: userRoles, u: { id: users.id, name: users.name, email: users.email, status: users.status, hasPassword: sql<boolean>`${users.passwordHash} is not null`, lastLoginAt: users.lastLoginAt } })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(eq(userRoles.employerId, scope.membership.employerId))
      .orderBy(users.name);
    return rows.map(({ ur, u }) => ({
      id: ur.id,
      userId: u.id,
      name: u.name,
      email: u.email,
      role: ur.roleCode as RoleCode,
      roleLabel: ROLE_LABEL[ur.roleCode as RoleCode],
      active: ur.active && u.status === 'active',
      invitePending: !u.hasPassword,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      employeeId: ur.employeeId,
      isSelf: u.id === scope.userId,
    }));
  }

  /** Convida gestor delegado ou contador. Funcionários recebem acesso pelo cadastro do funcionário. */
  async inviteUser(scope: EmployerScope, input: z.infer<typeof inviteUserSchema>, meta: RequestMeta) {
    const employerId = scope.membership.employerId;
    let [user] = await this.db.select().from(users).where(sql`lower(${users.email}) = ${input.email}`);
    if (user) {
      const [existing] = await this.db.select().from(userRoles).where(and(eq(userRoles.userId, user.id), eq(userRoles.employerId, employerId)));
      if (existing) throw conflict('ALREADY_MEMBER', 'Este e-mail já tem acesso a este empregador.');
    } else {
      [user] = await this.db.insert(users).values({ name: input.name, email: input.email }).returning();
    }
    const [ur] = await this.db.insert(userRoles).values({ userId: user!.id, employerId, roleCode: input.role, createdByUserId: scope.userId }).returning();
    await this.sendAccessEmail(user!.id, user!.email, user!.name, !user!.passwordHash, scope.membership.employerName, ROLE_LABEL[input.role]);
    await this.tenant.run(employerId, (tx) =>
      this.audit.record(tx, {
        employerId,
        category: 'privileged',
        action: 'user.invited',
        actorUserId: scope.userId,
        entityType: 'user_role',
        entityId: ur!.id,
        summary: `Acesso concedido como ${ROLE_LABEL[input.role]}`,
        ip: meta.ip,
        metadata: { role: input.role },
      }),
    );
    return { id: ur!.id };
  }

  async sendAccessEmail(userId: string, email: string, name: string, needsPassword: boolean, employerName: string, roleLabel: string) {
    if (needsPassword) {
      const token = await this.authService.issueToken(userId, 'invite');
      await this.mail.send({
        to: email,
        subject: `PontoNexo · acesso a ${employerName}`,
        text: `Olá, ${name}.\n\nVocê recebeu acesso ao PontoNexo de ${employerName} como ${roleLabel}.\nDefina sua senha pelo link (vale por 72 horas):\n${this.env.WEB_ORIGIN}/redefinir-senha?token=${token}&convite=1`,
      });
    } else {
      await this.mail.send({
        to: email,
        subject: `PontoNexo · acesso a ${employerName}`,
        text: `Olá, ${name}.\n\nVocê recebeu acesso ao PontoNexo de ${employerName} como ${roleLabel}. Entre com sua senha atual em ${this.env.WEB_ORIGIN}/entrar.`,
      });
    }
  }

  async setUserActive(scope: EmployerScope, userRoleId: string, active: boolean, meta: RequestMeta) {
    const employerId = scope.membership.employerId;
    const [ur] = await this.db.select().from(userRoles).where(and(eq(userRoles.id, userRoleId), eq(userRoles.employerId, employerId)));
    if (!ur) throw notFound('Usuário');
    if (ur.userId === scope.userId) throw forbidden('Você não pode alterar o próprio acesso.');
    if (ur.roleCode === 'employer_owner') throw forbidden('O acesso do titular não pode ser desativado.');
    await this.db.update(userRoles).set({ active }).where(eq(userRoles.id, ur.id));
    await this.tenant.run(employerId, (tx) =>
      this.audit.record(tx, {
        employerId,
        category: 'privileged',
        action: active ? 'user.reactivated' : 'user.deactivated',
        actorUserId: scope.userId,
        entityType: 'user_role',
        entityId: ur.id,
        summary: active ? 'Acesso reativado' : 'Acesso desativado',
        ip: meta.ip,
      }),
    );
  }
}
