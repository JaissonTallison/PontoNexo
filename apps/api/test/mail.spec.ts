import { describe, expect, it } from 'vitest';
import { parseFrom } from '../src/common/mail.service.js';

describe('remetente do e-mail', () => {
  it('separa nome e endereço de MAIL_FROM', () => {
    expect(parseFrom('PontoNexo <j@x.com>')).toEqual({ name: 'PontoNexo', email: 'j@x.com' });
    expect(parseFrom('só@endereco.com')).toEqual({ name: 'PontoNexo', email: 'só@endereco.com' });
  });
});
