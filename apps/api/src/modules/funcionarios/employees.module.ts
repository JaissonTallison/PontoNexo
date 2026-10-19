import { Module } from '@nestjs/common';
import { EmployerModule } from '../empregador/employer.module.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';

@Module({ imports: [EmployerModule], controllers: [EmployeesController], providers: [EmployeesService], exports: [EmployeesService] })
export class EmployeesModule {}
