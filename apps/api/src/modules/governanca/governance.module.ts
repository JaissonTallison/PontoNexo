import { Module } from '@nestjs/common';
import { RegistradorModule } from '../registrador/registrador.module.js';
import { TratamentoModule } from '../tratamento/tratamento.module.js';
import { ExportsService } from './exports.service.js';
import { GovernanceController } from './governance.controller.js';
import { GovernanceService } from './governance.service.js';
import { IntegrationsService } from './integrations.service.js';
import { RetentionJob } from './retention.job.js';

@Module({
  imports: [RegistradorModule, TratamentoModule],
  controllers: [GovernanceController],
  providers: [GovernanceService, IntegrationsService, ExportsService, RetentionJob],
  exports: [IntegrationsService, RetentionJob],
})
export class GovernanceModule {}
