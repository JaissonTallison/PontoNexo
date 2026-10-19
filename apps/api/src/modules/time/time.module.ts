import { Global, Module } from '@nestjs/common';
import { TimeController } from './time.controller.js';
import { TimeService } from './time.service.js';

@Global()
@Module({ controllers: [TimeController], providers: [TimeService], exports: [TimeService] })
export class TimeModule {}
