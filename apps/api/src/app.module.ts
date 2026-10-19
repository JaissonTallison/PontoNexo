import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/throttler.guard.js';
import { SessionGuard } from './common/auth/session.guard.js';
import { InfraModule } from './common/infra.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { EmployerModule } from './modules/empregador/employer.module.js';
import { SchedulesModule } from './modules/escalas/schedules.module.js';
import { EmployeesModule } from './modules/funcionarios/employees.module.js';
import { GovernanceModule } from './modules/governanca/governance.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { LocationsModule } from './modules/locais/locations.module.js';
import { RegistradorModule } from './modules/registrador/registrador.module.js';
import { TimeModule } from './modules/time/time.module.js';
import { TratamentoModule } from './modules/tratamento/tratamento.module.js';

@Module({
  imports: [
    InfraModule,
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      // nos testes o relógio é simulado e as marcações são rápidas; um teste específico religa o limite
      skipIf: () =>
        (process.env.NODE_ENV === 'test' && process.env.THROTTLE_IN_TESTS !== 'true') ||
        (process.env.NODE_ENV !== 'production' && process.env.PN_SEEDING === 'true'),
    }),
    TimeModule,
    AuthModule,
    EmployerModule,
    EmployeesModule,
    LocationsModule,
    SchedulesModule,
    RegistradorModule,
    TratamentoModule,
    GovernanceModule,
  ],
  controllers: [HealthController],
  providers: [
    // ordem importa: limite de requisições antes da sessão
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}
