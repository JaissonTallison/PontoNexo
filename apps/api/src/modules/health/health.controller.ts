import { Controller, Get, HttpCode, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { Public } from '../../common/auth/decorators.js';
import { AppError } from '../../common/errors.js';
import { DB } from '../../common/tokens.js';
import { TimeService } from '../time/time.service.js';

@ApiTags('Saúde')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly time: TimeService,
  ) {}

  @Public()
  @Get()
  live() {
    return { status: 'ok' };
  }

  /** Pronto para receber marcações: banco acessível; informa o estado do relógio. */
  @Public()
  @Get('ready')
  @HttpCode(200)
  async ready() {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw new AppError(503, 'DB_UNAVAILABLE', 'Banco de dados indisponível.');
    }
    return { status: 'ok', database: 'ok', clock: this.time.status().status };
  }
}
