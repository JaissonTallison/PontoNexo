'use client';
import { DAY_ISSUE_LABEL, formatDateBR, INFO_ISSUES, PUNCH_TYPE_LABEL, weekdayShort, type TimesheetView } from '@pontonexo/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Tone } from './ui';
import { duracao, hora, mesAnterior, nomeMes } from '@/lib/formato';

export function MonthNav({ month, onChange, max }: { month: string; onChange: (m: string) => void; max: string }) {
  const next = (() => {
    const [y, m] = month.split('-').map(Number) as [number, number];
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  })();
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={() => onChange(mesAnterior(month))} aria-label="Mês anterior">
        <ChevronLeft size={16} />
      </Button>
      <span className="min-w-[160px] text-center font-semibold text-marca">{nomeMes(month)}</span>
      <Button variant="secondary" size="sm" onClick={() => onChange(next)} disabled={next > max} aria-label="Próximo mês">
        <ChevronRight size={16} />
      </Button>
    </div>
  );
}

const expectedText = (d: TimesheetView['days'][number]) =>
  d.expected.kind === 'workday'
    ? `${d.expected.start}–${d.expected.end}${d.expected.holidayName ? ` (feriado compensado: ${d.expected.holidayName})` : ''}`
    : d.expected.kind === 'holiday'
      ? `Feriado: ${d.expected.holidayName}`
      : d.expected.kind === 'rest'
        ? 'Descanso'
        : 'Sem escala';

export function Totals({ t }: { t: TimesheetView }) {
  const items: Array<[string, string]> = [
    ['Previsto', duracao(t.totals.expectedSeconds)],
    ['Trabalhado', duracao(t.totals.workedSeconds)],
    ['Noturno (relógio)', duracao(t.totals.nightSeconds)],
    ['Acréscimo hora noturna', duracao(t.totals.nightBonusSeconds)],
    ['Excedente', duracao(t.totals.overtimeSeconds)],
    ['Faltas e atrasos', duracao(t.totals.deficitSeconds)],
    ['Domingos e feriados', duracao(t.totals.restOrHolidaySeconds)],
    ['Faltas sem justificativa', String(t.totals.absences)],
  ];
  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-sm text-texto-3">{k}</dt>
            <dd className="font-semibold tabular">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-texto-2">
        {t.compensation.note} Pagas como extra: <span className="font-semibold tabular">{duracao(t.compensation.paidOvertimeSeconds)}</span>
        {t.compensation.regime === 'lc150_bank' ? (
          <>
            {' '}
            · banco de horas: <span className="font-semibold tabular">{duracao(t.compensation.bankSeconds)}</span>
          </>
        ) : null}
        .
      </p>
      <p className="mt-1 text-xs text-texto-3">Cálculo de referência. Valores de folha devem ser conferidos pelo contador.</p>
    </div>
  );
}

/** Espelho dia a dia. Previsto, marcações (originais e incluídas), desconsideradas e ocorrências separados. */
export function TimesheetTable({ t }: { t: TimesheetView }) {
  const tz = t.timezone;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-borda text-left text-texto-2">
            <th className="px-2 py-2">Dia</th>
            <th className="px-2 py-2">Previsto</th>
            <th className="px-2 py-2">Marcações</th>
            <th className="px-2 py-2 text-right">Trabalhado</th>
            <th className="px-2 py-2 text-right">Excedente</th>
            <th className="px-2 py-2 text-right">Falta</th>
            <th className="px-2 py-2">Ocorrências</th>
          </tr>
        </thead>
        <tbody>
          {t.days.map((d) => {
            const issues = d.issues.filter((i) => !INFO_ISSUES.has(i.code));
            const info = d.issues.filter((i) => INFO_ISSUES.has(i.code));
            return (
              <tr key={d.date} className="border-b border-borda align-top even:bg-zebra hover:bg-realce">
                <td className="px-2 py-2 whitespace-nowrap tabular">
                  {formatDateBR(d.date).slice(0, 5)} <span className="text-texto-3">{weekdayShort(d.date)}</span>
                </td>
                <td className="px-2 py-2 text-texto-2">{expectedText(d)}</td>
                <td className="px-2 py-2">
                  <span className="font-mono tabular">
                    {d.punches.map((p) => (
                      <span key={p.ref} title={PUNCH_TYPE_LABEL[p.type]} className={`mr-2 ${p.source === 'inclusion' ? 'text-acao' : ''}`}>
                        {hora(p.at, tz)}
                        {p.source === 'inclusion' ? '*' : ''}
                      </span>
                    ))}
                  </span>
                  {d.disregarded.map((x) => (
                    <span key={x.id} className="mr-2 font-mono text-texto-3 line-through" title="Desconsiderada por tratamento">
                      {hora(x.at, tz)}
                    </span>
                  ))}
                  {d.justified ? <Tone tone="ok">Abonado</Tone> : null}
                </td>
                <td className="px-2 py-2 text-right tabular">{d.workedSeconds ? duracao(d.workedSeconds) : '—'}</td>
                <td className="px-2 py-2 text-right tabular">{d.overtimeSeconds ? duracao(d.overtimeSeconds) : d.restOrHolidaySeconds ? duracao(d.restOrHolidaySeconds) : '—'}</td>
                <td className="px-2 py-2 text-right tabular">{d.deficitSeconds ? <Tone tone="error">{duracao(d.deficitSeconds)}</Tone> : '—'}</td>
                <td className="px-2 py-2">
                  {issues.map((i) => (
                    <div key={i.code} className="text-atencao">
                      {DAY_ISSUE_LABEL[i.code]}
                      {i.detail ? ` (${i.detail})` : ''}
                    </div>
                  ))}
                  {info.map((i) => (
                    <div key={i.code} className="text-texto-3">
                      {DAY_ISSUE_LABEL[i.code]}
                    </div>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-texto-3">* incluída por correção aprovada · riscado: desconsiderada por correção (o registro original continua guardado)</p>
    </div>
  );
}
