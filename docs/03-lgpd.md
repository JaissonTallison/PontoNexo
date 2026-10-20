# LGPD — tratamento de dados

| Princípio | Implementação |
|---|---|
| Finalidade | Registro de jornada (obrigação legal, LC 150 art. 12) e segurança da conta |
| Minimização | Sem salário, documentos, fotos, biometria ou reconhecimento facial. Posição GPS só no toque de marcar; nada em segundo plano. Wi-Fi não é coletado (navegador não expõe) |
| Transparência | Aviso versionado (`PRIVACY_NOTICE`) exibido antes do primeiro uso; ciência registrada por versão |
| Acesso | RLS por empregador no banco; papéis com permissões mínimas; funcionário só vê os próprios dados |
| Segurança | argon2id, sessão HttpOnly/SameSite=Strict, CSRF, limite por sessão/IP, bloqueio após 5 erros, cabeçalhos de segurança, segredos cifrados (AES-256-GCM), backups cifrados |
| Logs | Auditoria sem coordenadas, CPF, senhas ou tokens (teste automatizado confere) |

## Dados de acesso pelo celular (outubro/2026)

| Dado | Finalidade | Guarda |
|---|---|---|
| Celular do funcionário | Enviar o código de acesso por SMS (opcional) | Enquanto houver vínculo |
| Códigos de acesso | Só o hash, 10 minutos de validade, uso único | Apagáveis após vencer |
| Passkey | Chave pública da credencial; a biometria fica no aparelho | Até o funcionário remover |
| Inscrição de notificação | Endereço técnico do aparelho para lembretes | Até desligar ou o navegador invalidar |
| Fala do "Falar o motivo" | Transcrita pelo serviço de voz do celular; o PontoNexo recebe só o texto | Não guardada |

O provedor de SMS (se contratado) passa a ser operador e deve constar no contrato e no aviso de privacidade.

## Direitos do titular (art. 18)

- **Cópia dos dados:** botão "Baixar meus dados" no app (JSON completo), imediato.
- **Pedidos** (acesso, correção, portabilidade, eliminação, informação): app → Privacidade. Prazo de 15 dias (art. 19, II), controlado no painel → Privacidade, com alerta de vencidos.
- **Eliminação:** dados de jornada não podem ser eliminados enquanto houver obrigação de guarda (LC 150, art. 42). Responder negando com essa justificativa; eliminar o restante.

## Retenção e descarte

| Dado | Prazo | Ação |
|---|---|---|
| Marcações, comprovantes, tratamentos, fechamentos, auditoria | 5 anos (até 2 após o fim do contrato) | Eliminação **manual** documentada: o banco bloqueia DELETE; um DBA, com registro em ata, desativa o gatilho numa janela controlada, apaga os registros prescritos do empregador e reativa |
| Coordenadas GPS | 395 dias (ajustável ≥ 30) | Função `pn_apply_coordinate_retention` zera lat/lng/precisão, mantém resultado, distância e resumo de hash |
| Sessões (IP, navegador) | 180 dias após o fim | Apagadas pela tarefa diária |
| Links de senha | 7 dias após vencer | Apagados pela tarefa diária |

## Incidentes (art. 48)

1. Registrar no painel → Incidentes (marcar "envolve dados pessoais").
2. Conter: encerrar sessões (troca de senha encerra todas), desativar acessos, revogar chaves.
3. Avaliar risco; se relevante, comunicar a ANPD e os titulares no prazo regulamentar (Resolução CD/ANPD 15/2024: 3 dias úteis) — **confirmar o prazo vigente com o DPO**.
4. Registrar atualizações até "Resolvido".
