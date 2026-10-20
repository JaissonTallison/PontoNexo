import { z } from 'zod';
import type { Permission } from '../dominio/permissoes.js';
import type { RoleCode } from '../dominio/tipos.js';
import { cpf, email, password, uuid } from './comum.js';

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Informe a senha.').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password,
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});
export const switchEmployerSchema = z.object({ employerId: uuid });

export interface MembershipView {
  id: string;
  employerId: string;
  employerName: string;
  role: RoleCode;
  employeeId: string | null;
}

export interface MeView {
  user: { id: string; name: string; email: string };
  active: MembershipView | null;
  memberships: MembershipView[];
  permissions: Permission[];
  timezone: string;
  privacyNoticeVersion: string;
  privacyAcknowledged: boolean;
}

export interface SessionView {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  current: boolean;
}

export const signupSchema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo.').max(200),
  email,
  password,
  employer: z.object({
    displayName: z.string().trim().min(2, 'Informe como a residência será identificada.').max(120),
    legalName: z.string().trim().min(3, 'Informe o nome do empregador.').max(200),
    cpf,
  }),
  acceptTerms: z.literal(true, { error: 'É preciso aceitar os termos para continuar.' }),
});
export type SignupInput = z.infer<typeof signupSchema>;


export const pushSubscribeSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(10).max(100) }),
});
export const pushUnsubscribeSchema = z.object({ endpoint: z.url().max(1000) });

