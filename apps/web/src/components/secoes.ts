/**
 * Textos de cada tela do painel: a frase curta abaixo do título (`description`) e a explicação
 * de como a tela funciona (`help`), reunida na página Ajuda e explicações.
 */
export interface Secao {
  /** nome da tela na Ajuda (a página pode mostrar outro título, como o nome do funcionário) */
  helpTitle: string;
  description: string;
  help: string;
}

const s = (helpTitle: string, description: string, help: string): Secao => ({ helpTitle, description, help });

export const SECAO = {
  inicio: s(
    'Início',
    'Como está o dia e o que precisa da sua atenção.',
    'O Início resume o dia: quem está trabalhando, o que espera por você e os atalhos. Os cartões são clicáveis e levam à tela de cada assunto. Enquanto faltar algo na configuração, "Primeiros passos" mostra o próximo passo.',
  ),
  funcionarios: s(
    'Funcionários',
    'Cadastro, contrato, horário e acesso ao app de cada pessoa.',
    'Cada pessoa tem uma ficha com contrato, horário, locais onde pode marcar o ponto e o acesso ao app. Use "Novo funcionário" para o cadastro guiado. Clique no nome para abrir a ficha.',
  ),
  novoFuncionario: s(
    'Novo funcionário',
    'Cadastro guiado, uma etapa de cada vez.',
    'São 5 etapas curtas: dados, contrato, horário, local e acesso. O cadastro é salvo já na primeira; as outras podem ser puladas e completadas depois na ficha do funcionário.',
  ),
  funcionario: s(
    'Ficha do funcionário',
    'Dados, contrato, locais, horário e acesso ao app.',
    'Na ficha você completa o que falta para o funcionário marcar o ponto: contrato, locais autorizados, horário e envio do acesso ao app. Tudo o que muda fica registrado na auditoria.',
  ),
  marcacoes: s(
    'Marcações',
    'Todos os registros de ponto, do jeito que foram feitos.',
    'Aqui estão todas as marcações, como foram feitas. Ninguém pode editar ou apagar: se algo estiver errado, o ajuste é feito em "Para revisar" e aparece no espelho. Use os filtros para achar uma pessoa ou um período.',
  ),
  revisar: s(
    'Para revisar',
    'Pedidos de ajuste e marcações com algo fora do comum.',
    'Na aba "Pedidos de ajuste" você aprova ou recusa o que o funcionário pediu, como uma marcação esquecida ou uma falta abonada. Na aba "Ocorrências" aparecem marcações fora do local ou feitas sem internet: confira e registre a revisão. Nada é punido automaticamente.',
  ),
  fechamento: s(
    'Folha do mês',
    'Resumo de todos, fechamento do mês e envio ao contador.',
    'No começo de cada mês, confira o mês anterior aqui. "Fechar o mês de todos" guarda uma fotografia do espelho de cada funcionário; quem tem pedido pendente fica de fora até você decidir. Depois, exporte a planilha para o contador.',
  ),
  espelho: s(
    'Espelho por funcionário',
    'O mês de uma pessoa, dia a dia, pronto para imprimir.',
    'Escolha o funcionário e o mês para ver, dia a dia, o horário previsto, as marcações, as horas trabalhadas e os ajustes. "Imprimir" gera o documento com os campos de assinatura.',
  ),
  locais: s(
    'Casa e locais',
    'Onde o ponto pode ser marcado e a área de cada local.',
    'Cadastre a casa e outros lugares de trabalho. A área (cerca) é o círculo no mapa: a marcação feita dentro dele conta como feita no local. Comece com 100 metros e ajuste se o sinal do celular variar muito.',
  ),
  escalas: s(
    'Horários e feriados',
    'Dias e horários de trabalho, e os feriados do ano.',
    'O horário diz em que dias e horas cada funcionário trabalha. Ele serve para os lembretes no celular e para calcular atrasos e horas extras. Na aba Feriados, confira e acrescente os feriados da sua cidade.',
  ),
  configuracoes: s(
    'Usuários e dados',
    'Dados da casa, quem acessa o painel e integrações.',
    'Confira os dados da casa que saem nos documentos, convide outra pessoa para ajudar no painel (por exemplo, um gestor) e, se usar outro sistema, cadastre a integração.',
  ),
  auditoria: s(
    'Auditoria',
    'Histórico de tudo o que foi feito no sistema.',
    'Registro de tudo o que foi feito no sistema: o quê, por quem e quando. "Verificar integridade" confirma que nenhum registro foi alterado depois de gravado.',
  ),
  incidentes: s(
    'Incidentes',
    'Problemas de segurança registrados e o que foi feito.',
    'Use se acontecer algum problema de segurança, como senha vazada ou celular perdido. Registre o que houve e o que foi feito; a LGPD pede esse registro.',
  ),
  privacidade: s(
    'Privacidade (LGPD)',
    'Pedidos dos funcionários sobre os próprios dados e prazos de guarda.',
    'Aqui chegam os pedidos dos funcionários sobre os próprios dados: ver, corrigir ou receber uma cópia. O prazo de resposta é de 15 dias. Mais abaixo, por quanto tempo cada tipo de dado fica guardado.',
  ),
  conta: s(
    'Minha conta',
    'Senha, avisos e aparelhos conectados.',
    'Troque sua senha, ligue os avisos neste aparelho para saber na hora quando chega um pedido de ajuste e veja em quais aparelhos sua conta está aberta.',
  ),
} satisfies Record<string, Secao>;
