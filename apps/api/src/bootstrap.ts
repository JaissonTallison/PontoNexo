import { ConsoleLogger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type SwaggerDocumentOptions } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { ErrorFilter } from './common/error.filter.js';
import { ENV } from './common/tokens.js';
import { validationPipe } from './common/validation.js';

export const API_PREFIX = 'api';

/** Converte os schemas Zod das rotas em OpenAPI 3.0 com o conversor nativo do Zod 4. */
export const openApiOptions: SwaggerDocumentOptions = {
  standardSchemaConverter: (schema, { schemaType }) => ({
    schema: z.toJSONSchema(schema as z.ZodType, { target: 'openapi-3.0', io: schemaType === 'input' ? 'input' : 'output', unrepresentable: 'any' }) as Record<string, unknown>,
  }),
};

export function buildOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('PontoNexo API')
    .setDescription(
      'Controle de jornada de trabalhadores domésticos. Autenticação por cookie de sessão (HttpOnly) e cabeçalho x-csrf-token em requisições que alteram estado. ' +
        'Marcações são somente-inclusão; correções criam tratamentos. Sem certificação REP-P: ver docs/02-conformidade-trabalhista.md.',
    )
    .setVersion('0.1.0')
    .addCookieAuth('pn_session')
    .build();
  return SwaggerModule.createDocument(app, config, openApiOptions);
}

export async function createApp(options: { logger?: boolean } = {}): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: options.logger === false ? false : new ConsoleLogger({ json: process.env.NODE_ENV === 'production', logLevels: ['log', 'warn', 'error', 'fatal'] }),
    bodyParser: false,
  });
  const env = app.get<Env>(ENV);
  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '64kb' });
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'] } },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.headers['x-request-id'];
    req.requestId = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', req.requestId);
    res.setHeader('cache-control', 'no-store');
    next();
  });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, () => buildOpenApi(app), { jsonDocumentUrl: `${API_PREFIX}/docs/json` });
  return app;
}
