'use client';
import type { ClosingView, TimesheetView } from '@pontonexo/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { MonthNav, TimesheetTable, Totals } from '@/components/espelho';
import { PrintableTimesheet } from '@/components/espelho-impressao';
import { EmployeeSelect } from '@/components/filtros';
import { useSession } from '@/components/session';
import { Button, Card, Dialog, Empty, ErrorState, Loading, Notice, PageHeader, Textarea, Tone } from '@/components/ui';
import { api, ApiError, qs } from '@/lib/api';
import { dataHora, mesAnterior, mesAtual, nomeMes } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

function Espelho() {
  const { me, can } = useSession();
  const tz = me.timezone;
  const params = useSearchParams();
  const max = mesAtual(tz);
  const [employeeId, setEmployeeId] = useState(params.get('funcionario') ?? '');
  const [month, setMonth] = useState(mesAnterior(max));
  const sheet = useResource<TimesheetView>(employeeId ? `/timesheets/${employeeId}?month=${month}` : null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reopen, setReopen] = useState<ClosingView | null>(null);
  const [reason, setReason] = useState('');

  const closing = sheet.data?.closing ?? null;
  const isClosed = closing?.status === 'closed';
  const ended = month < max;

  async function close() {
    if (!window.confirm(`Fechar ${nomeMes(month)}? Uma fotografia do espelho será guardada e novos ajustes ficarão bloqueados até reabrir.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.post('/closings', { employeeId, month });
      setMsg({ tone: 'ok', text: 'Mês fechado. O funcionário pode registrar ciência no app.' });
      sheet.reload();
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Não foi possível fechar.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {sheet.data && employeeId ? <PrintableTimesheet t={sheet.data} /> : null}
      <div className="print:hidden">
      <PageHeader
        title="Espelho e fechamento"
        actions={
          employeeId && sheet.data ? (
            <>
              <a className="inline-flex h-9 items-center rounded-[8px] border border-borda-forte bg-card px-4 font-semibold text-marca hover:bg-realce" href={`/api/exports/timesheet.csv${qs({ month, employeeId })}`}>
                Exportar CSV
              </a>
              <Button variant="secondary" onClick={() => window.print()}>
                Imprimir
              </Button>
              {can('closings.manage') && ended && !isClosed ? (
                <Button onClick={close} busy={busy}>
                  Fechar mês
                </Button>
              ) : null}
              {can('closings.manage') && isClosed ? (
                <Button variant="danger" onClick={() => { setReopen(closing); setReason(''); }}>
                  Reabrir
                </Button>
              ) : null}
            </>
          ) : null
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <div className="w-full sm:w-72">
          <EmployeeSelect value={employeeId} onChange={setEmployeeId} />
        </div>
        <MonthNav month={month} onChange={setMonth} max={max} />
      </div>
      {msg ? <div className="mb-3"><Notice tone={msg.tone}>{msg.text}</Notice></div> : null}
      {!employeeId ? (
        <Card><Empty title="Escolha um funcionário" description="O espelho reúne a jornada prevista, as marcações originais, os ajustes aprovados e o cálculo do mês." /></Card>
      ) : sheet.loading && !sheet.data ? (
        <Loading />
      ) : sheet.error ? (
        <ErrorState message={sheet.error.message} onRetry={sheet.reload} />
      ) : sheet.data ? (
        <div className="space-y-4">
          <Card title={`${sheet.data.employee.fullName} · ${nomeMes(month)}`}>
            <p className="mb-3 text-sm text-texto-2">
              {sheet.data.contract ? `${sheet.data.contract.regime} · ${sheet.data.contract.weeklyHours} h/semana · ${sheet.data.contract.compensation}` : 'Sem contrato no período'} · CPF {sheet.data.employee.cpfMasked}
            </p>
            {closing ? (
              <p className="mb-3 text-sm">
                {isClosed ? <Tone tone="brand">Fechado</Tone> : <Tone tone="warn">Reaberto</Tone>} por {closing.closedByName} em {dataHora(closing.closedAt, tz)}
                {closing.reopenReason ? ` · reaberto: ${closing.reopenReason}` : ''}
                {closing.acknowledgementNote ? ` · funcionário: ${closing.acknowledgementNote}` : isClosed ? ' · ciência do funcionário pendente' : ''}
                <span className="block break-all font-mono text-xs text-texto-3">Fotografia SHA-256 {closing.snapshotHash}</span>
              </p>
            ) : null}
            <Totals t={sheet.data} />
          </Card>
          <Card title="Dia a dia">
            <TimesheetTable t={sheet.data} />
          </Card>
          <Card title="Tratamentos aplicados">
            {sheet.data.treatments.length ? (
              <ul className="divide-y divide-borda text-sm">
                {sheet.data.treatments.map((t) => (
                  <li key={t.id} className="py-2">
                    <p className="font-semibold">
                      {t.kind === 'inclusion' ? 'Inclusão' : t.kind === 'disregard' ? 'Desconsideração' : 'Abono'} · {t.effectiveTime ? dataHora(t.effectiveTime, tz) : t.absenceDate?.split('-').reverse().join('/')}
                    </p>
                    <p className="text-texto-2">{t.reason}</p>
                    <p className="text-texto-3">
                      Antes: {t.previousValue ? JSON.stringify(t.previousValue) : '—'} · Depois: {t.newValue ? JSON.stringify(t.newValue) : '—'} · por {t.createdByName} em {dataHora(t.createdAt, tz)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-texto-3">Nenhum ajuste neste mês.</p>
            )}
          </Card>
        </div>
      ) : null}
      </div>
      <Dialog
        open={reopen !== null}
        title="Reabrir mês"
        onClose={() => setReopen(null)}
        footer={
          <Button
            variant="danger"
            onClick={async () => {
              if (!reopen) return;
              try {
                await api.post(`/closings/${reopen.id}/reopen`, { reason });
                setReopen(null);
                setMsg({ tone: 'ok', text: 'Mês reaberto. A fotografia anterior continua guardada.' });
                sheet.reload();
              } catch (e) {
                setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Não foi possível reabrir.' });
              }
            }}
          >
            Reabrir
          </Button>
        }
      >
        <Textarea label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} hint="Fica registrado na auditoria." />
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Espelho />
    </Suspense>
  );
}
