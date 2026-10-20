/**
 * Modelo único dos e-mails do PontoNexo: faixa azul-marinho com a logo, cartão branco com título,
 * texto curto e um botão. HTML de tabelas com estilos em linha (o que Gmail, Outlook e Apple Mail
 * entendem) e sempre uma versão em texto puro junto.
 */

const MARCA = '#000F4B';
const FUNDO = '#F4F7FA';
const TEXTO = '#0F1C2A';
const TEXTO_2 = '#334155';
const TEXTO_3 = '#52606D';
const BORDA = '#D9E2EC';
const FONTE = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface EmailContent {
  /** Linha que o leitor de e-mail mostra ao lado do assunto. */
  preheader: string;
  title: string;
  greeting: string;
  paragraphs: string[];
  /** Itens em lista (resumo diário). */
  items?: string[];
  button?: { label: string; url: string };
  /** Aviso curto abaixo do botão (ex.: validade do link). */
  note?: string;
  /** Por que a pessoa recebeu este e-mail. */
  reason: string;
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function renderEmail(c: EmailContent, webOrigin: string): { html: string; text: string } {
  const e = escapeHtml;
  const p = (t: string) => `<p style="margin:0 0 16px;font:400 16px/1.55 ${FONTE};color:${TEXTO_2};">${e(t)}</p>`;
  const items = c.items?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid ${BORDA};border-radius:8px;">${c.items
        .map((i, n) => `<tr><td style="padding:12px 16px;${n ? `border-top:1px solid ${BORDA};` : ''}font:600 15px/1.45 ${FONTE};color:${TEXTO};">${e(i)}</td></tr>`)
        .join('')}</table>`
    : '';
  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="border-radius:8px;background:${MARCA};">
        <a href="${e(c.button.url)}" style="display:inline-block;padding:15px 28px;font:700 16px/1 ${FONTE};color:#FFFFFF;text-decoration:none;border-radius:8px;">${e(c.button.label)}</a>
      </td></tr></table>`
    : '';
  const note = c.note ? `<p style="margin:0;font:400 14px/1.5 ${FONTE};color:${TEXTO_3};">${e(c.note)}</p>` : '';
  const fallback = c.button
    ? `<p style="margin:0 0 12px;font:400 13px/1.5 ${FONTE};color:${TEXTO_3};">O botão não abriu? Copie e cole este endereço no navegador:<br><a href="${e(c.button.url)}" style="color:${MARCA};word-break:break-all;">${e(c.button.url)}</a></p>`
    : '';

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${e(c.title)}</title></head>
<body style="margin:0;padding:0;background:${FUNDO};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FUNDO};"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${BORDA};border-radius:8px;overflow:hidden;">
    <tr><td style="background:${MARCA};padding:22px 28px;">
      <img src="${e(webOrigin)}/brand/email/pontonexo-logo-email.png" width="180" height="44" alt="PontoNexo" style="display:block;border:0;width:180px;height:auto;">
    </td></tr>
    <tr><td style="padding:32px 28px 8px;">
      <h1 style="margin:0 0 20px;font:700 23px/1.3 ${FONTE};color:${MARCA};">${e(c.title)}</h1>
      <p style="margin:0 0 16px;font:600 16px/1.55 ${FONTE};color:${TEXTO};">${e(c.greeting)}</p>
      ${c.paragraphs.map(p).join('')}
      ${items}${button}${note}
    </td></tr>
    <tr><td style="padding:24px 28px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid ${BORDA};padding-top:20px;">
        ${fallback}
        <p style="margin:0 0 6px;font:400 13px/1.5 ${FONTE};color:${TEXTO_3};">${e(c.reason)}</p>
        <p style="margin:0;font:600 13px/1.5 ${FONTE};color:${TEXTO_3};">PontoNexo · Registro eletrônico de jornada (LC 150/2015)</p>
      </td></tr></table>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    c.title,
    '',
    c.greeting,
    '',
    ...c.paragraphs.flatMap((t) => [t, '']),
    ...(c.items?.length ? [...c.items.map((i) => `• ${i}`), ''] : []),
    ...(c.button ? [`${c.button.label}: ${c.button.url}`, ''] : []),
    ...(c.note ? [c.note, ''] : []),
    '—',
    c.reason,
    'PontoNexo · Registro eletrônico de jornada (LC 150/2015)',
  ].join('\n');
  return { html, text };
}

/** Primeiro nome, sem o "(fictício)" dos dados de exemplo. */
export const firstName = (name: string) => name.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] ?? name;

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
