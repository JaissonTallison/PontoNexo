/** Frase curta que abre cada tela do painel, abaixo do título. Mudar aqui muda o cabeçalho da tela. */
export const SECAO = {
  inicio: { description: 'Como está o dia e o que precisa da sua atenção.' },
  funcionarios: { description: 'Cadastro, contrato, horário e acesso ao app de cada pessoa.' },
  novoFuncionario: { description: 'Cadastro guiado, uma etapa de cada vez.' },
  funcionario: { description: 'Dados, contrato, locais, horário e acesso ao app.' },
  marcacoes: { description: 'Todos os registros de ponto, do jeito que foram feitos.' },
  revisar: { description: 'Pedidos de ajuste e marcações com algo fora do comum.' },
  fechamento: { description: 'Resumo de todos, fechamento do mês e envio ao contador.' },
  espelho: { description: 'O mês de uma pessoa, dia a dia, pronto para imprimir.' },
  locais: { description: 'Onde o ponto pode ser marcado e a área de cada local.' },
  escalas: { description: 'Dias e horários de trabalho, e os feriados do ano.' },
  configuracoes: { description: 'Dados da casa, quem acessa o painel e integrações.' },
  auditoria: { description: 'Histórico de tudo o que foi feito no sistema.' },
  incidentes: { description: 'Problemas de segurança registrados e o que foi feito.' },
  privacidade: { description: 'Pedidos dos funcionários sobre os próprios dados e prazos de guarda.' },
  conta: { description: 'Senha, avisos e aparelhos conectados.' },
} satisfies Record<string, { description: string }>;
