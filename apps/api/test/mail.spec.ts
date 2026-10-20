import { describe, expect, it } from 'vitest';
import { parseFrom } from '../src/common/mail.service.js';

describe('remetente do e-mail', () => {
  it('separa nome e endereço de MAIL_FROM', () => {
    expect(parseFrom('PontoNexo <j@x.com>')).toEqual({ name: 'PontoNexo', email: 'j@x.com' });
    expect(parseFrom('só@endereco.com')).toEqual({ name: 'PontoNexo', email: 'só@endereco.com' });
  });
});

describe('modelo dos e-mails', () => {
  it('monta HTML com botão e texto puro, escapando o que vem do usuário', async () => {
    const { renderEmail } = await import('../src/common/email-template.js');
    const r = renderEmail(
      { preheader: 'p', title: 'Seu acesso está pronto', greeting: 'Olá, <b>Ana</b>.', paragraphs: ['Casa "Silva" & Cia'], button: { label: 'Criar minha senha', url: 'https://x.app/redefinir-senha?token=abc&convite=1' }, note: 'O link vale por 72 horas.', reason: 'motivo' },
      'https://x.app',
    );
    expect(r.html).toContain('Olá, &lt;b&gt;Ana&lt;/b&gt;.');
    expect(r.html).toContain('Casa &quot;Silva&quot; &amp; Cia');
    expect(r.html).toContain('href="https://x.app/redefinir-senha?token=abc&amp;convite=1"');
    expect(r.html).toContain('https://x.app/brand/email/pontonexo-logo-email.png');
    expect(r.text).toContain('Criar minha senha: https://x.app/redefinir-senha?token=abc&convite=1');
  });
});
