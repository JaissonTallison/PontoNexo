import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { holidayCreateSchema, idParam, scheduleCreateSchema } from '@pontonexo/shared';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth/context.js';
import { Auth, requireEmployer, RequirePermission } from '../../common/auth/decorators.js';
import { requestMeta } from '../../common/http.js';
import { SchedulesService } from './schedules.service.js';

const yearQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()) });

@ApiTags('Escalas e feriados')
@Controller()
export class SchedulesController {
  constructor(private readonly service: SchedulesService) {}

  @RequirePermission('employees.read')
  @Get('schedules')
  list(@Auth() auth: AuthContext) {
    return this.service.list(requireEmployer(auth));
  }

  @RequirePermission('schedules.write')
  @Post('schedules')
  create(@Auth() auth: AuthContext, @Body({ schema: scheduleCreateSchema }) body: z.infer<typeof scheduleCreateSchema>, @Req() req: Request) {
    return this.service.create(requireEmployer(auth), body, requestMeta(req));
  }

  @RequirePermission('schedules.write')
  @Post('schedules/:id/archive')
  @HttpCode(200)
  async archive(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Req() req: Request) {
    await this.service.setActive(requireEmployer(auth), id, false, requestMeta(req));
    return { ok: true };
  }

  @RequirePermission('schedules.write')
  @Post('schedules/:id/activate')
  @HttpCode(200)
  async activate(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Req() req: Request) {
    await this.service.setActive(requireEmployer(auth), id, true, requestMeta(req));
    return { ok: true };
  }

  @RequirePermission('employees.read')
  @Get('holidays')
  holidays(@Auth() auth: AuthContext, @Query({ schema: yearQuery }) q: z.infer<typeof yearQuery>) {
    return this.service.listHolidays(requireEmployer(auth), q.year);
  }

  @RequirePermission('schedules.write')
  @Post('holidays')
  createHoliday(@Auth() auth: AuthContext, @Body({ schema: holidayCreateSchema }) body: z.infer<typeof holidayCreateSchema>, @Req() req: Request) {
    return this.service.createHoliday(requireEmployer(auth), body, requestMeta(req));
  }

  @RequirePermission('schedules.write')
  @Delete('holidays/:id')
  async deleteHoliday(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Req() req: Request) {
    await this.service.deleteHoliday(requireEmployer(auth), id, requestMeta(req));
    return { ok: true };
  }
}
