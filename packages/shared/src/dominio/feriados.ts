/**
 * Feriados nacionais de data fixa:
 * - Lei 662/1949 (com redação da Lei 10.607/2002): 1/1, 21/4, 1/5, 7/9, 2/11, 15/11, 25/12.
 * - Lei 6.802/1980: 12/10.
 * - Lei 14.759/2023: 20/11 (Dia Nacional de Zumbi e da Consciência Negra).
 *
 * Feriados estaduais, municipais e religiosos (inclusive Sexta-feira da Paixão, Lei 9.093/1995)
 * variam por município e devem ser cadastrados pelo empregador. Carnaval e Corpus Christi
 * não são feriados nacionais por lei federal.
 */
const FIXOS: Array<[string, string]> = [
  ['01-01', 'Confraternização Universal'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência do Brasil'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
  ['12-25', 'Natal'],
];

export function nationalHolidays(year: number): Array<{ date: string; name: string }> {
  return FIXOS.filter(([md]) => !(md === '11-20' && year < 2024)).map(([md, name]) => ({ date: `${year}-${md}`, name }));
}
