import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { employerUpdateSchema, idParam, inviteUserSchema } from '@pontonexo/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import type { AuthContext } from '../../common/auth/context.js';
import { Auth, requireEmployer, RequirePermission } from '../../common/auth/decorators.js';
import { requestMeta } from '../../common/http.js';
import { EmployerService } from './employer.service.js';

@ApiTags('Empregador e usuários')
@Controller()
export class EmployerController {
  constructor(private readonly service: EmployerService) {}

  @RequirePermission('employer.read')
  @Get('employer')
  get(@Auth() auth: AuthContext) {
    return this.service.get(requireEmployer(auth));
  }

  @RequirePermission('employer.write')
  @Put('employer')
  update(@Auth() auth: AuthContext, @Body({ schema: employerUpdateSchema }) body: z.infer<typeof employerUpdateSchema>, @Req() req: Request) {
    return this.service.update(requireEmployer(auth), body, requestMeta(req));
  }

  @RequirePermission('users.manage')
  @Get('users')
  users(@Auth() auth: AuthContext) {
    return this.service.listUsers(requireEmployer(auth));
  }

  @RequirePermission('users.manage')
  @Post('users/invite')
  invite(@Auth() auth: AuthContext, @Body({ schema: inviteUserSchema }) body: z.infer<typeof inviteUserSchema>, @Req() req: Request) {
    return this.service.inviteUser(requireEmployer(auth), body, requestMeta(req));
  }

  @RequirePermission('users.manage')
  @Post('users/:id/deactivate')
  @HttpCode(200)
  async deactivate(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Req() req: Request) {
    await this.service.setUserActive(requireEmployer(auth), id, false, requestMeta(req));
    return { ok: true };
  }

  @RequirePermission('users.manage')
  @Post('users/:id/reactivate')
  @HttpCode(200)
  async reactivate(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Req() req: Request) {
    await this.service.setUserActive(requireEmployer(auth), id, true, requestMeta(req));
    return { ok: true };
  }
}
