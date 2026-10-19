import 'reflect-metadata';
import { createApp } from './bootstrap.js';
import type { Env } from './config/env.js';
import { ENV } from './common/tokens.js';

const app = await createApp();
const env = app.get<Env>(ENV);
await app.listen(env.API_PORT);
console.log(`PontoNexo API em http://localhost:${env.API_PORT}/api (documentação em /api/docs)`);
