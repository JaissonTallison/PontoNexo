import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../config/env.js';
import { AppError } from './errors.js';
import { ENV } from './tokens.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** versão formatada (modelo em email-template.ts); o texto puro vai sempre junto */
  html?: string;
}

/** Tempo máximo para o provedor responder: nenhuma tela fica presa esperando e-mail. */
const TIMEOUT_MS = 15_000;

/** "Nome <email@x>" → { name, email } */
export function parseFrom(from: string): { name: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1] || 'PontoNexo', email: m[2]! } : { name: 'PontoNexo', email: from.trim() };
}

@Injectable()
export class MailService {
  private readonly logger = new Logger('E-mail');
  private readonly transport: Transporter | null;
  /** Em testes as mensagens ficam em memória para conferência. */
  readonly sent: MailMessage[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
    this.transport =
      env.NODE_ENV === 'test' || env.MAIL_PROVIDER === 'brevo'
        ? null
        : nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
            connectionTimeout: TIMEOUT_MS,
            greetingTimeout: TIMEOUT_MS,
            socketTimeout: TIMEOUT_MS,
          });
  }

  async send(message: MailMessage): Promise<void> {
    if (this.env.NODE_ENV === 'test') {
      this.sent.push(message);
      return;
    }
    try {
      if (this.env.MAIL_PROVIDER === 'brevo') await this.sendBrevo(message);
      else await this.transport!.sendMail({ from: this.env.MAIL_FROM, ...message });
    } catch (err) {
      // não expõe o destinatário no log técnico
      this.logger.error('Falha ao enviar e-mail', { subject: message.subject, provider: this.env.MAIL_PROVIDER, error: err instanceof Error ? err.message : String(err) });
      throw new AppError(502, 'MAIL_FAILED', 'Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.');
    }
  }

  /** API transacional do Brevo (POST /v3/smtp/email), por HTTPS. */
  private async sendBrevo(message: MailMessage) {
    if (!this.env.BREVO_API_KEY) throw new Error('BREVO_API_KEY ausente');
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': this.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: parseFrom(this.env.MAIL_FROM), to: [{ email: message.to }], subject: message.subject, textContent: message.text, ...(message.html ? { htmlContent: message.html } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Brevo respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}
