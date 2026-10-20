import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { pushSubscribeSchema, pushUnsubscribeSchema } from '@pontonexo/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import type { AuthContext } from '../../common/auth/context.js';
import { Auth } from '../../common/auth/decorators.js';
import { userAgent } from '../../common/http.js';
import { PushService } from './push.service.js';

@ApiTags('Notificações')
@Controller('me/push')
export class NotificationsController {
  constructor(private readonly push: PushService) {}

  @Get('public-key')
  key() {
    return { enabled: this.push.enabled, publicKey: this.push.publicKey };
  }

  @Post('subscribe')
  @HttpCode(200)
  async subscribe(@Auth() auth: AuthContext, @Body({ schema: pushSubscribeSchema }) body: z.infer<typeof pushSubscribeSchema>, @Req() req: Request) {
    await this.push.subscribe(auth.userId, body.endpoint, body.keys, userAgent(req));
    return { ok: true };
  }

  @Post('unsubscribe')
  @HttpCode(200)
  async unsubscribe(@Auth() auth: AuthContext, @Body({ schema: pushUnsubscribeSchema }) body: z.infer<typeof pushUnsubscribeSchema>) {
    await this.push.unsubscribe(auth.userId, body.endpoint);
    return { ok: true };
  }

  @Post('test')
  @HttpCode(200)
  async test(@Auth() auth: AuthContext) {
    const sent = await this.push.sendToUser(auth.userId, { title: 'Avisos ligados', body: 'Você vai receber avisos do PontoNexo neste aparelho.', url: auth.membership?.role === 'employee' ? '/app' : '/painel', tag: 'teste' });
    return { sent };
  }
}
