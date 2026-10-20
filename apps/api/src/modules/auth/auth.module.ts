import { Module } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { ENV } from '../../common/tokens.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasskeysService } from './passkeys.service.js';
import { PhoneLoginService } from './phone-login.service.js';
import { createSmsSender, SMS_SENDER } from './sms.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PhoneLoginService, PasskeysService, { provide: SMS_SENDER, inject: [ENV], useFactory: (env: Env) => createSmsSender(env) }],
  exports: [AuthService, SMS_SENDER],
})
export class AuthModule {}
