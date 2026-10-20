# Conformidade trabalhista — análise e pendências

Data: 19/10/2026. **Este documento não é parecer jurídico.** O sistema não deve ser declarado apto ao uso oficial antes da validação por advogado trabalhista.

## O que a lei exige (texto conferido)

Fonte: LC 150/2015, texto atualizado da Câmara dos Deputados (inclui a Lei 15.455/2026, que não trata de jornada).

| Dispositivo | Regra | Como o sistema trata |
|---|---|---|
| art. 12 | Registro do horário "por qualquer meio manual, mecânico ou eletrônico, desde que idôneo" | Registro eletrônico com hora do servidor, NSR, hash encadeado, imutabilidade no banco e comprovante assinado |
| art. 2º | 8 h/dia, 44 h/semana; extra ≥ 50%; § 4º–5º compensação: 40 primeiras horas pagas, saldo em até 1 ano; § 8º domingo/feriado não compensado em dobro | Espelho calcula previsto, excedente, faltas, domingos/feriados e compensação de referência |
| art. 3º | Tempo parcial até 25 h | Validação no contrato |
| art. 10 | 12×36 por acordo escrito; feriados compensados | Escala de ciclo; feriado não gera excedente; exige referência ao acordo |
| art. 11 | Viagem com acordo escrito | Local tipo "viagem" sem cerca; acordo no contrato |
| art. 13 | Intervalo 1–2 h; 30 min com acordo; quem reside pode dividir em 2 períodos ≥ 1 h até 4 h; § 2º anotação obrigatória, vedada pré-assinalação | Intervalos são marcados (nunca pré-assinalados); ocorrências de intervalo apontadas |
| art. 14 | Noturno 22 h–5 h, hora de 52 min 30 s, adicional ≥ 20% | Horas noturnas e acréscimo da hora reduzida (fator 8/7) |
| art. 15 | 11 h entre jornadas | Ocorrência quando menor |
| art. 16 | DSR 24 h, feriados | Feriados nacionais por lei federal + cadastro local |
| art. 19 | CLT subsidiária | Limite de 2 h extras/dia (CLT 59) e intervalo acima de 6 h (CLT 71) usados como referência — **validar** |
| arts. 42–43 | Guarda enquanto não prescrever (5 anos, até 2 após o fim) | Retenção de 1.825 dias para registros; eliminação manual documentada |

## Portaria MTP 671/2021 e REP-P

Fonte: Perguntas e Respostas do MTE (gov.br) sobre a Portaria 671.

- REP-P exige **certificado de registro de programa no INPI**, atestado técnico e termo de responsabilidade assinados com certificado ICP-Brasil.
- AFD e AEJ: assinatura **CAdES** destacada (.p7s); "somente o REP pode gerar o AFD para efeitos fiscais e legais".
- Comprovante em PDF com assinatura **PAdES**; extração de comprovantes das últimas 48 h no mínimo.
- Tratamento: só acrescenta informação ou indica marcação indevida; a empresa não pode inserir marcação.
- **Ponto em aberto:** o texto da FAQ não diz se a Portaria 671 (que regulamenta o art. 74 da CLT) obriga o empregador doméstico, cujo registro está no art. 12 da LC 150 com aplicação apenas subsidiária da CLT. **Precisa de parecer jurídico.**

## Situação do PontoNexo

| Item | Situação |
|---|---|
| Registro idôneo (LC 150, art. 12) | Implementado; idoneidade depende de validação jurídica |
| REP-P certificado | **Não é.** Sem registro INPI, sem atestado técnico. Não declaramos conformidade com a Portaria 671 |
| AFD / AEJ | **Não gerados.** Exportações CSV/JSON são de conferência, não substituem AFD/AEJ |
| Comprovante | Gerado a cada marcação, com NSR, empregador, trabalhador, data/hora, local, hash e assinatura Ed25519 do sistema. **Não é PAdES/ICP-Brasil.** Disponível ao funcionário a qualquer tempo e imprimível em PDF pelo navegador |
| Tratamento | Inclusão, desconsideração e abono, sem alterar originais; regra das duas partes (empregador não insere marcação sem aceite do funcionário) |
| Hora oficial | Relógio do servidor + monitor SNTP (NTP.br) com incidente em caso de defasagem. Sincronização com a Hora Legal Brasileira depende do NTP do host |

## Integração com REP-P de terceiros (não implementada)

Desenho previsto: o módulo `registrador` é o único ponto que grava marcações. Para operar com um REP-P certificado:

1. O REP-P certificado passa a ser o registrador (gera NSR, comprovante PAdES e AFD).
2. O PontoNexo recebe as marcações por API do fornecedor (adaptador `RegistradorExterno`, a escrever) e atua como programa de tratamento: escalas, correções, espelho, fechamento.
3. O webhook genérico (`integrations`) já exporta eventos assinados com HMAC para sistemas externos.

Nenhum fornecedor foi escolhido; nada está simulado como se existisse.

## Pendências para uso oficial

1. Parecer jurídico sobre aplicabilidade da Portaria 671 ao empregador doméstico e sobre a idoneidade do meio adotado.
2. Se exigido REP-P: contratar fornecedor certificado e escrever o adaptador; ou registrar o programa no INPI e cumprir o Anexo IX (AFD/AEJ, CAdES/PAdES, atestado técnico).
3. Validar com contador as regras de cálculo marcadas como referência (compensação, limites, intervalo acima de 6 h, Súmula 60 do TST sobre prorrogação noturna — não implementada).
4. Revisar com o encarregado (DPO) o aviso de privacidade (`packages/shared/src/dominio/privacidade.ts`).

## Início do registro no sistema (20/10/2026)
Dias de trabalho **antes da primeira marcação** do funcionário (original ou incluída por ajuste aprovado) aparecem como "Antes do início do ponto": sem jornada prevista, sem falta e sem horas negativas. Motivo: quem implanta o sistema com o funcionário já trabalhando não tem registro desses dias, e ausência de registro não é prova de falta. A partir da primeira marcação, dia de trabalho sem registro volta a contar como falta normalmente. Se houve falta real antes disso, o empregador registra pelo ajuste "Justificar ausência" ou fora do sistema.
