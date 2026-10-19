import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { alertListQuery, alertReviewSchema, idParam, month, punchCreateSchema, punchListQuery, type PunchCreateInput } from '@pontonexo/shared';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth/context.js';
import { Auth, Public, requireEmployee, requireEmployer, RequirePermission } from '../../common/auth/decorators.js';
import { requestMeta } from '../../common/http.js';
import { PunchAdminService } from './punch-admin.service.js';
import { PunchService } from './punch.service.js';

const monthQuery = z.object({ month });
const codeParam = z.string().trim().regex(/^[0-9A-Za-z]{8,16}$/, 'Código inválido.');

@ApiTags('Registro de ponto')
@Controller()
export class RegistradorController {
  constructor(
    private readonly punches: PunchService,
    private readonly admin: PunchAdminService,
  ) {}

  // ───── Funcionário ─────

  @RequirePermission('punch.self')
  @Get('me/punch-context')
  context(@Auth() auth: AuthContext) {
    return this.punches.context(requireEmployee(auth));
  }

  @RequirePermission('punch.self')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('me/punches')
  @HttpCode(201)
  punch(@Auth() auth: AuthContext, @Body({ schema: punchCreateSchema }) body: PunchCreateInput, @Req() req: Request) {
    return this.punches.create(requireEmployee(auth), body, requestMeta(req));
  }

  @RequirePermission('self.read')
  @Get('me/punches')
  myPunches(@Auth() auth: AuthContext, @Query({ schema: monthQuery }) q: z.infer<typeof monthQuery>) {
    return this.punches.myPunches(requireEmployee(auth), q.month);
  }

  @RequirePermission('self.read')
  @Get('me/receipts/:punchId')
  myReceipt(@Auth() auth: AuthContext, @Param('punchId', { schema: idParam }) punchId: string) {
    const scope = requireEmployee(auth);
    return this.punches.receiptFor(scope.membership.employerId, punchId, scope.membership.employeeId);
  }

  // ───── Empregador ─────

  @RequirePermission('punches.read')
  @Get('punches')
  list(@Auth() auth: AuthContext, @Query({ schema: punchListQuery }) q: z.infer<typeof punchListQuery>) {
    return this.admin.list(requireEmployer(auth), q);
  }

  @RequirePermission('punches.read')
  @Get('punches/:id/receipt')
  receipt(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string) {
    return this.punches.receiptFor(requireEmployer(auth).membership.employerId, id, null);
  }

  @RequirePermission('audit.read')
  @Get('punches/integrity')
  integrity(@Auth() auth: AuthContext) {
    return this.punches.verifyChain(requireEmployer(auth).membership.employerId);
  }

  @RequirePermission('punches.read')
  @Get('alerts')
  alerts(@Auth() auth: AuthContext, @Query({ schema: alertListQuery }) q: z.infer<typeof alertListQuery>) {
    return this.admin.alerts(requireEmployer(auth), q);
  }

  @RequirePermission('alerts.review')
  @Post('alerts/:id/review')
  @HttpCode(200)
  async review(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Body({ schema: alertReviewSchema }) body: z.infer<typeof alertReviewSchema>, @Req() req: Request) {
    await this.admin.review(requireEmployer(auth), id, body.note, requestMeta(req));
    return { ok: true };
  }

  // ───── Público ─────

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('receipts/verify/:code')
  verify(@Param('code', { schema: codeParam }) code: string) {
    return this.punches.verify(code);
  }
}
