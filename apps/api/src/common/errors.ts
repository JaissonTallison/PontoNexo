/** Erro de domínio com código estável (o front usa o código, o usuário lê a mensagem). */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Registro') => new AppError(404, 'NOT_FOUND', `${what} não encontrado.`);
export const forbidden = (message = 'Você não tem permissão para esta ação.') => new AppError(403, 'FORBIDDEN', message);
export const conflict = (code: string, message: string, extra?: Record<string, unknown>) =>
  new AppError(409, code, message, undefined, extra);
export const unprocessable = (code: string, message: string, fields?: Record<string, string>, extra?: Record<string, unknown>) =>
  new AppError(422, code, message, fields, extra);
export const unauthorized = (message = 'Sessão expirada. Entre novamente.') => new AppError(401, 'UNAUTHENTICATED', message);
