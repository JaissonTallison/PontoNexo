import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  contractCreateSchema,
  contractEndSchema,
  employeeCreateSchema,
  employeeListQuery,
  employeeLocationSchema,
  employeeScheduleSchema,
  employeeUpdateSchema,
  idParam,
  jobRoleSchema,
} from '@pontonexo/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import type { AuthContext } from '../../common/auth/context.js';
import { Auth, requireEmployer, RequirePermission } from '../../common/auth/decorators.js';
import { requestMeta } from '../../common/http.js';
import { EmployeesService } from './employees.service.js';

@ApiTags('Funcionários, funções e contratos')
@Controller()
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @RequirePermission('employees.read')
  @Get('employees')
  list(@Auth() auth: AuthContext, @Query({ schema: employeeListQuery }) q: z.infer<typeof employeeListQuery>) {
    return this.service.list(requireEmployer(auth), q);
  }

  @RequirePermission('employees.write')
  @Post('employees')
  create(@Auth() auth: AuthContext, @Body({ schema: employeeCreateSchema }) body: z.infer<typeof employeeCreateSchema>, @Req() req: Request) {
    return this.service.create(requireEmployer(auth), body, requestMeta(req));
  }

  @RequirePermission('employees.read')
  @Get('employees/:id')
  get(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string) {
    return this.service.get(requireEmployer(auth), id);
  }

  @RequirePermission('employees.write')
  @Put('employees/:id')
  @HttpCode(200)
  async update(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Body({ schema: employeeUpdateSchema }) body: z.infer<typeof employeeUpdateSchema>, @Req() req: Request) {
    await this.service.update(requireEmployer(auth), id, body, requestMeta(req));
    return { ok: true };
  }

  @RequirePermission('employees.write')
  @Post('employees/:id/access')
  @HttpCode(200)
  async access(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Req() req: Request) {
    await this.service.grantAccess(requireEmployer(auth), id, requestMeta(req));
    return { ok: true };
  }

  @RequirePermission('employees.write')
  @Post('employees/:id/contracts')
  contract(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Body({ schema: contractCreateSchema }) body: z.infer<typeof contractCreateSchema>, @Req() req: Request) {
    return this.service.createContract(requireEmployer(auth), id, body, requestMeta(req));
  }

  @RequirePermission('employees.write')
  @Post('contracts/:id/end')
  @HttpCode(200)
  async endContract(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Body({ schema: contractEndSchema }) body: z.infer<typeof contractEndSchema>, @Req() req: Request) {
    await this.service.endContract(requireEmployer(auth), id, body, requestMeta(req));
    return { ok: true };
  }

  @RequirePermission('locations.write')
  @Post('employees/:id/locations')
  authorize(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Body({ schema: employeeLocationSchema }) body: z.infer<typeof employeeLocationSchema>, @Req() req: Request) {
    return this.service.authorizeLocation(requireEmployer(auth), id, body, requestMeta(req));
  }

  @RequirePermission('locations.write')
  @Post('employee-locations/:id/revoke')
  @HttpCode(200)
  async revoke(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Req() req: Request) {
    await this.service.revokeLocation(requireEmployer(auth), id, requestMeta(req));
    return { ok: true };
  }

  @RequirePermission('schedules.write')
  @Post('employees/:id/schedules')
  assign(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Body({ schema: employeeScheduleSchema }) body: z.infer<typeof employeeScheduleSchema>, @Req() req: Request) {
    return this.service.assignSchedule(requireEmployer(auth), id, body, requestMeta(req));
  }

  @RequirePermission('employees.read')
  @Get('job-roles')
  jobRoles(@Auth() auth: AuthContext) {
    return this.service.listJobRoles(requireEmployer(auth));
  }

  @RequirePermission('employees.write')
  @Post('job-roles')
  createJobRole(@Auth() auth: AuthContext, @Body({ schema: jobRoleSchema }) body: z.infer<typeof jobRoleSchema>, @Req() req: Request) {
    return this.service.createJobRole(requireEmployer(auth), body, requestMeta(req));
  }
}
