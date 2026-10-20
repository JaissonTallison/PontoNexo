import { Module } from '@nestjs/common';
import { ClosingsService } from './closings.service.js';
import { CorrectionsService } from './corrections.service.js';
import { TimesheetService } from './timesheet.service.js';
import { TratamentoController } from './tratamento.controller.js';

@Module({ controllers: [TratamentoController], providers: [CorrectionsService, TimesheetService, ClosingsService], exports: [TimesheetService, ClosingsService] })
export class TratamentoModule {}
