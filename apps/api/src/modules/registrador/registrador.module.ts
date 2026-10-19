import { Module } from '@nestjs/common';
import { PunchAdminService } from './punch-admin.service.js';
import { PunchService } from './punch.service.js';
import { RegistradorController } from './registrador.controller.js';

@Module({ controllers: [RegistradorController], providers: [PunchService, PunchAdminService], exports: [PunchService] })
export class RegistradorModule {}
