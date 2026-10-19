'use client';
import { DAY_ISSUE_LABEL, formatDateBR, INFO_ISSUES, monthDays, weekdayShort, type TimesheetView } from '@pontonexo/shared';
import { dataHora, duracao, hora } from '@/lib/formato';

const TREATMENT_LABEL = { inclusion: 'Inclusão', disregard: 'Desconsideração', absence_justification: 'Abono de ausência' } as const;

function expected(d: TimesheetView['days'][number]) {
  if (d.expected.kind === 'workday') return `${d.expected.start}–${d.expected.end}`;
  if (d.expected.kind === 'holiday') return 'Feriado';
  if (d.expected.kind === 'rest') return 'Descanso';
  return '—';
}

function valueText(v: Record<string, unknown> | null, tz: string): string {
  if (!v) return '—';
  const parts: string[] = [];
  if (typeof v.nsr === 'number') parts.push(`NSR ${v.nsr}`);
  const t = (v.time ?? v.serverTime ?? v.replacedBy) as string | undefined;
  if (t) parts.push(dataHora(t, tz));
  if (v.disregarded) parts.push('desconsiderada');
  if (typeof v.status === 'string') parts.push(v.status);
  return parts.join(' · ') || '—';
}

/**
 * Espelho de ponto para impressão (A4). Só aparece no papel/PDF; a tela usa os componentes interativos.
 * Separa jornada prevista, marcações, tratamentos e cálculo, e traz campos de assinatura.
 */
export function PrintableTimesheet({ t }: { t: TimesheetView }) {
  const tz = t.timezone;
  const days = monthDays(t.month);
  const period = `${formatDateBR(days[0]!)} a ${formatDateBR(days[days.length - 1]!)}`;
  const closed = t.closing?.status === 'closed';
  const emitted = dataHora(t.generatedAt, tz);

  return (
    <article className="espelho-impressao hidden text-[9pt] leading-snug text-black print:block">
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-2">
        <div>
          <h1 className="text-[15pt] font-bold tracking-wide">ESPELHO DE PONTO</h1>
          <p className="text-[10pt]">Período: {period}</p>
        </div>
        <img src="/brand/pontonexo-logo-horizontal-mono-preto.svg" alt="PontoNexo" className="h-9 w-auto" />
      </header>

      <section className="mt-2 grid grid-cols-2 gap-x-6 border-b border-black pb-2">
        <div>
          <p className="text-[7.5pt] font-bold uppercase">Empregador</p>
          <p className="font-semibold">{t.employer.name}</p>
          <p>CPF {t.employer.document}</p>
          {t.employer.address ? <p>{t.employer.address}</p> : null}
        </div>
        <div>
          <p className="text-[7.5pt] font-bold uppercase">Empregado(a)</p>
          <p className="font-semibold">{t.employee.fullName}</p>
          <p>
            CPF {t.employee.cpf}
            {t.employee.jobRole ? ` · ${t.employee.jobRole}` : ''}
          </p>
          <p>{t.contract ? `${t.contract.regime} · ${t.contract.weeklyHours} h semanais` : 'Sem contrato vigente no período'}</p>
        </div>
      </section>

      <p className="mt-1.5 text-[8.5pt]">
        <span className="font-bold">Situação: </span>
        {closed
          ? `Mês fechado em ${dataHora(t.closing!.closedAt, tz)} por ${t.closing!.closedByName}.`
          : t.closing?.status === 'reopened'
            ? `Mês reaberto (${t.closing.reopenReason}). Documento provisório, sujeito a alterações.`
            : 'Mês não fechado. Documento provisório, sujeito a alterações.'}
        {t.contract ? ` Compensação: ${t.contract.compensation}.` : ''}
      </p>

      <table className="mt-2 w-full border-collapse text-[8.5pt]">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-1 pr-1">Data</th>
            <th className="py-1 pr-1">Previsto</th>
            <th className="py-1 pr-1">Marcações</th>
            <th className="py-1 pr-1 text-right">Trabalhado</th>
            <th className="py-1 pr-1 text-right">Noturno</th>
            <th className="py-1 pr-1 text-right">Excedente</th>
            <th className="py-1 pr-1 text-right">Falta/atraso</th>
            <th className="py-1">Observações</th>
          </tr>
        </thead>
        <tbody>
          {t.days.map((d) => {
            const obs = [
              ...(d.expected.holidayName ? [d.expected.holidayName] : []),
              ...(d.justified ? ['Ausência abonada'] : []),
              ...d.disregarded.map((x) => `${hora(x.at, tz)} desconsiderada`),
              ...d.issues.filter((i) => !INFO_ISSUES.has(i.code) && i.code !== 'worked_on_rest_day').map((i) => DAY_ISSUE_LABEL[i.code]),
            ];
            const extra = d.overtimeSeconds || d.restOrHolidaySeconds;
            return (
              <tr key={d.date} className="border-b border-neutral-300 align-top">
                <td className="py-0.5 pr-1 whitespace-nowrap tabular-nums">
                  {formatDateBR(d.date).slice(0, 5)} {weekdayShort(d.date)}
                </td>
                <td className="py-0.5 pr-1 whitespace-nowrap">{expected(d)}</td>
                <td className="py-0.5 pr-1 font-mono tabular-nums">
                  {d.punches.map((p) => `${hora(p.at, tz)}${p.source === 'inclusion' ? '*' : ''}`).join('  ') || '—'}
                </td>
                <td className="py-0.5 pr-1 text-right tabular-nums">{d.workedSeconds ? duracao(d.workedSeconds) : '—'}</td>
                <td className="py-0.5 pr-1 text-right tabular-nums">{d.nightSeconds ? duracao(d.nightSeconds) : '—'}</td>
                <td className="py-0.5 pr-1 text-right tabular-nums">{extra ? duracao(extra) : '—'}</td>
                <td className="py-0.5 pr-1 text-right tabular-nums">{d.deficitSeconds ? duracao(d.deficitSeconds) : '—'}</td>
                <td className="py-0.5">{obs.join('; ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-[7.5pt]">
        * Marcação incluída por tratamento aprovado. Marcações desconsideradas continuam guardadas no registro original. Horários no fuso {tz}. Excedente em domingo ou feriado aparece na coluna Excedente.
      </p>

      <section className="mt-3 break-inside-avoid">
        <h2 className="border-b border-black text-[10pt] font-bold">Resumo do período</h2>
        <table className="mt-1 w-full text-[8.5pt]">
          <tbody>
            <tr>
              <td>Jornada prevista</td>
              <td className="text-right tabular-nums">{duracao(t.totals.expectedSeconds)}</td>
              <td className="pl-6">Horas trabalhadas</td>
              <td className="text-right tabular-nums">{duracao(t.totals.workedSeconds)}</td>
            </tr>
            <tr>
              <td>Horas noturnas (relógio)</td>
              <td className="text-right tabular-nums">{duracao(t.totals.nightSeconds)}</td>
              <td className="pl-6">Acréscimo da hora noturna reduzida</td>
              <td className="text-right tabular-nums">{duracao(t.totals.nightBonusSeconds)}</td>
            </tr>
            <tr>
              <td>Excedente em dias úteis</td>
              <td className="text-right tabular-nums">{duracao(t.totals.overtimeSeconds)}</td>
              <td className="pl-6">Trabalho em domingos e feriados</td>
              <td className="text-right tabular-nums">{duracao(t.totals.restOrHolidaySeconds)}</td>
            </tr>
            <tr>
              <td>Faltas e atrasos</td>
              <td className="text-right tabular-nums">{duracao(t.totals.deficitSeconds)}</td>
              <td className="pl-6">Faltas sem justificativa / abonadas</td>
              <td className="text-right tabular-nums">
                {t.totals.absences} / {t.totals.justifiedAbsences}
              </td>
            </tr>
            <tr>
              <td>Horas extras a pagar</td>
              <td className="text-right font-bold tabular-nums">{duracao(t.compensation.paidOvertimeSeconds)}</td>
              <td className="pl-6">{t.compensation.regime === 'lc150_bank' ? 'Saldo para compensação (banco)' : ''}</td>
              <td className="text-right tabular-nums">{t.compensation.regime === 'lc150_bank' ? duracao(t.compensation.bankSeconds) : ''}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-[7.5pt]">{t.compensation.note}</p>
      </section>

      {t.treatments.length ? (
        <section className="mt-3">
          <h2 className="border-b border-black text-[10pt] font-bold">Tratamentos aplicados (correções aprovadas)</h2>
          <table className="mt-1 w-full border-collapse text-[8pt]">
            <thead>
              <tr className="border-b border-neutral-400 text-left">
                <th className="py-0.5 pr-2">Tipo</th>
                <th className="py-0.5 pr-2">Antes</th>
                <th className="py-0.5 pr-2">Depois</th>
                <th className="py-0.5 pr-2">Motivo e decisão</th>
                <th className="py-0.5">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {t.treatments.map((x) => (
                <tr key={x.id} className="border-b border-neutral-300 align-top">
                  <td className="py-0.5 pr-2">{TREATMENT_LABEL[x.kind]}{x.absenceDate ? ` ${formatDateBR(x.absenceDate)}` : ''}</td>
                  <td className="py-0.5 pr-2">{valueText(x.previousValue, tz)}</td>
                  <td className="py-0.5 pr-2">{valueText(x.newValue, tz)}</td>
                  <td className="py-0.5 pr-2">{x.reason}</td>
                  <td className="py-0.5">
                    {x.createdByName}, {dataHora(x.createdAt, tz)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="mt-5 break-inside-avoid">
        <p className="text-[8.5pt]">
          Declaro que os horários acima correspondem à jornada efetivamente praticada no período, registrada por meio eletrônico, incluídos os ajustes aprovados.
        </p>
        <div className="mt-10 grid grid-cols-2 gap-10 text-center text-[8.5pt]">
          <div>
            <div className="border-t border-black pt-1">{t.employer.name}</div>
            <div>Empregador · CPF {t.employer.document}</div>
          </div>
          <div>
            <div className="border-t border-black pt-1">{t.employee.fullName}</div>
            <div>Empregado(a) · CPF {t.employee.cpf}</div>
          </div>
        </div>
        <p className="mt-6 text-[8.5pt]">Local e data: ____________________________________, ____/____/________</p>
      </section>

      <footer className="mt-5 border-t border-black pt-1 text-[7pt]">
        <p>
          Emitido em {emitted} pelo sistema PontoNexo. Registro eletrônico de jornada (LC 150/2015, art. 12), sem certificação REP-P. Cálculos de referência: conferir com o contador antes da folha de pagamento.
        </p>
        {t.closing ? <p className="break-all">Fotografia do fechamento (SHA-256): {t.closing.snapshotHash}</p> : null}
      </footer>
    </article>
  );
}
