# PontoNexo

Controle de jornada para trabalho doméstico: PWA para o funcionário marcar ponto no celular e painel para o empregador. NestJS 12 + Next.js 16 + PostgreSQL 17.

> **Registro eletrônico (LC 150/2015, art. 12) sem certificação REP-P.** Não declarado apto ao uso oficial antes de validação jurídica — ver [docs/02-conformidade-trabalhista.md](docs/02-conformidade-trabalhista.md).

- [Plano técnico e arquitetura](docs/01-plano-tecnico.md)
- [Conformidade trabalhista](docs/02-conformidade-trabalhista.md) · [LGPD](docs/03-lgpd.md)
- [API](docs/04-api.md) · [Instalação e operação](docs/05-operacao.md) · [Interface](docs/06-interface.md) · [Marca](brand/README.md)

```bash
pnpm install && pnpm chaves:gerar && pnpm infra:up && pnpm build:shared && pnpm db:migrate && pnpm db:seed && pnpm dev
```
