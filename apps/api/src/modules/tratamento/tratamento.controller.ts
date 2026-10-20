import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  closingAckSchema,
  closingBatchSchema,
  closingCreateSchema,
  closingReopenSchema,
  correctionCreateSchema,
  correctionDecisionSchema,
  correctionListQuery,
  idParam,
  month,
  timesheetQuery,
  uuid,
} from '@pontonexo/shared';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth/context.js';
import { Auth, requireEmployee, requireEmployer, RequirePermission } from '../../common/auth/decorators.js';
import { forbidden } from '../../common/errors.js';
import { requestMeta } from '../../common/http.js';
import { ClosingsService } from './closings.service.js';
import { CorrectionsService } from './corrections.service.js';
import { TimesheetService } from './timesheet.service.js';

const closingListQuery = z.object({ month: month.optional(), employeeId: uuid.optional() });

@ApiTags('Tratamento, espelho e fechamento')
@Controller()
export class TratamentoController {
  constructor(
    private readonly corrections: CorrectionsService,
    private readonly timesheets: TimesheetService,
    private readonly closings: ClosingsService,
  ) {}

  // ───── Correções ─────

  @RequirePermission('self.read')
  @Get('me/corrections')
  myCorrections(@Auth() auth: AuthContext, @Query({ schema: correctionListQuery }) q: z.infer<typeof correctionListQuery>) {
    const scope = requireEmployee(auth);
    return this.corrections.list(scope, q, scope.membership.employeeId);
  }

  @RequirePermission('self.read')
  @Post('me/corrections/seen')
  @HttpCode(200)
  async seen(@Auth() auth: AuthContext) {
    await this.corrections.markSeen(requireEmployee(auth));
    return { ok: true };
  }

  @RequirePermission('corrections.read')
  @Get('corrections')
  list(@Auth() auth: AuthContext, @Query({ schema: correctionListQuery }) q: z.infer<typeof correctionListQuery>) {
    return this.corrections.list(requireEmployer(auth), q, null);
  }

  /** Funcionário solicita ou empregador propõe (o serviço identifica o lado). */
  @Post('corrections')
  create(@Auth() auth: AuthContext, @Body({ schema: correctionCreateSchema }) body: z.infer<typeof correctionCreateSchema>, @Req() req: Request) {
    const scope = requireEmployer(auth);
    if (!auth.permissions.has('punch.self') && !auth.permissions.has('corrections.propose')) throw forbidden();
    return this.corrections.create(scope, body, requestMeta(req));
  }

  /** Decisão: empregador decide pedidos do funcionário; funcionário responde a propostas do empregador. */
  @Post('corrections/:id/decide')
  @HttpCode(200)
  decide(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Body({ schema: correctionDecisionSchema }) body: z.infer<typeof correctionDecisionSchema>, @Req() req: Request) {
    return this.corrections.decide(requireEmployer(auth), id, body.decision, body.reason, requestMeta(req));
  }

  @Post('corrections/:id/cancel')
  @HttpCode(200)
  async cancel(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Req() req: Request) {
    await this.corrections.cancel(requireEmployer(auth), id, requestMeta(req));
    return { ok: true };
  }

  // ───── Espelho ─────

  @RequirePermission('self.read')
  @Get('me/timesheet')
  myTimesheet(@Auth() auth: AuthContext, @Query({ schema: timesheetQuery }) q: z.infer<typeof timesheetQuery>) {
    const scope = requireEmployee(auth);
    return this.timesheets.run(scope.membership.employerId, scope.membership.employeeId, q.month);
  }

  @RequirePermission('timesheets.read')
  @Get('timesheets/:employeeId')
  timesheet(@Auth() auth: AuthContext, @Param('employeeId', { schema: idParam }) employeeId: string, @Query({ schema: timesheetQuery }) q: z.infer<typeof timesheetQuery>) {
    return this.timesheets.run(requireEmployer(auth).membership.employerId, employeeId, q.month);
  }

  // ───── Fechamento ─────

  @RequirePermission('timesheets.read')
  @Get('closings')
  closingsList(@Auth() auth: AuthContext, @Query({ schema: closingListQuery }) q: z.infer<typeof closingListQuery>) {
    return this.closings.list(requireEmployer(auth), q.month ?? null, q.employeeId ?? null);
  }

  @RequirePermission('closings.manage')
  @Post('closings')
  close(@Auth() auth: AuthContext, @Body({ schema: closingCreateSchema }) body: z.infer<typeof closingCreateSchema>, @Req() req: Request) {
    return this.closings.close(requireEmployer(auth), body.employeeId, body.month, requestMeta(req));
  }

  @RequirePermission('timesheets.read')
  @Get('closings/summary')
  summary(@Auth() auth: AuthContext, @Query({ schema: timesheetQuery }) q: z.infer<typeof timesheetQuery>) {
    return this.closings.summary(requireEmployer(auth), q.month);
  }

  @RequirePermission('closings.manage')
  @Post('closings/batch')
  @HttpCode(200)
  closeAll(@Auth() auth: AuthContext, @Body({ schema: closingBatchSchema }) body: z.infer<typeof closingBatchSchema>, @Req() req: Request) {
    return this.closings.closeAll(requireEmployer(auth), body.month, requestMeta(req));
  }

  @RequirePermission('closings.manage')
  @Post('closings/:id/reopen')
  @HttpCode(200)
  reopen(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Body({ schema: closingReopenSchema }) body: z.infer<typeof closingReopenSchema>, @Req() req: Request) {
    return this.closings.reopen(requireEmployer(auth), id, body.reason, requestMeta(req));
  }

  @Get('closings/:id/snapshot')
  snapshot(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string) {
    const scope = requireEmployer(auth);
    if (!auth.permissions.has('timesheets.read') && !auth.permissions.has('self.read')) throw forbidden();
    return this.closings.snapshot(scope, id);
  }

  @RequirePermission('self.read')
  @Get('me/closings')
  myClosings(@Auth() auth: AuthContext) {
    return this.closings.mine(requireEmployee(auth));
  }

  @RequirePermission('self.read')
  @Post('me/closings/:id/acknowledge')
  @HttpCode(200)
  ack(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Body({ schema: closingAckSchema }) body: z.infer<typeof closingAckSchema>, @Req() req: Request) {
    return this.closings.acknowledge(requireEmployee(auth), id, body.agree, body.note ?? null, requestMeta(req));
  }
}
