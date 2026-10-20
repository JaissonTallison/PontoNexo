# Instalação, execução e operação

## Requisitos
Node 24, pnpm 11, Docker, ImageMagick (só para a marca).

## Primeira execução
```bash
pnpm install
pnpm chaves:gerar          # cria .env a partir do .env.example e gera as chaves (nunca versione o .env)
pnpm infra:up              # PostgreSQL 17 (:5572) e Mailpit (:5575 SMTP, :5576 web)
pnpm build:shared
pnpm db:migrate            # migrações (papel dono)
pnpm db:seed               # dados FICTÍCIOS; senha PontoNexo2026
pnpm dev                   # API :5570 (/api/docs) e web :5571
```
Usuários do seed: `titular@`, `gestor@`, `contador@`, `maria@`, `jose@pontonexo.local`.
`pnpm --filter @pontonexo/api db:reset` recria o banco de desenvolvimento (só local).

## Variáveis de ambiente
Ver `.env.example` (comentado). Em produção: `NODE_ENV=production`, `COOKIE_SECURE=true` (obrigatório), `TRUST_PROXY=true` atrás de proxy, `WEB_ORIGIN` com o domínio HTTPS, SMTP real, chaves geradas por `pnpm chaves:gerar` guardadas num cofre.

## Acesso pelo celular, biometria e lembretes
- **Código por SMS:** `OTP_PROVIDER=console` só em desenvolvimento (o código aparece no log da API). Em produção, `console` desliga o login por celular. `OTP_PROVIDER=twilio` envia SMS pela Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`); **adaptador implementado pela documentação pública e não testado com conta real**.
- **Biometria (passkey):** `WEBAUTHN_RP_ID` precisa ser o domínio do site (sem protocolo nem porta) e `WEB_ORIGIN` o endereço exato. Trocar o domínio invalida as biometrias já cadastradas.
- **Lembretes (Web Push):** chaves `VAPID_*` geradas por `pnpm chaves:gerar`; a tarefa roda a cada 5 min e avisa 15 min após o início/fim previsto. Desligar com `REMINDERS_ENABLED=false`.
- **Avisos ao empregador:** pedido de ajuste do funcionário gera notificação para titular e gestores que ligaram os avisos em Minha conta. O **resumo diário por e-mail** sai a partir das 8h (fuso do empregador), uma vez por dia e só quando há pendência; desliga junto com `JOBS_ENABLED=false`.
- **Mapa dos locais:** usa tiles de `tile.openstreetmap.org` e busca no Nominatim (liberados no CSP de `next.config.ts`). Para volume alto, troque por um provedor de mapas próprio, conforme a política de uso do OpenStreetMap.
- Em celulares, tudo isso exige **HTTPS** (ver `docs/07-teste-em-celular.md`).

## Banco
- Dois papéis: dono (migrações) e `pontonexo_app` (aplicação, sujeito a RLS, sem UPDATE/DELETE em registros). Em produção, crie `pontonexo_app` com LOGIN e senha antes de migrar.
- Migrações em `apps/api/drizzle/` (0001 = segurança: gatilhos, RLS, funções).

## Verificação (rodar uma por vez)
```bash
node scripts/verificar-codigo.mjs
pnpm typecheck
pnpm test                       # 23 unitários (shared) + 44 integração (API, banco real recriado)
pnpm test:e2e                   # 7 testes; requer API e web no ar com seed; PW_CHROMIUM=<binário> se o navegador do Playwright não estiver baixado
scripts/testar-restauracao.sh   # backup cifrado → restauração em banco novo → compara contagens e cadeia de hash
```

## Produção (sugestão)
- HTTPS no proxy (Caddy/Nginx) com HSTS; API e web atrás do mesmo domínio (`/api` → API).
- `chrony` ativo no host, apontando para a.ntp.br/b.ntp.br; o painel mostra as medições.
- Backup diário: `scripts/backup.sh` via cron, cópia fora do servidor, teste de restauração mensal com `scripts/testar-restauracao.sh`.
- Monitorar `GET /api/health/ready` (banco e relógio).
- Logs em JSON (`NODE_ENV=production`), sem dados pessoais.
