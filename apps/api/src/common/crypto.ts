import { createCipheriv, createDecipheriv, createHash, createHmac, createPrivateKey, createPublicKey, randomBytes, sign, verify, type KeyObject } from 'node:crypto';

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export const hmacSha256 = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** Código legível (sem I, L, O, U) para verificação de comprovante. */
export function randomCode(length = 12): string {
  const bytes = randomBytes(length);
  let out = '';
  for (const b of bytes) out += CROCKFORD[b % 32];
  return out;
}

/** JSON com chaves ordenadas: mesma entrada, mesma string, mesmo hash. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export const chainHash = (prevHash: string, body: unknown) => sha256(`${prevHash}\n${canonicalJson(body)}`);

/** Assinatura Ed25519 dos comprovantes. Não é ICP-Brasil nem PAdES: prova integridade e origem no próprio sistema. */
export class ReceiptSigner {
  private readonly privateKey: KeyObject;
  readonly publicKeyPem: string;
  constructor(privateKeyDerBase64: string, readonly keyId: string) {
    this.privateKey = createPrivateKey({ key: Buffer.from(privateKeyDerBase64, 'base64'), format: 'der', type: 'pkcs8' });
    this.publicKeyPem = createPublicKey(this.privateKey).export({ format: 'pem', type: 'spki' }).toString();
  }
  sign(data: string): string {
    return sign(null, Buffer.from(data), this.privateKey).toString('base64');
  }
  verify(data: string, signature: string): boolean {
    try {
      return verify(null, Buffer.from(data), createPublicKey(this.privateKey), Buffer.from(signature, 'base64'));
    } catch {
      return false;
    }
  }
}

/** AES-256-GCM para segredos guardados no banco (ex.: segredo de webhook). */
export class SecretBox {
  private readonly key: Buffer;
  constructor(keyBase64: string) {
    this.key = Buffer.from(keyBase64, 'base64');
    if (this.key.length !== 32) throw new Error('APP_ENCRYPTION_KEY precisa ter 32 bytes em base64.');
  }
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
  }
  decrypt(payload: string): string {
    const buf = Buffer.from(payload, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
  }
}
