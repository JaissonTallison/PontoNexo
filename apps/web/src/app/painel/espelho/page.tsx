'use client';
import { Download, Lock, LockOpen, Printer } from 'lucide-react';
import type { ClosingView, TimesheetView } from '@pontonexo/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { MonthNav, TimesheetTable, Totals } from '@/components/espelho';
import { PrintableTimesheet } from '@/components/espelho-impressao';
import { EmployeeSelect } from '@/components/filtros';
import { useSession } from '@/components/session';
import { Button, Card, Dialog, Empty, ErrorState, Loading, Notice, PageHeader, Textarea, Tone, useConfirm } from '@/components/ui';
import { SECAO } from '@/components/secoes';
import { api, ApiError, qs } from '@/lib/api';
import { dataHora, mesAnterior, mesAtual, nomeMes } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

function Espelho() {
  const { me, can } = useSession();
  const tz = me.timezone;
  const params = useSearchParams();
  const max = mesAtual(tz);
  const [employeeId, setEmployeeId] = useState(params.get('funcionario') ?? '');
  const mesParam = params.get('mes');
  const [month, setMonth] = useState(mesParam && /^\d{4}-\d{2}$/.test(mesParam) && mesParam <= max ? mesParam : mesAnterior(max));
  const { ask, dialog } = useConfirm();
  const sheet = useResource<TimesheetView>(employeeId ? `/timesheets/${employeeId}?month=${month}` : null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reopen, setReopen] = useState<ClosingView | null>(null);
  const [reason, setReason] = useState('');

  const closing = sheet.data?.closing ?? null;
  const isClosed = closing?.status === 'closed';
  const ended = month < max;

  async function close() {
    const ok = await ask({
      title: `Fechar ${nomeMes(month)}`,
      confirmLabel: 'Fechar o mês',
      message: 'Uma fotografia do espelho fica guardada e novos ajustes ficam bloqueados até reabrir. O funcionário poderá registrar ciência no app.',
    });
    if (!ok) return;
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
      <PageHeader {...SECAO.espelho}
        title="Espelho por funcionário"
        back={{ href: '/painel/fechamento', label: 'Folha do mês' }}
        actions={
          employeeId && sheet.data ? (
            <>
              <a className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-marca px-4 font-semibold text-white hover:bg-marca-2" href={`/api/exports/timesheet.csv${qs({ month, employeeId })}`}>
                <Download size={18} aria-hidden /> Exportar CSV
              </a>
              <Button onClick={() => window.print()}>
                <Printer size={18} aria-hidden /> Imprimir
              </Button>
              {can('closings.manage') && ended && !isClosed ? (
                <Button onClick={close} busy={busy}>
                  <Lock size={18} aria-hidden /> Fechar mês
                </Button>
              ) : null}
              {can('closings.manage') && isClosed ? (
                <Button variant="danger" onClick={() => { setReopen(closing); setReason(''); }}>
                  <LockOpen size={18} aria-hidden /> Reabrir
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
      {dialog}
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
            <LockOpen size={18} aria-hidden /> Reabrir
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
