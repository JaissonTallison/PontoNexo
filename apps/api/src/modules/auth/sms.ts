import { Logger } from '@nestjs/common';
import type { Env } from '../../config/env.js';

export const SMS_SENDER = Symbol('SMS_SENDER');

export interface SmsSender {
  /** false quando o envio por SMS não está configurado (login por celular indisponível). */
  readonly available: boolean;
  send(phoneDigits: string, text: string): Promise<void>;
}

/**
 * Desenvolvimento e testes: não envia SMS; escreve o código no log da API.
 * Em testes guarda as mensagens em memória para conferência.
 */
export class ConsoleSmsSender implements SmsSender {
  private readonly logger = new Logger('SMS (console)');
  readonly sent: Array<{ to: string; text: string }> = [];
  constructor(readonly available: boolean) {}
  async send(to: string, text: string) {
    this.sent.push({ to, text });
    this.logger.warn(`SMS NÃO enviado (provedor "console"). Para ${to.slice(0, 4)}****${to.slice(-2)}: ${text}`);
  }
}

/**
 * SMS pela API REST da Twilio. Implementado conforme a documentação pública da Twilio,
 * mas NÃO testado contra a conta real (exige credenciais pagas). Validar antes de usar em produção.
 */
export class TwilioSmsSender implements SmsSender {
  readonly available = true;
  constructor(
    private readonly sid: string,
    private readonly token: string,
    private readonly from: string,
  ) {}
  async send(to: string, text: string) {
    const e164 = to.startsWith('55') ? `+${to}` : `+55${to}`;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${this.sid}:${this.token}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: e164, From: this.from, Body: text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Twilio respondeu ${res.status}`);
  }
}

export function createSmsSender(env: Env): SmsSender {
  if (env.OTP_PROVIDER === 'twilio') {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM) throw new Error('OTP_PROVIDER=twilio exige TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_FROM.');
    return new TwilioSmsSender(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_FROM);
  }
  // console só vale fora de produção: em produção, sem provedor real, o login por celular fica desligado
  return new ConsoleSmsSender(env.NODE_ENV !== 'production');
}
