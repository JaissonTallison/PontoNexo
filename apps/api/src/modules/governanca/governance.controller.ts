import { Body, Controller, Get, Header, HttpCode, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  auditListQuery,
  dataRequestCreateSchema,
  dataRequestRespondSchema,
  idParam,
  incidentCreateSchema,
  incidentListQuery,
  incidentUpdateSchema,
  integrationCreateSchema,
  integrationUpdateSchema,
  month,
  retentionUpdateSchema,
  uuid,
} from '@pontonexo/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth/context.js';
import { Auth, requireEmployee, requireEmployer, RequirePermission } from '../../common/auth/decorators.js';
import { requestMeta } from '../../common/http.js';
import { ExportsService } from './exports.service.js';
import { GovernanceService } from './governance.service.js';
import { IntegrationsService } from './integrations.service.js';

const exportQuery = z.object({ month, employeeId: uuid.optional() });
const timesheetExportQuery = z.object({ month, employeeId: uuid });

@ApiTags('Governança: auditoria, incidentes, LGPD, integrações e exportações')
@Controller()
export class GovernanceController {
  constructor(
    private readonly gov: GovernanceService,
    private readonly integrations: IntegrationsService,
    private readonly exportsService: ExportsService,
  ) {}

  @RequirePermission('employer.read')
  @Get('dashboard')
  dashboard(@Auth() auth: AuthContext) {
    return this.gov.dashboard(requireEmployer(auth));
  }

  // ───── Auditoria ─────

  @RequirePermission('audit.read')
  @Get('audit')
  audit(@Auth() auth: AuthContext, @Query({ schema: auditListQuery }) q: z.infer<typeof auditListQuery>) {
    return this.gov.auditList(requireEmployer(auth), q);
  }

  @RequirePermission('audit.read')
  @Post('audit/verify')
  @HttpCode(200)
  verify(@Auth() auth: AuthContext) {
    return this.gov.verifyIntegrity(requireEmployer(auth));
  }

  // ───── Incidentes ─────

  @RequirePermission('incidents.manage')
  @Get('incidents')
  incidents(@Auth() auth: AuthContext, @Query({ schema: incidentListQuery }) q: z.infer<typeof incidentListQuery>) {
    return this.gov.incidentList(requireEmployer(auth), q);
  }

  @RequirePermission('incidents.manage')
  @Post('incidents')
  createIncident(@Auth() auth: AuthContext, @Body({ schema: incidentCreateSchema }) body: z.infer<typeof incidentCreateSchema>, @Req() req: Request) {
    return this.gov.incidentCreate(requireEmployer(auth), body, requestMeta(req));
  }

  @RequirePermission('incidents.manage')
  @Post('incidents/:id/updates')
  @HttpCode(200)
  updateIncident(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Body({ schema: incidentUpdateSchema }) body: z.infer<typeof incidentUpdateSchema>, @Req() req: Request) {
    return this.gov.incidentUpdate(requireEmployer(auth), id, body.status, body.note, requestMeta(req));
  }

  // ───── Retenção ─────

  @RequirePermission('settings.manage')
  @Get('settings/retention')
  retention(@Auth() auth: AuthContext) {
    return this.gov.retention(requireEmployer(auth));
  }

  @RequirePermission('settings.manage')
  @Put('settings/retention')
  updateRetention(@Auth() auth: AuthContext, @Body({ schema: retentionUpdateSchema }) body: z.infer<typeof retentionUpdateSchema>, @Req() req: Request) {
    return this.gov.updateRetention(requireEmployer(auth), body.policies[0]!.retentionDays, requestMeta(req));
  }

  // ───── Integrações ─────

  @RequirePermission('settings.manage')
  @Get('integrations')
  integrationsList(@Auth() auth: AuthContext) {
    return this.integrations.list(requireEmployer(auth));
  }

  @RequirePermission('settings.manage')
  @Post('integrations')
  createIntegration(@Auth() auth: AuthContext, @Body({ schema: integrationCreateSchema }) body: z.infer<typeof integrationCreateSchema>, @Req() req: Request) {
    return this.integrations.create(requireEmployer(auth), body, requestMeta(req));
  }

  @RequirePermission('settings.manage')
  @Put('integrations/:id')
  @HttpCode(200)
  async updateIntegration(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Body({ schema: integrationUpdateSchema }) body: z.infer<typeof integrationUpdateSchema>, @Req() req: Request) {
    await this.integrations.setActive(requireEmployer(auth), id, body.active, requestMeta(req));
    return { ok: true };
  }

  // ───── Privacidade e direitos do titular ─────

  @Get('privacy/notice')
  notice() {
    return this.gov.privacyNotice();
  }

  @Post('me/privacy/acknowledge')
  @HttpCode(200)
  async acknowledge(@Auth() auth: AuthContext, @Req() req: Request) {
    await this.gov.acknowledgePrivacy(requireEmployer(auth), requestMeta(req));
    return { ok: true };
  }

  @RequirePermission('self.read')
  @Get('me/data-requests')
  myRequests(@Auth() auth: AuthContext) {
    const scope = requireEmployee(auth);
    return this.gov.dataRequestList(scope, scope.membership.employeeId);
  }

  @RequirePermission('self.read')
  @Post('me/data-requests')
  createRequest(@Auth() auth: AuthContext, @Body({ schema: dataRequestCreateSchema }) body: z.infer<typeof dataRequestCreateSchema>, @Req() req: Request) {
    return this.gov.dataRequestCreate(requireEmployee(auth), body, requestMeta(req));
  }

  @RequirePermission('self.read')
  @Get('me/data-export')
  @Header('content-disposition', 'attachment; filename="meus-dados-pontonexo.json"')
  myData(@Auth() auth: AuthContext, @Req() req: Request) {
    return this.exportsService.employeeJson(requireEmployee(auth), requestMeta(req));
  }

  @RequirePermission('privacy.manage')
  @Get('data-requests')
  requests(@Auth() auth: AuthContext) {
    return this.gov.dataRequestList(requireEmployer(auth), null);
  }

  @RequirePermission('privacy.manage')
  @Post('data-requests/:id/respond')
  @HttpCode(200)
  respond(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Body({ schema: dataRequestRespondSchema }) body: z.infer<typeof dataRequestRespondSchema>, @Req() req: Request) {
    return this.gov.dataRequestRespond(requireEmployer(auth), id, body.status, body.response, requestMeta(req));
  }

  // ───── Exportações ─────

  @RequirePermission('exports.run')
  @Get('exports/punches.csv')
  async punchesCsv(@Auth() auth: AuthContext, @Query({ schema: exportQuery }) q: z.infer<typeof exportQuery>, @Req() req: Request, @Res() res: Response) {
    const csv = await this.exportsService.punchesCsv(requireEmployer(auth), q.month, q.employeeId ?? null, requestMeta(req));
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="marcacoes-${q.month}.csv"`);
    res.send(csv);
  }

  @RequirePermission('exports.run')
  @Get('exports/timesheet.csv')
  async timesheetCsv(@Auth() auth: AuthContext, @Query({ schema: timesheetExportQuery }) q: z.infer<typeof timesheetExportQuery>, @Req() req: Request, @Res() res: Response) {
    const csv = await this.exportsService.timesheetCsv(requireEmployer(auth), q.month, q.employeeId, requestMeta(req));
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="espelho-${q.month}.csv"`);
    res.send(csv);
  }

  @RequirePermission('settings.manage')
  @Get('exports/employer.json')
  @Header('content-disposition', 'attachment; filename="pontonexo-empregador.json"')
  employerJson(@Auth() auth: AuthContext, @Req() req: Request) {
    return this.exportsService.employerJson(requireEmployer(auth), requestMeta(req));
  }
}
