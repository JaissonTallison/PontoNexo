// Cria .env a partir do .env.example (se não existir) e preenche as chaves vazias.
// Não sobrescreve chaves já definidas. Nunca versione o .env.
import { createECDH, generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const envPath = new URL('../.env', import.meta.url);
if (!existsSync(envPath)) copyFileSync(new URL('../.env.example', import.meta.url), envPath);
let env = readFileSync(envPath, 'utf8');

const fill = (name, value) => {
  const re = new RegExp(`^${name}=\\s*$`, 'm');
  // variável nova que ainda não existe no .env: acrescenta vazia para preencher abaixo
  if (!new RegExp(`^${name}=`, 'm').test(env)) env += `\n${name}=`;
  if (re.test(env)) {
    env = env.replace(re, `${name}=${value}`);
    console.log(`${name}: gerada`);
  } else console.log(`${name}: já definida, mantida`);
};

const { privateKey } = generateKeyPairSync('ed25519');
fill('RECEIPT_SIGNING_KEY', privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
fill('APP_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
fill('BACKUP_PASSPHRASE', randomBytes(24).toString('base64url'));
// VAPID (Web Push): par P-256, formato base64url esperado pelo web-push
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
if (new RegExp('^VAPID_PUBLIC_KEY=\\s*$', 'm').test(env) || !/^VAPID_PUBLIC_KEY=/m.test(env)) {
  fill('VAPID_PUBLIC_KEY', ecdh.getPublicKey().toString('base64url'));
  fill('VAPID_PRIVATE_KEY', ecdh.getPrivateKey().toString('base64url'));
}
writeFileSync(envPath, env, { mode: 0o600 });
