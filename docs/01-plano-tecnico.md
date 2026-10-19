# PontoNexo — plano técnico

Data: 19/10/2026. Documento vivo: cada decisão nova entra aqui com a data.

## 1. Ambiente encontrado

- Pasta do projeto vazia, sem stack definida. Máquina com Node 24, pnpm 11, Docker e Playwright (Chromium em cache).
- Os demais projetos do mesmo dono usam pnpm workspaces, NestJS, Next.js, Drizzle + postgres.js, argon2 e Vitest. O PontoNexo segue o mesmo padrão para facilitar manutenção.
- Versões atuais adotadas (out/2026): NestJS 12 (pacotes só ESM, validação nativa por Standard Schema), Next.js 16 (`proxy.ts` no lugar de `middleware.ts`), React 19, Tailwind 4, Zod 4, Drizzle ORM 0.45, PostgreSQL 17, TypeScript 6.

## 2. Arquitetura

```
apps/web  (Next.js 16, PWA)        apps/api (NestJS 12)                PostgreSQL 17
 ├─ /app      funcionário (celular) ─┐ ├─ auth, sessões, permissões        ├─ RLS por empregador
 ├─ /painel   empregador            ─┼─► ├─ cadastros, escalas, locais     ├─ gatilhos de imutabilidade
 └─ service worker (fila offline)    │   ├─ registrador (marcações, NSR)   └─ papel de aplicação sem
                                     │   ├─ tratamento (correções)            UPDATE/DELETE nos registros
   /api/* → reescrita para a API ────┘   ├─ espelho, fechamento, export
                                         ├─ auditoria, incidentes, LGPD
                                         └─ monitor de hora (SNTP), retenção, webhooks
packages/shared  contratos Zod (API e formulários) + regras de domínio puras (jornada, geocerca, sequência)
```

- **Mesma origem:** o Next reescreve `/api/*` para a API. O cookie de sessão é `HttpOnly`, `Secure` em produção e `SameSite=Strict`. Toda requisição que altera estado também exige o cabeçalho anti-CSRF (padrão *double submit*).
- **Registrador separado do portal.** O módulo `registrador` da API é a única parte que grava marcações. Ele foi desenhado para ser trocado por um REP-P certificado, por meio de um adaptador. O portal (cadastros, tratamento, espelho, relatórios) cumpre o papel de "programa de tratamento". Detalhes em `docs/02-conformidade-trabalhista.md`.
- **Por que não PostGIS:** as geocercas da v1 são círculos (centro + raio), e a distância é calculada pela fórmula de Haversine no domínio, com teste. PostGIS só se justifica com polígonos ou consultas espaciais em volume, que este caso não tem. Coordenadas ficam em `numeric(9,6)`.
- **Por que não particionar:** um funcionário doméstico gera cerca de 4 a 8 marcações por dia, ou seja, menos de 3 mil linhas por ano. Índices por `(employee_id, server_time)` bastam. Reavaliar acima de dezenas de milhões de linhas.

## 3. Decisões de domínio

| Tema | Decisão |
|---|---|
| Hora oficial | A hora oficial é a do servidor (UTC), no instante em que a marcação é recebida. A hora do celular é guardada apenas como evidência. Um monitor SNTP mede a defasagem do relógio do servidor contra servidores NTP configuráveis (padrão NTP.br) e grava cada medição. Defasagem acima do limite abre um incidente e marca as marcações com `clock_status = drift`. Em produção, o host precisa de chrony/NTP ativo. |
| Sequência | Validada no servidor, com bloqueio por empregador dentro da transação. Entrada → (início de intervalo → fim de intervalo)* → saída. Múltiplos intervalos são permitidos. Uma jornada aberta há mais de 20 h fica pendente de revisão, e a próxima marcação válida volta a ser a entrada. |
| Duplicidade e repetição | `client_request_id` (UUID gerado no aparelho) é único por funcionário: reenviar o mesmo pedido devolve a mesma marcação. Duas marcações com menos de 30 s de intervalo são recusadas. Há limite de requisições por usuário e por IP. |
| Localização | A posição é capturada apenas no momento da marcação, nunca em segundo plano. Fora do raio, com precisão baixa ou sem GPS, a marcação é **aceita com ocorrência** e exige justificativa; nunca há penalidade automática. O raio é configurável por local, começando em 100 m. |
| Wi-Fi | Navegadores (Android e iOS) **não expõem** SSID/BSSID a páginas web. Por isso, a v1 não usa Wi-Fi como evidência: registra apenas o tipo de conexão, quando o navegador informa. Isso está declarado na interface e na documentação. |
| Offline | Sem conexão, o app guarda a **tentativa** localmente e mostra "pendente de envio — ainda não registrada". Ao reconectar, envia a tentativa. O servidor registra com a hora do recebimento e anota a hora informada pelo aparelho numa ocorrência. Ajustar a hora exige solicitação de correção. Nada se perde em silêncio. |
| Correções | Os registros originais nunca mudam: gatilhos no banco bloqueiam `UPDATE` e `DELETE`, e o papel da aplicação não tem essas permissões. Uma correção é um **tratamento**, que pode ser inclusão, desconsideração (marcação indevida) ou abono de ausência. Cada tratamento guarda o valor anterior, o valor posterior, o motivo, o responsável e a data. **Regra das duas partes:** quem pede não decide. Se o funcionário pede, o empregador decide; se o empregador propõe, o funcionário aceita ou contesta. |
| Fechamento | O fechamento gera uma fotografia do espelho do mês, com *hash*. Mês fechado não aceita tratamento até ser reaberto, e reabrir exige motivo e fica auditado. O funcionário registra ciência. |
| Separação de dados | A jornada prevista vem das escalas com vigência, as marcações realizadas de `punch_records`, os ajustes aprovados de `treatments` e o espelho/cálculo é sempre derivado, nunca gravado por cima. |
| Integridade | Cada marcação, tratamento e evento de auditoria forma uma cadeia de *hash* SHA-256 por empregador. O comprovante é assinado com Ed25519 pela chave do servidor. **Não é ICP-Brasil nem PAdES** (ver conformidade). |

## 4. Modelo de dados (resumo)

Todas as chaves são UUID (`gen_random_uuid()`) e todos os instantes são `timestamptz` em UTC. O fuso de apresentação é o do empregador (padrão `America/Sao_Paulo`). Tabelas com `employer_id` têm RLS.

- **Identidade:** `users`, `roles`, `user_roles` (vínculo usuário × empregador × papel × funcionário), `sessions`, `password_reset_tokens`.
- **Cadastros:** `employers`, `employees`, `job_roles` (funções), `employment_contracts` (regime, carga semanal, acordos escritos, residência no local).
- **Jornada prevista:** `work_schedules`, `work_schedule_days`, `employee_schedules` (vigência), `holidays`.
- **Locais:** `work_locations`, `geofences` (vigência e raio), `employee_work_locations` (autorização com vigência).
- **Registro:** `employer_counters` (NSR), `work_sessions`, `punch_records`, `receipts`, `punch_alerts`.
- **Tratamento:** `correction_requests`, `treatments`, `monthly_closings`, `closing_acknowledgements`.
- **Governança:** `audit_events`, `incidents`, `incident_updates`, `time_sync_checks`, `integrations`, `integration_outbox`, `retention_policies`, `data_subject_requests`, `privacy_acknowledgements`.

O DDL completo está em `apps/api/src/db/schema.ts` e as migrações em `apps/api/drizzle/`. Os gatilhos, a RLS e as permissões estão na migração SQL `0001_seguranca.sql`.

## 5. Papéis

| Papel | Pode |
|---|---|
| `employer_owner` | Tudo dentro do empregador: cadastros, decidir correções, fechar e reabrir mês, usuários, retenção, integrações, incidentes, LGPD. **Não edita marcações**: não existe rota para isso. |
| `employer_manager` | Operação do dia a dia: cadastros, decidir correções, relatórios. Não gerencia usuários, configurações nem fechamento. |
| `accountant` | Somente leitura: espelhos, relatórios, exportações. |
| `employee` | Os próprios dados: marcar ponto, histórico, comprovantes, correções, ciência, privacidade. |

## 6. API

Documentação OpenAPI gerada dos próprios schemas Zod em `/api/docs` (UI) e `/api/docs/json`. Lista de rotas em `docs/04-api.md`.

## 7. Etapas de execução

1. Fundação: monorepo, Docker, banco, migrações, RLS, gatilhos, autenticação, auditoria.
2. Cadastros: empregador, funcionários, funções, contratos, locais, geocercas, escalas, feriados.
3. Registrador: marcação, sequência, geocerca, comprovante, ocorrências, offline.
4. Tratamento: solicitações, decisões, espelho, fechamento.
5. Governança: auditoria, incidentes, monitor de hora, retenção, LGPD, exportações, webhooks, backup.
6. Interface: PWA do funcionário e painel do empregador.
7. Testes (unitários, integração com banco real, ponta a ponta) e documentação de operação.

## 8. Riscos

| Risco | Tratamento |
|---|---|
| Uso oficial sem validação jurídica | O sistema mostra o aviso "registro idôneo conforme LC 150, art. 12 — sem certificação REP-P". A conformidade precisa ser validada por advogado trabalhista antes do uso oficial (ver doc 02). |
| Exigência de REP-P certificado | Registrador isolado atrás de uma interface. A integração com um REP-P de terceiros está documentada e **não está implementada nem simulada**. |
| Celular com hora errada | A hora oficial é sempre a do servidor; a divergência vira ocorrência. |
| GPS falso (*mock location*) | Não há como detectar com certeza num navegador. É tratado como sinal inconclusivo: gera ocorrência para revisão humana, sem penalidade automática. |
| Perda de dados offline | A fila fica no IndexedDB, o status "pendente" é explícito e o servidor aceita o reenvio de forma idempotente. |
| Administrador alterando histórico | Gatilhos no banco, papel sem `UPDATE`/`DELETE`, regra das duas partes e auditoria encadeada. |
| Vazamento de dados pessoais | RLS, minimização (sem salário, sem biometria), logs técnicos sem coordenadas nem CPF, backups cifrados. |
