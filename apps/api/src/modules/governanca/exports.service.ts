import { Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import {
  ALERT_LABEL,
  DAY_ISSUE_LABEL,
  formatDateBR,
  formatDuration,
  formatLocalDateTime,
  GEO_STATUS_LABEL,
  monthRange,
  PUNCH_TYPE_LABEL,
} from '@pontonexo/shared';
import {
  correctionRequests,
  dataSubjectRequests,
  employees,
  employmentContracts,
  employers,
  monthlyClosings,
  punchAlerts,
  punchRecords,
  receipts,
  treatments,
  closingAcknowledgements,
  privacyAcknowledgements,
} from '../../db/schema.js';
import { AuditService } from '../../common/audit.service.js';
import type { EmployeeScope, EmployerScope } from '../../common/auth/decorators.js';
import { notFound } from '../../common/errors.js';
import type { RequestMeta } from '../../common/http.js';
import { TenantDb } from '../../common/tenant.js';
import { TimesheetService } from '../tratamento/timesheet.service.js';

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // evita injeção de fórmula em planilhas
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
/** CSV com ";" e BOM (abre direto no Excel em pt-BR). */
export const toCsv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';

/**
 * Exportações de conferência e portabilidade. Não são o AFD/AEJ da Portaria MTP 671/2021:
 * esses arquivos só têm validade legal quando gerados por REP certificado.
 */
@Injectable()
export class ExportsService {
  constructor(
    private readonly tenant: TenantDb,
    private readonly audit: AuditService,
    private readonly timesheets: TimesheetService,
  ) {}

  private log(employerId: string, actor: string, what: string, meta: RequestMeta, metadata: Record<string, unknown>) {
    return this.tenant.run(employerId, (tx) => this.audit.record(tx, { employerId, category: 'privileged', action: 'export.generated', actorUserId: actor, summary: `Exportação: ${what}`, ip: meta.ip, metadata }));
  }

  async punchesCsv(scope: EmployerScope, month: string, employeeId: string | null, meta: RequestMeta) {
    const { employerId, timezone } = scope.membership;
    const { from, to } = monthRange(month, timezone);
    const csv = await this.tenant.run(employerId, async (tx) => {
      const conds = [eq(punchRecords.employerId, employerId), gte(punchRecords.serverTime, from), lt(punchRecords.serverTime, to)];
      if (employeeId) conds.push(eq(punchRecords.employeeId, employeeId));
      const rows = await tx.select({ p: punchRecords, name: employees.fullName, cpf: employees.cpf }).from(punchRecords).innerJoin(employees, eq(employees.id, punchRecords.employeeId)).where(and(...conds)).orderBy(asc(punchRecords.nsr));
      const ids = rows.map((r) => r.p.id);
      const alerts = ids.length ? await tx.select().from(punchAlerts).where(inArray(punchAlerts.punchRecordId, ids)) : [];
      const dis = ids.length ? await tx.select({ id: treatments.punchRecordId }).from(treatments).where(and(eq(treatments.kind, 'disregard'), inArray(treatments.punchRecordId, ids))) : [];
      const recs = ids.length ? await tx.select({ id: receipts.punchRecordId, code: receipts.code }).from(receipts).where(inArray(receipts.punchRecordId, ids)) : [];
      const disSet = new Set(dis.map((d) => d.id));
      return toCsv([
        ['NSR', 'Funcionário', 'CPF', 'Tipo', 'Data e hora local', 'UTC', 'Origem', 'Local', 'Situação da localização', 'Distância (m)', 'Ocorrências', 'Justificativa', 'Desconsiderada por tratamento', 'Comprovante', 'Hash'],
        ...rows.map(({ p, name, cpf }) => [
          p.nsr,
          name,
          cpf,
          PUNCH_TYPE_LABEL[p.type],
          formatLocalDateTime(p.serverTime, timezone, true),
          p.serverTime.toISOString(),
          p.origin === 'online' ? 'Online' : 'Enviada após falta de conexão',
          p.locationName ?? 'Outro local',
          GEO_STATUS_LABEL[p.geoStatus],
          p.distanceM ?? '',
          alerts.filter((a) => a.punchRecordId === p.id).map((a) => ALERT_LABEL[a.code]).join(' | '),
          p.justification ?? '',
          disSet.has(p.id) ? 'Sim' : 'Não',
          recs.find((r) => r.id === p.id)?.code ?? '',
          p.hash,
        ]),
      ]);
    });
    await this.log(employerId, scope.userId, `marcações ${month}`, meta, { month, employeeId });
    return csv;
  }

  async timesheetCsv(scope: EmployerScope, month: string, employeeId: string, meta: RequestMeta) {
    const t = await this.timesheets.run(scope.membership.employerId, employeeId, month);
    const tz = t.timezone;
    const time = (iso: string | null) => (iso ? formatLocalDateTime(iso, tz).slice(11) : '—');
    const rows: unknown[][] = [
      ['Espelho de ponto', t.employee.fullName, t.employee.cpfMasked, month, t.employer.name],
      ['Data', 'Previsto', 'Marcações', 'Trabalhado', 'Intervalos', 'Noturno', 'Acréscimo noturno', 'Excedente', 'Falta/atraso', 'Domingo/feriado', 'Abono', 'Ocorrências'],
      ...t.days.map((d) => [
        formatDateBR(d.date),
        d.expected.kind === 'workday' ? `${d.expected.start}–${d.expected.end}` : d.expected.kind === 'holiday' ? `Feriado: ${d.expected.holidayName}` : d.expected.kind === 'rest' ? 'Descanso' : 'Sem escala',
        d.punches.map((p) => `${time(p.at)}${p.source === 'inclusion' ? ' (incluída)' : ''}`).join(' '),
        formatDuration(d.workedSeconds),
        formatDuration(d.breakSeconds),
        formatDuration(d.nightSeconds),
        formatDuration(d.nightBonusSeconds),
        formatDuration(d.overtimeSeconds),
        formatDuration(d.deficitSeconds),
        formatDuration(d.restOrHolidaySeconds),
        d.justified ? 'Sim' : '',
        d.issues.map((i) => DAY_ISSUE_LABEL[i.code]).join(' | '),
      ]),
      [],
      ['Totais', formatDuration(t.totals.expectedSeconds), '', formatDuration(t.totals.workedSeconds), '', formatDuration(t.totals.nightSeconds), formatDuration(t.totals.nightBonusSeconds), formatDuration(t.totals.overtimeSeconds), formatDuration(t.totals.deficitSeconds), formatDuration(t.totals.restOrHolidaySeconds), String(t.totals.justifiedAbsences), `${t.totals.absences} falta(s)`],
      ['Compensação', t.compensation.note, `Pagas como extra: ${formatDuration(t.compensation.paidOvertimeSeconds)}`, `Banco: ${formatDuration(t.compensation.bankSeconds)}`],
      ['Cálculo de referência gerado pelo PontoNexo em', t.generatedAt, 'Validar com o contador antes da folha.'],
    ];
    await this.log(scope.membership.employerId, scope.userId, `espelho ${month}`, meta, { month, employeeId });
    return toCsv(rows);
  }

  /** Portabilidade do empregador: todos os dados do contexto (sem hashes de senha). */
  async employerJson(scope: EmployerScope, meta: RequestMeta) {
    const { employerId } = scope.membership;
    const data = await this.tenant.run(employerId, async (tx) => ({
      generatedAt: new Date().toISOString(),
      employer: (await tx.select().from(employers).where(eq(employers.id, employerId)))[0],
      employees: await tx.select().from(employees).where(eq(employees.employerId, employerId)),
      contracts: await tx.select().from(employmentContracts).where(eq(employmentContracts.employerId, employerId)),
      punches: await tx.select().from(punchRecords).where(eq(punchRecords.employerId, employerId)).orderBy(asc(punchRecords.nsr)),
      receipts: await tx.select().from(receipts).where(eq(receipts.employerId, employerId)),
      alerts: await tx.select().from(punchAlerts).where(eq(punchAlerts.employerId, employerId)),
      corrections: await tx.select().from(correctionRequests).where(eq(correctionRequests.employerId, employerId)),
      treatments: await tx.select().from(treatments).where(eq(treatments.employerId, employerId)),
      closings: await tx.select().from(monthlyClosings).where(eq(monthlyClosings.employerId, employerId)),
    }));
    await this.log(employerId, scope.userId, 'dados completos do empregador', meta, {});
    return data;
  }

  /** Cópia dos dados do próprio funcionário (LGPD, art. 18, II e V). */
  async employeeJson(scope: EmployeeScope, meta: RequestMeta) {
    const { employerId, employeeId } = scope.membership;
    const data = await this.tenant.run(employerId, async (tx) => {
      const [emp] = await tx.select().from(employees).where(eq(employees.id, employeeId));
      if (!emp) throw notFound('Funcionário');
      return {
        generatedAt: new Date().toISOString(),
        controller: (await tx.select({ name: employers.legalName }).from(employers).where(eq(employers.id, employerId)))[0]?.name,
        profile: { fullName: emp.fullName, cpf: emp.cpf, email: emp.email, phone: emp.phone, status: emp.status, createdAt: emp.createdAt },
        contracts: await tx.select().from(employmentContracts).where(eq(employmentContracts.employeeId, employeeId)),
        punches: (await tx.select().from(punchRecords).where(eq(punchRecords.employeeId, employeeId)).orderBy(asc(punchRecords.nsr))).map((p) => ({
          nsr: p.nsr,
          type: p.type,
          serverTime: p.serverTime,
          deviceTime: p.deviceTime,
          origin: p.origin,
          location: p.locationName,
          geoStatus: p.geoStatus,
          distanceM: p.distanceM,
          lat: p.lat,
          lng: p.lng,
          accuracyM: p.accuracyM,
          coordinatesPurgedAt: p.coordinatesPurgedAt,
          justification: p.justification,
          ipAddress: p.ipAddress,
          userAgent: p.userAgent,
          hash: p.hash,
        })),
        receipts: await tx.select({ code: receipts.code, payload: receipts.payload, hash: receipts.hash, signature: receipts.signature }).from(receipts).innerJoin(punchRecords, eq(punchRecords.id, receipts.punchRecordId)).where(eq(punchRecords.employeeId, employeeId)),
        alerts: await tx.select().from(punchAlerts).where(eq(punchAlerts.employeeId, employeeId)),
        corrections: await tx.select().from(correctionRequests).where(eq(correctionRequests.employeeId, employeeId)),
        treatments: await tx.select().from(treatments).where(eq(treatments.employeeId, employeeId)),
        closings: await tx.select({ month: monthlyClosings.month, status: monthlyClosings.status, closedAt: monthlyClosings.closedAt, snapshotHash: monthlyClosings.snapshotHash }).from(monthlyClosings).where(eq(monthlyClosings.employeeId, employeeId)),
        acknowledgements: await tx.select().from(closingAcknowledgements).where(eq(closingAcknowledgements.employeeId, employeeId)),
        privacy: await tx.select().from(privacyAcknowledgements).where(eq(privacyAcknowledgements.userId, scope.userId)),
        dataRequests: await tx.select().from(dataSubjectRequests).where(eq(dataSubjectRequests.employeeId, employeeId)),
      };
    });
    await this.tenant.run(employerId, (tx) => this.audit.record(tx, { employerId, category: 'data', action: 'dsr.self_export', actorUserId: scope.userId, summary: 'Funcionário baixou a cópia dos próprios dados', ip: meta.ip }));
    return data;
  }
}
