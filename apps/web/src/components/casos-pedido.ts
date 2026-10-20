import type { CorrectionKind } from '@pontonexo/shared';
import { Ban, CalendarX, Clock3, PencilLine, type LucideIcon } from 'lucide-react';

/** Tipos de pedido de ajuste no ponto: usados no "Esqueci" e no "Novo pedido" da tela Pedidos. */
export type Caso = 'esqueci' | 'errado' | 'semquerer' | 'faltei';

export const CASOS: Array<{ id: Caso; kind: CorrectionKind; title: string; hint: string; icon: LucideIcon }> = [
  { id: 'esqueci', kind: 'include_punch', title: 'Esqueci de marcar', hint: 'Entrada, pausa, retorno ou saída que ficou sem registro', icon: Clock3 },
  { id: 'errado', kind: 'replace_time', title: 'Marquei no horário errado', hint: 'Toquei na hora errada ou marquei antes da hora', icon: PencilLine },
  { id: 'semquerer', kind: 'disregard_punch', title: 'Marquei sem querer', hint: 'Marcação a mais ou por engano: ela deixa de contar nas horas', icon: Ban },
  { id: 'faltei', kind: 'justify_absence', title: 'Faltei e tenho motivo', hint: 'Consulta médica, atestado ou combinado com o empregador', icon: CalendarX },
];

export const isCaso = (v: string | null): v is Caso => CASOS.some((c) => c.id === v);
