import { StandardSchemaValidationPipe } from '@nestjs/common';
import { AppError } from './errors.js';

/** Validação Zod (Standard Schema) com resposta 422 e mapa de campos para o formulário. */
export const validationPipe = () =>
  new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => {
      const fields: Record<string, string> = {};
      for (const issue of issues) {
        const path = (issue.path ?? []).map((s) => String(typeof s === 'object' && s !== null && 'key' in s ? s.key : s)).join('.') || '_';
        fields[path] ??= issue.message;
      }
      const first = Object.values(fields)[0] ?? 'Dados inválidos.';
      return new AppError(422, 'VALIDATION', Object.keys(fields).length > 1 ? 'Revise os campos destacados.' : first, fields);
    },
  });
