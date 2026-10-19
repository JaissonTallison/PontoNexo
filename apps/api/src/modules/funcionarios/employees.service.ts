import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import {
  addDays,
  maskCpf,
  type contractCreateSchema,
  type contractEndSchema,
  type employeeCreateSchema,
  type employeeListQuery,
  type employeeLocationSchema,
  type employeeScheduleSchema,
  type employeeUpdateSchema,
  type jobRoleSchema,
} from '@pontonexo/shared';
import type { z } from 'zod';
import type { Database, Tx } from '../../db/client.js';
import {
  employees,
  employeeSchedules,
  employeeWorkLocations,
  employmentContracts,
  jobRoles,
  userRoles,
  users,
  workLocations,
  workSchedules,
  workSessions,
} from '../../db/schema.js';
import { AuditService } from '../../common/audit.service.js';
import type { EmployerScope } from '../../common/auth/decorators.js';
import { conflict, notFound, unprocessable } from '../../common/errors.js';
import type { RequestMeta } from '../../common/http.js';
import { TenantDb } from '../../common/tenant.js';
import { DB } from '../../common/tokens.js';
import { changedFields, offsetOf, todayIn, toPage } from '../../common/util.js';
import { EmployerService } from '../empregador/employer.service.js';

/** Contrato vigente na data. */
export async function activeContract(tx: Tx, employeeId: string, date: string) {
  const [c] = await tx
    .select()
    .from(employmentContracts)
    .where(and(eq(employmentContracts.employeeId, employeeId), lte(employmentContracts.startDate, date), or(isNull(employmentContracts.endDate), gte(employmentContracts.endDate, date))))
    .orderBy(desc(employmentContracts.startDate))
    .limit(1);
  return c ?? null;
}

@Injectable()
export class EmployeesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenant: TenantDb,
    private readonly audit: AuditService,
    private readonly employer: EmployerService,
  ) {}

  async list(scope: EmployerScope, q: z.infer<typeof employeeListQuery>) {
    const { employerId, timezone } = scope.membership;
    const today = todayIn(timezone);
    return this.tenant.run(employerId, async (tx) => {
      const conds = [eq(employees.employerId, employerId)];
      if (q.status !== 'all') conds.push(eq(employees.status, q.status));
      if (q.search) {
        const digits = q.search.replace(/\D/g, '');
        const term = `%${q.search.replace(/[%_]/g, '')}%`;
        conds.push(digits.length >= 3 ? or(ilike(employees.fullName, term), sql`${employees.cpf} like ${`%${digits}%`}`)! : ilike(employees.fullName, term));
      }
      const where = and(...conds);
      const [{ total } = { total: 0 }] = await tx.select({ total: count() }).from(employees).where(where);
      const rows = await tx
        .select({ e: employees, jobRole: jobRoles.name })
        .from(employees)
        .leftJoin(jobRoles, eq(jobRoles.id, employees.jobRoleId))
        .where(where)
        .orderBy(asc(employees.fullName))
        .limit(q.pageSize)
        .offset(offsetOf(q));
      const ids = rows.map((r) => r.e.id);
      const access = ids.length
        ? await this.db.select({ employeeId: userRoles.employeeId, active: userRoles.active }).from(userRoles).where(and(eq(userRoles.employerId, employerId), inArray(userRoles.employeeId, ids)))
        : [];
      const open = ids.length
        ? await tx.select().from(workSessions).where(and(inArray(workSessions.employeeId, ids), inArray(workSessions.state, ['working', 'on_break'])))
        : [];
      const items = [];
      for (const { e, jobRole } of rows) {
        const contract = await activeContract(tx, e.id, today);
        const session = open.find((s) => s.employeeId === e.id);
        items.push({
          id: e.id,
          fullName: e.fullName,
          cpfMasked: maskCpf(e.cpf),
          email: e.email,
          phone: e.phone,
          jobRoleName: jobRole,
          status: e.status,
          hasAccess: access.some((a) => a.employeeId === e.id && a.active),
          contract: contract ? { regime: contract.regime, startDate: contract.startDate, weeklyMinutes: contract.weeklyMinutes } : null,
          state: session?.state ?? 'none',
        });
      }
      return toPage(items, total, q);
    });
  }

  async get(scope: EmployerScope, id: string) {
    const { employerId, timezone } = scope.membership;
    const today = todayIn(timezone);
    const detail = await this.tenant.run(employerId, async (tx) => {
      const [row] = await tx.select({ e: employees, jobRole: jobRoles.name }).from(employees).leftJoin(jobRoles, eq(jobRoles.id, employees.jobRoleId)).where(and(eq(employees.id, id), eq(employees.employerId, employerId)));
      if (!row) throw notFound('Funcionário');
      const contracts = await tx.select().from(employmentContracts).where(eq(employmentContracts.employeeId, id)).orderBy(desc(employmentContracts.startDate));
      const locs = await tx
        .select({ a: employeeWorkLocations, name: workLocations.name, kind: workLocations.kind })
        .from(employeeWorkLocations)
        .innerJoin(workLocations, eq(workLocations.id, employeeWorkLocations.locationId))
        .where(eq(employeeWorkLocations.employeeId, id))
        .orderBy(desc(employeeWorkLocations.validFrom));
      const scheds = await tx
        .select({ a: employeeSchedules, name: workSchedules.name, kind: workSchedules.kind })
        .from(employeeSchedules)
        .innerJoin(workSchedules, eq(workSchedules.id, employeeSchedules.scheduleId))
        .where(eq(employeeSchedules.employeeId, id))
        .orderBy(desc(employeeSchedules.validFrom));
      return {
        id: row.e.id,
        fullName: row.e.fullName,
        cpfMasked: maskCpf(row.e.cpf),
        email: row.e.email,
        phone: row.e.phone,
        jobRoleId: row.e.jobRoleId,
        jobRoleName: row.jobRole,
        status: row.e.status,
        createdAt: row.e.createdAt.toISOString(),
        contracts: contracts.map((c) => ({
          id: c.id,
          startDate: c.startDate,
          endDate: c.endDate,
          regime: c.regime,
          weeklyHours: c.weeklyMinutes / 60,
          residesAtWorkplace: c.residesAtWorkplace,
          breakReductionAgreement: c.breakReductionAgreement,
          compensation: c.compensation,
          travelAgreement: c.travelAgreement,
          writtenAgreementRef: c.writtenAgreementRef,
          notes: c.notes,
          endReason: c.endReason,
          current: c.startDate <= today && (c.endDate === null || c.endDate >= today),
        })),
        locations: locs.map(({ a, name, kind }) => ({
          id: a.id,
          locationId: a.locationId,
          name,
          kind,
          validFrom: a.validFrom,
          validTo: a.validTo,
          revokedAt: a.revokedAt?.toISOString() ?? null,
          current: !a.revokedAt && a.validFrom <= today && (a.validTo === null || a.validTo >= today),
        })),
        schedules: scheds.map(({ a, name, kind }) => ({
          id: a.id,
          scheduleId: a.scheduleId,
          name,
          kind,
          validFrom: a.validFrom,
          validTo: a.validTo,
          current: a.validFrom <= today && (a.validTo === null || a.validTo >= today),
        })),
      };
    });
    const [access] = await this.db
      .select({ active: userRoles.active, hasPassword: sql<boolean>`${users.passwordHash} is not null`, email: users.email, lastLoginAt: users.lastLoginAt })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(eq(userRoles.employerId, employerId), eq(userRoles.employeeId, id)));
    return {
      ...detail,
      access: access
        ? { status: !access.active ? 'disabled' : access.hasPassword ? 'active' : 'invited', email: access.email, lastLoginAt: access.lastLoginAt?.toISOString() ?? null }
        : { status: 'none', email: null, lastLoginAt: null },
    };
  }

  async create(scope: EmployerScope, input: z.infer<typeof employeeCreateSchema>, meta: RequestMeta) {
    const { employerId } = scope.membership;
    const id = await this.tenant.run(employerId, async (tx) => {
      const [dup] = await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.employerId, employerId), eq(employees.cpf, input.cpf)));
      if (dup) throw conflict('CPF_IN_USE', 'Já existe um funcionário com este CPF.');
      if (input.jobRoleId) await this.assertJobRole(tx, employerId, input.jobRoleId);
      const [e] = await tx
        .insert(employees)
        .values({ employerId, fullName: input.fullName, cpf: input.cpf, email: input.email ?? null, phone: input.phone ?? null, jobRoleId: input.jobRoleId ?? null })
        .returning({ id: employees.id });
      await this.audit.record(tx, { employerId, category: 'data', action: 'employee.created', actorUserId: scope.userId, entityType: 'employee', entityId: e!.id, summary: `Funcionário ${input.fullName} cadastrado`, ip: meta.ip });
      return e!.id;
    });
    if (input.createAccess) await this.grantAccess(scope, id, meta);
    return { id };
  }

  async update(scope: EmployerScope, id: string, input: z.infer<typeof employeeUpdateSchema>, meta: RequestMeta) {
    const { employerId } = scope.membership;
    await this.tenant.run(employerId, async (tx) => {
      const [before] = await tx.select().from(employees).where(and(eq(employees.id, id), eq(employees.employerId, employerId)));
      if (!before) throw notFound('Funcionário');
      if (input.jobRoleId) await this.assertJobRole(tx, employerId, input.jobRoleId);
      const patch = { fullName: input.fullName, email: input.email ?? null, phone: input.phone ?? null, jobRoleId: input.jobRoleId ?? null, status: input.status };
      await tx.update(employees).set({ ...patch, updatedAt: new Date() }).where(eq(employees.id, id));
      await this.audit.record(tx, {
        employerId,
        category: 'data',
        action: 'employee.updated',
        actorUserId: scope.userId,
        entityType: 'employee',
        entityId: id,
        summary: 'Cadastro do funcionário atualizado',
        ip: meta.ip,
        metadata: { fields: changedFields(before, patch) },
      });
    });
    // funcionário inativo perde o acesso ao app
    if (input.status === 'inactive') await this.db.update(userRoles).set({ active: false }).where(and(eq(userRoles.employerId, employerId), eq(userRoles.employeeId, id)));
  }

  /** Cria (ou reenvia) o acesso do funcionário ao app pelo e-mail cadastrado. */
  async grantAccess(scope: EmployerScope, employeeId: string, meta: RequestMeta) {
    const { employerId, employerName } = scope.membership;
    const emp = await this.tenant.run(employerId, async (tx) => {
      const [e] = await tx.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.employerId, employerId)));
      return e;
    });
    if (!emp) throw notFound('Funcionário');
    if (emp.status !== 'active') throw conflict('EMPLOYEE_INACTIVE', 'Reative o funcionário antes de conceder acesso.');
    if (!emp.email) throw unprocessable('EMAIL_REQUIRED', 'Cadastre o e-mail do funcionário para enviar o acesso.', { email: 'Obrigatório para criar acesso.' });

    let [user] = await this.db.select().from(users).where(sql`lower(${users.email}) = ${emp.email.toLowerCase()}`);
    if (!user) [user] = await this.db.insert(users).values({ name: emp.fullName, email: emp.email.toLowerCase() }).returning();
    const [existing] = await this.db.select().from(userRoles).where(and(eq(userRoles.userId, user!.id), eq(userRoles.employerId, employerId)));
    if (existing && existing.employeeId !== employeeId) throw conflict('EMAIL_IN_USE', 'Este e-mail já tem outro acesso neste empregador.');
    if (existing) await this.db.update(userRoles).set({ active: true }).where(eq(userRoles.id, existing.id));
    else await this.db.insert(userRoles).values({ userId: user!.id, employerId, roleCode: 'employee', employeeId, createdByUserId: scope.userId });

    await this.employer.sendAccessEmail(user!.id, user!.email, user!.name, !user!.passwordHash, employerName, 'funcionário');
    await this.tenant.run(employerId, (tx) =>
      this.audit.record(tx, { employerId, category: 'privileged', action: 'employee.access_granted', actorUserId: scope.userId, entityType: 'employee', entityId: employeeId, summary: 'Acesso ao app enviado ao funcionário', ip: meta.ip }),
    );
  }

  // ───── Funções ─────

  listJobRoles(scope: EmployerScope) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, (tx) => tx.select().from(jobRoles).where(eq(jobRoles.employerId, employerId)).orderBy(asc(jobRoles.name)));
  }

  async createJobRole(scope: EmployerScope, input: z.infer<typeof jobRoleSchema>, meta: RequestMeta) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      const [r] = await tx.insert(jobRoles).values({ employerId, name: input.name, description: input.description ?? null }).returning({ id: jobRoles.id });
      await this.audit.record(tx, { employerId, category: 'data', action: 'job_role.created', actorUserId: scope.userId, entityType: 'job_role', entityId: r!.id, summary: `Função "${input.name}" criada`, ip: meta.ip });
      return { id: r!.id };
    });
  }

  private async assertJobRole(tx: Tx, employerId: string, id: string) {
    const [r] = await tx.select({ id: jobRoles.id }).from(jobRoles).where(and(eq(jobRoles.id, id), eq(jobRoles.employerId, employerId)));
    if (!r) throw unprocessable('JOB_ROLE', 'Função não encontrada.', { jobRoleId: 'Função não encontrada.' });
  }

  private async assertEmployee(tx: Tx, employerId: string, id: string) {
    const [e] = await tx.select().from(employees).where(and(eq(employees.id, id), eq(employees.employerId, employerId)));
    if (!e) throw notFound('Funcionário');
    return e;
  }

  // ───── Contratos ─────

  async createContract(scope: EmployerScope, employeeId: string, input: z.infer<typeof contractCreateSchema>, meta: RequestMeta) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      await this.assertEmployee(tx, employerId, employeeId);
      if (input.jobRoleId) await this.assertJobRole(tx, employerId, input.jobRoleId);
      const end = input.endDate ?? '9999-12-31';
      const [overlap] = await tx
        .select({ id: employmentContracts.id })
        .from(employmentContracts)
        .where(
          and(
            eq(employmentContracts.employeeId, employeeId),
            lte(employmentContracts.startDate, end),
            or(isNull(employmentContracts.endDate), gte(employmentContracts.endDate, input.startDate)),
          ),
        );
      if (overlap) throw conflict('CONTRACT_OVERLAP', 'Já existe contrato vigente nesse período. Encerre o anterior antes.');
      const [c] = await tx
        .insert(employmentContracts)
        .values({
          employerId,
          employeeId,
          jobRoleId: input.jobRoleId ?? null,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          regime: input.regime,
          weeklyMinutes: Math.round(input.weeklyHours * 60),
          residesAtWorkplace: input.residesAtWorkplace,
          breakReductionAgreement: input.breakReductionAgreement,
          compensation: input.compensation,
          travelAgreement: input.travelAgreement,
          writtenAgreementRef: input.writtenAgreementRef ?? null,
          notes: input.notes ?? null,
          createdByUserId: scope.userId,
        })
        .returning({ id: employmentContracts.id });
      await this.audit.record(tx, {
        employerId,
        category: 'data',
        action: 'contract.created',
        actorUserId: scope.userId,
        entityType: 'employment_contract',
        entityId: c!.id,
        summary: `Contrato registrado a partir de ${input.startDate}`,
        ip: meta.ip,
        metadata: { regime: input.regime, weeklyHours: input.weeklyHours, compensation: input.compensation },
      });
      return { id: c!.id };
    });
  }

  async endContract(scope: EmployerScope, contractId: string, input: z.infer<typeof contractEndSchema>, meta: RequestMeta) {
    const { employerId } = scope.membership;
    await this.tenant.run(employerId, async (tx) => {
      const [c] = await tx.select().from(employmentContracts).where(and(eq(employmentContracts.id, contractId), eq(employmentContracts.employerId, employerId)));
      if (!c) throw notFound('Contrato');
      if (c.endDate) throw conflict('CONTRACT_ENDED', 'Este contrato já tem data de término.');
      if (input.endDate < c.startDate) throw unprocessable('VALIDATION', 'O término deve ser depois do início.', { endDate: 'Antes do início do contrato.' });
      await tx.update(employmentContracts).set({ endDate: input.endDate, endReason: input.reason }).where(eq(employmentContracts.id, contractId));
      await this.audit.record(tx, { employerId, category: 'data', action: 'contract.ended', actorUserId: scope.userId, entityType: 'employment_contract', entityId: contractId, summary: `Contrato encerrado em ${input.endDate}`, ip: meta.ip });
    });
  }

  // ───── Locais autorizados ─────

  async authorizeLocation(scope: EmployerScope, employeeId: string, input: z.infer<typeof employeeLocationSchema>, meta: RequestMeta) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      await this.assertEmployee(tx, employerId, employeeId);
      const [loc] = await tx.select().from(workLocations).where(and(eq(workLocations.id, input.locationId), eq(workLocations.employerId, employerId)));
      if (!loc || !loc.active) throw unprocessable('LOCATION', 'Local não encontrado ou inativo.', { locationId: 'Local inválido.' });
      if (input.validTo && input.validTo < input.validFrom) throw unprocessable('VALIDATION', 'Vigência inválida.', { validTo: 'Antes do início.' });
      const [a] = await tx
        .insert(employeeWorkLocations)
        .values({ employerId, employeeId, locationId: input.locationId, validFrom: input.validFrom, validTo: input.validTo ?? null, createdByUserId: scope.userId })
        .returning({ id: employeeWorkLocations.id });
      await this.audit.record(tx, { employerId, category: 'data', action: 'employee_location.authorized', actorUserId: scope.userId, entityType: 'employee_work_location', entityId: a!.id, summary: `Local "${loc.name}" autorizado`, ip: meta.ip, metadata: { employeeId, validFrom: input.validFrom, validTo: input.validTo ?? null } });
      return { id: a!.id };
    });
  }

  async revokeLocation(scope: EmployerScope, authorizationId: string, meta: RequestMeta) {
    const { employerId } = scope.membership;
    await this.tenant.run(employerId, async (tx) => {
      const res = await tx
        .update(employeeWorkLocations)
        .set({ revokedAt: new Date(), revokedByUserId: scope.userId })
        .where(and(eq(employeeWorkLocations.id, authorizationId), eq(employeeWorkLocations.employerId, employerId), isNull(employeeWorkLocations.revokedAt)))
        .returning({ id: employeeWorkLocations.id });
      if (!res.length) throw notFound('Autorização');
      await this.audit.record(tx, { employerId, category: 'data', action: 'employee_location.revoked', actorUserId: scope.userId, entityType: 'employee_work_location', entityId: authorizationId, summary: 'Autorização de local revogada', ip: meta.ip });
    });
  }

  // ───── Escala ─────

  async assignSchedule(scope: EmployerScope, employeeId: string, input: z.infer<typeof employeeScheduleSchema>, meta: RequestMeta) {
    const { employerId } = scope.membership;
    return this.tenant.run(employerId, async (tx) => {
      await this.assertEmployee(tx, employerId, employeeId);
      const [s] = await tx.select().from(workSchedules).where(and(eq(workSchedules.id, input.scheduleId), eq(workSchedules.employerId, employerId)));
      if (!s || !s.active) throw unprocessable('SCHEDULE', 'Escala não encontrada ou arquivada.', { scheduleId: 'Escala inválida.' });
      const open = await tx.select().from(employeeSchedules).where(and(eq(employeeSchedules.employeeId, employeeId), isNull(employeeSchedules.validTo)));
      for (const o of open) {
        if (o.validFrom >= input.validFrom) throw conflict('SCHEDULE_OVERLAP', 'Já existe escala com início nesta data ou depois. Escolha uma data posterior.');
        await tx.update(employeeSchedules).set({ validTo: addDays(input.validFrom, -1) }).where(eq(employeeSchedules.id, o.id));
      }
      const [a] = await tx
        .insert(employeeSchedules)
        .values({ employerId, employeeId, scheduleId: input.scheduleId, validFrom: input.validFrom, createdByUserId: scope.userId })
        .returning({ id: employeeSchedules.id });
      await this.audit.record(tx, { employerId, category: 'data', action: 'employee_schedule.assigned', actorUserId: scope.userId, entityType: 'employee_schedule', entityId: a!.id, summary: `Escala "${s.name}" atribuída a partir de ${input.validFrom}`, ip: meta.ip, metadata: { employeeId } });
      return { id: a!.id };
    });
  }
}
