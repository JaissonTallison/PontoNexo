'use client';
import type { TimesheetView } from '@pontonexo/shared';
import { useState } from 'react';
import { MonthNav, TimesheetTable, Totals } from '@/components/espelho';
import { PrintableTimesheet } from '@/components/espelho-impressao';
import { Button } from '@/components/ui';
import { useSession } from '@/components/session';
import { Card, ErrorState, Loading } from '@/components/ui';
import { mesAtual } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

export default function Historico() {
  const { me } = useSession();
  const max = mesAtual(me.timezone);
  const [month, setMonth] = useState(max);
  const { data, error, loading, reload } = useResource<TimesheetView>(`/me/timesheet?month=${month}`);
  return (
    <>
    {data ? <PrintableTimesheet t={data} /> : null}
    <div className="space-y-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-marca">Histórico</h1>
        <div className="flex items-center gap-2">
          <MonthNav month={month} onChange={setMonth} max={max} />
          {data ? <Button variant="secondary" size="sm" onClick={() => window.print()}>Imprimir</Button> : null}
        </div>
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorState message={error.message} onRetry={reload} /> : data ? (
        <>
          <Card title="Resumo do mês">
            <Totals t={data} />
            {data.closing ? (
              <p className="mt-3 text-sm text-texto-2">
                Mês {data.closing.status === 'closed' ? 'fechado' : 'reaberto'} pelo empregador. Veja em Correções para registrar sua ciência.
              </p>
            ) : null}
          </Card>
          <Card title="Dia a dia">
            <TimesheetTable t={data} />
          </Card>
        </>
      ) : null}
    </div>
    </>
  );
}
