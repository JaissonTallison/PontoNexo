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

## Painel do empregador (19/10/2026)
Público majoritariamente idoso: linguagem do dia a dia, poucas decisões por tela, nada escondido atrás de termos técnicos.
- **Menu em grupos:** Dia a dia (Início, Funcionários, Marcações, Para revisar) · Fim do mês (Folha do mês, Espelho por funcionário) · Configurar (Casa e locais, Horários e feriados, Usuários e dados) · Mais opções, recolhido (Auditoria, Incidentes, LGPD). Itens com pendência mostram o número em laranja.
- **Para revisar** (`/painel/revisar`) junta pedidos de ajuste e ocorrências em abas; os endereços antigos `/painel/correcoes` e `/painel/ocorrencias` redirecionam.
- **Letra maior:** botão na barra superior; aumenta toda a escala (`html.letra-maior` em `globals.css`) e fica guardado no aparelho.
- **Início:** "Primeiros passos" (some quando tudo está pronto), aviso de mês sem fechamento, indicadores, "Hoje, por funcionário" (cartões no celular).
- **Novo funcionário:** assistente em 5 etapas (dados, contrato, horário, local, acesso); salva na 1ª etapa e permite pular as outras.
- **Folha do mês:** todos os funcionários numa tabela, "Fechar o mês de todos" (pula quem tem pedido pendente e diz o motivo) e exportação para o contador.
- **Casa e locais:** mapa (Leaflet + OpenStreetMap) com busca de endereço; toque ou arraste o marcador e veja o raio.
- **Confirmações** usam `useConfirm()` (`components/ui.tsx`), nunca `window.confirm`. CPF e celular com máscara (`lib/mascara.ts`).
- **Cabeçalho das telas (19/10/2026):** título + uma frase curta dizendo para que serve a tela, sem ícone (testado e removido: não combinou); frases centralizadas em `components/secoes.ts`. Toda tela tem "← Início" (ou a tela anterior) e as listas longas são paginadas (`usePaged` / `DataTable pageSize`).
