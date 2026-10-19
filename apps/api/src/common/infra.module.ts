import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Sql } from 'postgres';
import { loadEnv, type Env } from '../config/env.js';
import { createDatabase } from '../db/client.js';
import { AuditService } from './audit.service.js';
import { SessionService } from './auth/session.service.js';
import { ReceiptSigner, SecretBox } from './crypto.js';
import { MailService } from './mail.service.js';
import { TenantDb } from './tenant.js';
import { DB, DB_CLIENT, ENV } from './tokens.js';

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    {
      provide: DB_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) => createDatabase(env.DATABASE_URL),
    },
    { provide: DB, inject: [DB_CLIENT], useFactory: (c: ReturnType<typeof createDatabase>) => c.db },
    { provide: ReceiptSigner, inject: [ENV], useFactory: (env: Env) => new ReceiptSigner(env.RECEIPT_SIGNING_KEY, env.RECEIPT_KEY_ID) },
    { provide: SecretBox, inject: [ENV], useFactory: (env: Env) => new SecretBox(env.APP_ENCRYPTION_KEY) },
    TenantDb,
    AuditService,
    SessionService,
    MailService,
  ],
  exports: [ENV, DB, DB_CLIENT, ReceiptSigner, SecretBox, TenantDb, AuditService, SessionService, MailService],
})
export class InfraModule implements OnApplicationShutdown {
  constructor(@Inject(DB_CLIENT) private readonly conn: { client: Sql }) {}
  async onApplicationShutdown() {
    await this.conn.client.end({ timeout: 5 });
  }
}
