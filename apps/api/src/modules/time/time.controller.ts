import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { TimeView } from '@pontonexo/shared';
import { Public, RequirePermission } from '../../common/auth/decorators.js';
import { TimeService } from './time.service.js';

@ApiTags('Hora oficial')
@Controller('time')
export class TimeController {
  constructor(private readonly time: TimeService) {}

  /** Hora do servidor para o app exibir (a marcação usa sempre a hora do recebimento). */
  @Public()
  @Get()
  get(): TimeView {
    return this.time.view();
  }

  @RequirePermission('audit.read')
  @Get('checks')
  async checks() {
    const rows = await this.time.history(100);
    return rows.map((r) => ({ id: r.id, checkedAt: r.checkedAt.toISOString(), server: r.server, offsetMs: r.offsetMs, roundTripMs: r.roundTripMs, ok: r.ok, error: r.error }));
  }
}
