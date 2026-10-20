# Roteiro de teste em celular real

Os testes automáticos rodam num navegador simulado. Antes de entregar, faça este roteiro num **Android simples** e num **iPhone**.

## 1. Acesso em HTTPS (obrigatório)

Celulares só liberam **localização, notificações e service worker** em HTTPS. Pelo IP da rede (`http://10.0.1.x:5571`) essas funções não aparecem.

Opção rápida, com túnel temporário (Cloudflare, sem conta):

```bash
# no computador, com o pnpm dev rodando
cloudflared tunnel --url http://localhost:5571
# anote o endereço https://<algo>.trycloudflare.com
```

Ajuste o `.env` para o endereço do túnel e **reinicie o `pnpm dev`**:

```
WEB_ORIGIN=https://<algo>.trycloudflare.com
COOKIE_SECURE=true
```

Ao terminar, volte os dois valores para `http://localhost:5571` e `false`.

## 2. Roteiro

| # | Passo | Esperado |
|---|---|---|
| 1 | Abrir o endereço, entrar com `maria@pontonexo.local` / `PontoNexo2026` (aba E-mail) | Aviso de privacidade; depois a tela de ponto |
| 2 | Tocar no bloco colorido "Toque para registrar" | O celular pede a localização (só agora) |
| 3 | Permitir e confirmar | "Entrada registrada às…" e comprovante |
| 4 | Dentro de casa, longe da janela | Ver se o GPS dá "fraco" com frequência; ajustar o raio do local no painel se preciso |
| 5 | Negar a localização numa marcação | Pede o motivo em botões prontos; marca com observação |
| 6 | Modo avião → marcar → tirar do modo avião | "esperando internet" → some sozinho e aparece no "Hoje" |
| 7 | Perfil › Este celular › Instalar o app | Android: botão Instalar. iPhone: passo a passo (Safari › Compartilhar › Adicionar à Tela de Início) |
| 8 | Abrir pelo ícone instalado › Perfil › Este celular › Ligar lembretes | Chega a notificação "Lembretes ligados" |
| 9 | Esqueci de marcar › "Outro motivo" › Falar o motivo | O texto falado aparece no campo |
| 10 | Comprovante › Baixar PDF | Abre o PDF do comprovante |

No iPhone, notificação só funciona com o app instalado na tela inicial (iOS 16.4 ou mais novo).

## 3. Anote

Modelo do aparelho, versão do sistema, navegador, o que falhou e um print. Problemas de GPS anote com a precisão mostrada.
