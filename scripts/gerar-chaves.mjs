// Cria .env a partir do .env.example (se não existir) e preenche as chaves vazias.
// Não sobrescreve chaves já definidas. Nunca versione o .env.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const envPath = new URL('../.env', import.meta.url);
if (!existsSync(envPath)) copyFileSync(new URL('../.env.example', import.meta.url), envPath);
let env = readFileSync(envPath, 'utf8');

const fill = (name, value) => {
  const re = new RegExp(`^${name}=\\s*$`, 'm');
  if (re.test(env)) {
    env = env.replace(re, `${name}=${value}`);
    console.log(`${name}: gerada`);
  } else console.log(`${name}: já definida, mantida`);
};

const { privateKey } = generateKeyPairSync('ed25519');
fill('RECEIPT_SIGNING_KEY', privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
fill('APP_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
fill('BACKUP_PASSPHRASE', randomBytes(24).toString('base64url'));
writeFileSync(envPath, env, { mode: 0o600 });
