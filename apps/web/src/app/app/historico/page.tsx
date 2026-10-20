'use client';
import { formatDateBR, formatDuration, isoWeekday, type PunchType, type TimesheetView } from '@pontonexo/shared';
import { Check, ChevronDown, ChevronRight, Printer } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { MonthNav } from '@/components/espelho';
import { PrintableTimesheet } from '@/components/espelho-impressao';
import { useSession } from '@/components/session';
import { ErrorState, Loading } from '@/components/ui';
import { hojeLocal, hora, mesAtual } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

type Day = TimesheetView['days'][number];

const WEEKDAY = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const NAME: Record<PunchType, string> = { clock_in: 'Entrada', break_start: 'Pausa', break_end: 'Retorno', clock_out: 'Saída' };

/** "7h57" / "0h33" */
const hm = (s: number) => formatDuration(s).replace('min', '').replace('h ', 'h');

function dayStatus(d: Day, today: string): { text: string; tone: 'ok' | 'warn' | 'muted' } {
  if (d.issues.some((i) => i.code === 'in_progress') || (d.date === today && d.punches.length && !d.punches.some((p) => p.type === 'clock_out')))
    return { text: 'Em andamento', tone: 'muted' };
  if (d.issues.some((i) => i.code === 'missing_clock_out')) return { text: 'Faltou a saída', tone: 'warn' };
  if (d.issues.some((i) => i.code === 'orphan_punch')) return { text: 'Marcação fora de ordem', tone: 'warn' };
  if (d.absent) return { text: 'Sem marcação', tone: 'warn' };
  if (d.justified) return { text: 'Falta abonada', tone: 'ok' };
  if (d.expected.kind === 'holiday') return { text: d.expected.holidayName ?? 'Feriado', tone: 'muted' };
  if (d.expected.kind === 'rest') return { text: 'Folga trabalhada', tone: 'muted' };
  return { text: 'Completo', tone: 'ok' };
}

function Summary({ t }: { t: TimesheetView }) {
  const items: Array<[string, string]> = [
    ['Trabalhado', hm(t.totals.workedSeconds)],
    ['Previsto', hm(t.totals.expectedSeconds)],
    ['Horas a mais', hm(t.totals.overtimeSeconds + t.totals.restOrHolidaySeconds)],
    ['Faltas', t.totals.absences === 1 ? '1 dia' : `${t.totals.absences} dias`],
  ];
  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[8px] bg-borda shadow-card">
      {items.map(([k, v]) => (
        <div key={k} className="bg-card px-4 py-3">
          <p className="text-xs font-semibold tracking-wide text-texto-3 uppercase">{k}</p>
          <p className="mt-0.5 text-xl font-bold text-marca tabular">{v}</p>
        </div>
      ))}
    </section>
  );
}

function DayCard({ d, tz, today }: { d: Day; tz: string; today: string }) {
  const [open, setOpen] = useState(false);
  const st = dayStatus(d, today);
  const diff = d.overtimeSeconds || d.restOrHolidaySeconds ? `+${hm(d.overtimeSeconds || d.restOrHolidaySeconds)}` : d.deficitSeconds ? `−${hm(d.deficitSeconds)}` : null;
  const needsFix = st.tone === 'warn';
  const label = `${WEEKDAY[isoWeekday(d.date)]} ${formatDateBR(d.date).slice(0, 5)}`;

  return (
    <li className="overflow-hidden rounded-[8px] bg-card shadow-card">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full px-4 py-3 text-left">
        <span className="flex items-center justify-between gap-2">
          <span className="text-md font-bold text-marca">{label}</span>
          <span className="flex items-center gap-2">
            {d.workedSeconds ? <span className="font-bold text-texto tabular">{hm(d.workedSeconds)}</span> : null}
            <ChevronDown size={18} className={`text-texto-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          </span>
        </span>

        {d.punches.length ? (
          <span className="mt-2 flex flex-wrap items-start gap-x-1.5 gap-y-2">
            {d.punches.map((p, i) => (
              <span key={p.ref} className="flex items-start gap-1.5">
                {i > 0 ? <span className="pt-0.5 text-borda-forte">→</span> : null}
                <span className="block">
                  <span className="block font-bold text-texto tabular">{hora(p.at, tz)}</span>
                  <span className="block text-xs text-texto-3">{NAME[p.type]}</span>
                </span>
              </span>
            ))}
            {st.text === 'Faltou a saída' ? (
              <span className="flex items-start gap-1.5">
                <span className="pt-0.5 text-borda-forte">→</span>
                <span className="block">
                  <span className="block font-semibold text-atencao">—</span>
                  <span className="block text-xs text-texto-3">Saída</span>
                </span>
              </span>
            ) : null}
          </span>
        ) : null}

        <span className="mt-2 flex items-center justify-between gap-2 text-sm">
          <span className={`flex items-center gap-1 font-semibold ${st.tone === 'ok' ? 'text-acao' : st.tone === 'warn' ? 'text-atencao' : 'text-texto-3'}`}>
            {st.tone === 'ok' ? <Check size={15} aria-hidden /> : null}
            {st.text}
          </span>
          {diff ? <span className={`font-semibold tabular ${diff.startsWith('+') ? 'text-marca-3' : 'text-atencao'}`}>{diff}</span> : null}
        </span>
      </button>

      {open ? (
        <div className="border-t border-borda bg-fundo/60 px-4 py-2">
          <p className="py-1 text-xs text-texto-3">
            Previsto: {d.expected.kind === 'workday' ? `${d.expected.start} às ${d.expected.end} (${hm(d.expected.expectedSeconds)})` : d.expected.kind === 'holiday' ? `feriado${d.expected.holidayName ? `, ${d.expected.holidayName}` : ''}` : 'folga'}
            {d.breakSeconds ? ` · pausas ${hm(d.breakSeconds)}` : ''}
            {d.nightSeconds ? ` · noturno ${hm(d.nightSeconds)}` : ''}
          </p>
          <ul className="divide-y divide-borda">
            {d.punches.map((p) =>
              p.source === 'original' ? (
                <li key={p.ref}>
                  <Link href={`/app/comprovante/${p.ref}`} className="flex items-center justify-between py-2.5">
                    <span>
                      <span className="font-semibold tabular">{hora(p.at, tz)}</span> <span className="text-texto-2">{NAME[p.type]}</span>
                    </span>
                    <span className="flex items-center gap-1 text-sm text-texto-3">
                      Comprovante <ChevronRight size={16} aria-hidden />
                    </span>
                  </Link>
                </li>
              ) : (
                <li key={p.ref} className="flex items-center justify-between py-2.5">
                  <span>
                    <span className="font-semibold tabular">{hora(p.at, tz)}</span> <span className="text-texto-2">{NAME[p.type]}</span>
                  </span>
                  <span className="text-sm text-texto-3">Incluída por ajuste</span>
                </li>
              ),
            )}
            {d.disregarded.map((x) => (
              <li key={x.id} className="flex items-center justify-between py-2.5 text-texto-3">
                <span className="line-through tabular">
                  {hora(x.at, tz)} {NAME[x.type]}
                </span>
                <span className="text-sm">Corrigida</span>
              </li>
            ))}
          </ul>
          {needsFix ? (
            <Link href={`/app/corrigir?dia=${d.date}`} className="my-2 flex h-11 items-center justify-center rounded-[8px] bg-marca font-semibold text-white">
              Pedir ajuste deste dia
            </Link>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Registros do mês: resumo e um cartão por dia. O espelho formal completo sai na impressão. */
export default function MeusRegistros() {
  const { me } = useSession();
  const tz = me.timezone;
  const max = mesAtual(tz);
  const [month, setMonth] = useState(max);
  const { data, error, loading, reload } = useResource<TimesheetView>(`/me/timesheet?month=${month}`);
  const today = hojeLocal(tz);
  const days = (data?.days ?? []).filter((d) => d.date <= today).reverse();

  return (
    <>
      {data ? <PrintableTimesheet t={data} /> : null}
      <div className="space-y-4 print:hidden">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-marca">Registros</h1>
          {data ? (
            <button type="button" onClick={() => window.print()} className="inline-flex h-11 items-center gap-1.5 rounded-[8px] bg-marca px-4 font-semibold text-white shadow-card active:brightness-110">
              <Printer size={18} aria-hidden /> Espelho do mês
            </button>
          ) : null}
        </div>
        <MonthNav month={month} onChange={setMonth} max={max} />

        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : data ? (
          <>
            <Summary t={data} />
            {data.closing?.status === 'closed' ? <p className="text-sm text-texto-2">Mês fechado pelo empregador.</p> : null}
            <ul className="space-y-2">
              {days.map((d) => {
                const off = (d.expected.kind === 'rest' || d.expected.kind === 'holiday' || d.expected.kind === 'no_schedule' || d.expected.kind === 'not_started') && !d.punches.length;
                if (off) {
                  return (
                    <li key={d.date} className="flex items-center justify-between px-4 py-1.5 text-sm text-texto-3">
                      <span>
                        {WEEKDAY[isoWeekday(d.date)]} {formatDateBR(d.date).slice(0, 5)}
                      </span>
                      <span>{d.expected.kind === 'holiday' ? (d.expected.holidayName ?? 'Feriado') : d.expected.kind === 'not_started' ? 'Antes do início do ponto' : 'Folga'}</span>
                    </li>
                  );
                }
                return <DayCard key={d.date} d={d} tz={tz} today={today} />;
              })}
            </ul>
          </>
        ) : null}
      </div>
    </>
  );
}
