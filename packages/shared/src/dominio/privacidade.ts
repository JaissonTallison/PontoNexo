/**
 * Aviso de privacidade apresentado ao funcionário (LGPD, arts. 6º e 9º).
 * Cada mudança de conteúdo exige nova versão: o funcionário registra ciência de novo.
 * Texto-base sujeito a revisão do encarregado (DPO) / advogado do empregador.
 */
export const PRIVACY_NOTICE_VERSION = '2026-10-19';

export const PRIVACY_NOTICE: Array<{ title: string; body: string }> = [
  {
    title: 'Quem trata seus dados',
    body:
      'O controlador é o seu empregador doméstico, que tem a obrigação legal de registrar seu horário de trabalho ' +
      '(Lei Complementar 150/2015, art. 12). O PontoNexo é a ferramenta usada para isso e atua como operador.',
  },
  {
    title: 'O que é coletado e para quê',
    body:
      'Nome, CPF, e-mail e telefone: identificar você e emitir comprovantes. Horário de cada marcação, feito pelo relógio do servidor: ' +
      'registrar a jornada. Posição GPS e precisão informadas pelo celular, apenas no momento em que você toca para marcar: ' +
      'indicar se a marcação foi feita num local autorizado. Endereço IP e navegador: segurança da conta.',
  },
  {
    title: 'O que não é coletado',
    body:
      'Não há rastreamento contínuo nem em segundo plano, reconhecimento facial, biometria, fotos, contatos ou dados de outros aplicativos. ' +
      'O navegador não informa o nome da rede Wi-Fi, e o sistema não tenta obtê-lo.',
  },
  {
    title: 'Bases legais',
    body:
      'Cumprimento de obrigação legal (LGPD, art. 7º, II) para o registro da jornada e a guarda dos documentos; ' +
      'execução do contrato de trabalho (art. 7º, V) para o cadastro; legítimo interesse (art. 7º, IX) para a posição no momento ' +
      'da marcação e os registros de segurança, limitado ao necessário para comprovar a idoneidade do registro.',
  },
  {
    title: 'Por quanto tempo',
    body:
      'Marcações, tratamentos e comprovantes ficam guardados enquanto os créditos trabalhistas não prescreverem: até 5 anos, ' +
      'com limite de 2 anos após o fim do contrato (LC 150, arts. 42 e 43). As coordenadas GPS são reduzidas ao resultado ' +
      '(dentro ou fora do raio) depois do prazo configurado pelo empregador. Registros de acesso ficam por 6 meses.',
  },
  {
    title: 'Quem vê',
    body:
      'Você vê todos os seus registros. O empregador e quem ele autorizar (gestor delegado e contador) veem os registros de trabalho. ' +
      'Ninguém pode apagar ou alterar uma marcação: correções criam um registro novo e ficam no histórico.',
  },
  {
    title: 'Seus direitos',
    body:
      'Você pode pedir confirmação e acesso, correção, cópia dos dados (portabilidade), informação sobre compartilhamento e eliminação ' +
      'do que não for exigido por lei, pelo menu Privacidade. O empregador tem 15 dias para responder (LGPD, art. 19, II).',
  },
  {
    title: 'Ocorrências não são punições',
    body:
      'Marcar fora do raio, sem GPS ou sem internet não é tratado como fraude. O sistema registra a ocorrência e sua justificativa ' +
      'para revisão por uma pessoa. Nenhuma penalidade é aplicada automaticamente.',
  },
];
