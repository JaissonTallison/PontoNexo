import { z } from 'zod';
import { isValidCpf, onlyDigits } from '../dominio/documentos.js';

export const uuid = z.uuid({ error: 'Identificador inválido.' });
export const isoDate = z.iso.date({ error: 'Data inválida (use AAAA-MM-DD).' });
export const isoDateTime = z.iso.datetime({ offset: true, error: 'Data e hora inválidas.' });
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (use HH:MM).');
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido (use AAAA-MM).');
export const nonEmpty = (max = 200) => z.string().trim().min(1, 'Campo obrigatório.').max(max, `Máximo de ${max} caracteres.`);
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();
export const reason = z.string().trim().min(10, 'Descreva o motivo com pelo menos 10 caracteres.').max(1000);
export const cpf = z
  .string()
  .transform(onlyDigits)
  .refine(isValidCpf, 'CPF inválido.');
export const email = z.email({ error: 'E-mail inválido.' }).trim().toLowerCase().max(200);
export const password = z
  .string()
  .min(10, 'A senha precisa de pelo menos 10 caracteres.')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Use letras e números.');

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export const idParam = uuid;

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Corpo padrão de erro devolvido pela API. */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  fields?: Record<string, string>;
}
