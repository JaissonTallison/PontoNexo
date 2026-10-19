// Barra padrões proibidos (CLAUDE.md e guia visual): any, ts-ignore, degradê/cantos/sombras fora do padrão, emoji.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['apps/api/src', 'apps/api/test', 'apps/web/src', 'packages/shared/src'];
const rules = [
  [/:\s*any\b|\bas any\b|<any>/, 'uso de any'],
  [/@ts-(ignore|nocheck)/, '@ts-ignore / @ts-nocheck'],
  [/\bbg-gradient|\bbg-linear-|\bfrom-\w+-\d{2,3}\b/, 'degradê na interface'],
  [/\brounded-(xl|2xl|3xl|full)\b/, 'canto fora do padrão (8 px)'],
  [/\bshadow-(lg|xl|2xl)\b/, 'sombra fora do padrão'],
  [/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'emoji'],
];
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p)) files.push(p);
  }
};
roots.forEach(walk);
let errors = 0;
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    for (const [re, msg] of rules) if (re.test(line)) {
      console.error(`${f}:${i + 1}  ${msg}`);
      errors++;
    }
  });
}
if (errors) process.exit(1);
console.log(`verificar-codigo: ${files.length} arquivos sem padrões proibidos`);
