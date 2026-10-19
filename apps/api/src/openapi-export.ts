import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { buildOpenApi, createApp } from './bootstrap.js';

// Gera docs/openapi.json sem subir o servidor HTTP.
process.env.JOBS_ENABLED = 'false';
const app = await createApp({ logger: false });
await app.init();
writeFileSync(new URL('../../../docs/openapi.json', import.meta.url), JSON.stringify(buildOpenApi(app), null, 2));
await app.close();
console.log('docs/openapi.json atualizado');
