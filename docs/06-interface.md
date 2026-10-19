# Guia de interface

Segue a skill `visual-profissional`. Decisões (19/10/2026):
- Tokens em `apps/web/src/app/globals.css`; classes comuns em `components/ui.tsx` (`cls`).
- Marca: `--color-marca #000F4B` (azul da logo), `--color-marcador #FE9A02` (laranja da logo). Ação em verde `#0F766E`.
- Fonte IBM Plex Sans/Mono. Cantos 8 px. Sem degradê na interface (só na logo colorida), sem pontos de status, status em texto colorido.
- App do funcionário: celular primeiro, botões de 64 px, barra inferior, confirmação com a avaliação da localização.
- Painel: menu marinho com a logo horizontal (fundo escuro), tabelas zebradas que viram cartões no celular.
- Distinção de status: tentativa pendente no aparelho (não registrada) · registrada · registrada com ocorrência · correção pendente · desconsiderada por correção.
- `scripts/verificar-codigo.mjs` barra degradê, `rounded-xl+`, `shadow-lg+`, emoji, `any`, `@ts-ignore`.
- Marca e versões da logo: `brand/README.md`.
