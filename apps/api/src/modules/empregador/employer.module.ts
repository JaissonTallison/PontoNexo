import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmployerController } from './employer.controller.js';
import { EmployerService } from './employer.service.js';

@Module({ imports: [AuthModule], controllers: [EmployerController], providers: [EmployerService], exports: [EmployerService] })
export class EmployerModule {}
