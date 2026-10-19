import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { ApiErrorBody } from '@pontonexo/shared';
import type { Request, Response } from 'express';
import { AppError } from './errors.js';

interface PgLikeError {
  code?: string;
  constraint_name?: string;
  constraint?: string;
  message?: string;
}

function pgError(err: unknown): PgLikeError | null {
  if (typeof err !== 'object' || err === null) return null;
  const direct = err as PgLikeError;
  if (typeof direct.code === 'string' && /^[0-9A-Z]{5}$/.test(direct.code)) return direct;
  const cause = (err as { cause?: unknown }).cause;
  return cause ? pgError(cause) : null;
}

/** Respostas de erro uniformes, sem vazar detalhes internos (pilha, SQL, dados). */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Erro');

  catch(err: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const body = this.toBody(err, req);
    if (body.statusCode >= 500) {
      this.logger.error('Falha não tratada', {
        requestId: req.requestId,
        method: req.method,
        path: req.route?.path ?? req.path,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
    }
    res.status(body.statusCode).json({ ...body, requestId: req.requestId });
  }

  private toBody(err: unknown, req: Request): ApiErrorBody {
    if (err instanceof AppError) {
      return { statusCode: err.status, code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}), ...(err.extra ?? {}) };
    }
    if (err instanceof ThrottlerException) {
      return { statusCode: 429, code: 'RATE_LIMITED', message: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.' };
    }
    if (err instanceof HttpException) {
      const status = err.getStatus();
      if (status === 404) return { statusCode: 404, code: 'NOT_FOUND', message: `Rota não encontrada: ${req.method} ${req.path}` };
      if (status === 413) return { statusCode: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Requisição grande demais.' };
      const r = err.getResponse();
      const message = typeof r === 'object' && r && 'message' in r ? String((r as { message: unknown }).message) : err.message;
      return { statusCode: status, code: 'HTTP_ERROR', message };
    }
    const pg = pgError(err);
    if (pg?.code === '23505') return { statusCode: 409, code: 'DUPLICATE', message: 'Já existe um registro com esses dados.' };
    if (pg?.code === '23503') return { statusCode: 409, code: 'REFERENCE', message: 'Registro relacionado não encontrado ou em uso.' };
    if (pg?.code === '23514') return { statusCode: 422, code: 'CONSTRAINT', message: 'Os dados não atendem às regras do cadastro.' };
    if (pg?.code === 'P0001') return { statusCode: 409, code: 'IMMUTABLE', message: pg.message ?? 'Operação não permitida.' };
    if (pg?.code === '42501') return { statusCode: 403, code: 'FORBIDDEN', message: 'Acesso negado pelo banco de dados.' };
    if (pg?.code === '22P02') return { statusCode: 422, code: 'INVALID_INPUT', message: 'Valor inválido.' };
    return { statusCode: 500, code: 'INTERNAL', message: 'Erro interno. Tente novamente; se persistir, informe o código da requisição.' };
  }
}
