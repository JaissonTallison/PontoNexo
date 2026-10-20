import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { PushService } from './push.service.js';
import { RemindersJob } from './reminders.job.js';

@Global()
@Module({ controllers: [NotificationsController], providers: [PushService, RemindersJob], exports: [PushService, RemindersJob] })
export class NotificationsModule {}
