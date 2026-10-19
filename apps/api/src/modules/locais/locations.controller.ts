import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { geofenceSchema, idParam, locationCreateSchema, locationUpdateSchema } from '@pontonexo/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import type { AuthContext } from '../../common/auth/context.js';
import { Auth, requireEmployer, RequirePermission } from '../../common/auth/decorators.js';
import { requestMeta } from '../../common/http.js';
import { LocationsService } from './locations.service.js';

@ApiTags('Locais e cercas virtuais')
@Controller('locations')
export class LocationsController {
  constructor(private readonly service: LocationsService) {}

  @RequirePermission('employees.read')
  @Get()
  list(@Auth() auth: AuthContext) {
    return this.service.list(requireEmployer(auth));
  }

  @RequirePermission('employees.read')
  @Get(':id')
  get(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string) {
    return this.service.get(requireEmployer(auth), id);
  }

  @RequirePermission('locations.write')
  @Post()
  create(@Auth() auth: AuthContext, @Body({ schema: locationCreateSchema }) body: z.infer<typeof locationCreateSchema>, @Req() req: Request) {
    return this.service.create(requireEmployer(auth), body, requestMeta(req));
  }

  @RequirePermission('locations.write')
  @Put(':id')
  @HttpCode(200)
  async update(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Body({ schema: locationUpdateSchema }) body: z.infer<typeof locationUpdateSchema>, @Req() req: Request) {
    await this.service.update(requireEmployer(auth), id, body, requestMeta(req));
    return { ok: true };
  }

  @RequirePermission('locations.write')
  @Post(':id/geofences')
  geofence(@Auth() auth: AuthContext, @Param('id', { schema: idParam }) id: string, @Body({ schema: geofenceSchema }) body: z.infer<typeof geofenceSchema>, @Req() req: Request) {
    return this.service.newGeofence(requireEmployer(auth), id, body, requestMeta(req));
  }
}
