import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../config/env.js';
import { ENV } from './tokens.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger('E-mail');
  private readonly transport: Transporter | null;
  /** Em testes as mensagens ficam em memória para conferência. */
  readonly sent: MailMessage[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
    this.transport =
      env.NODE_ENV === 'test'
        ? null
        : nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
          });
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transport) {
      this.sent.push(message);
      return;
    }
    try {
      await this.transport.sendMail({ from: this.env.MAIL_FROM, ...message });
    } catch (err) {
      // não expõe o destinatário no log técnico
      this.logger.error('Falha ao enviar e-mail', { subject: message.subject, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }
}
