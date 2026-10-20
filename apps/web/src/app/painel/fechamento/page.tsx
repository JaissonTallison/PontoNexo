'use client';
import type { ClosingBatchResult, MonthSummaryRow, MonthSummaryView } from '@pontonexo/shared';
import { Download, Lock } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { MonthNav } from '@/components/espelho';
import { useSession } from '@/components/session';
import { Button, Card, DataTable, Empty, ErrorState, Loading, Notice, PageHeader, useConfirm } from '@/components/ui';
import { SECAO } from '@/components/secoes';
import { api, ApiError } from '@/lib/api';
import { duracao, mesAnterior, mesAtual, nomeMes, plural } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

function situacao(r: MonthSummaryRow, ended: boolean): { text: string; tone: string } {
  if (r.closing?.status === 'closed') return r.closing.acknowledged ? { text: 'Fechado, com ciência', tone: 'text-acao' } : { text: 'Fechado, falta ciência', tone: 'text-marca-3' };
  if (r.closing?.status === 'reopened') return { text: 'Reaberto', tone: 'text-atencao' };
  if (r.pendingCorrections) return { text: plural(r.pendingCorrections, 'pedido pendente', 'pedidos pendentes'), tone: 'text-perigo' };
  return ended ? { text: 'Pronto para fechar', tone: 'text-texto' } : { text: 'Mês em andamento', tone: 'text-texto-3' };
}

/** Folha do mês: todos os funcionários numa tabela, fechamento de uma vez e exportação para o contador. */
export default function Fechamento() {
  const { me, can } = useSession();
  const tz = me.timezone;
  const max = mesAtual(tz);
  const [month, setMonth] = useState(mesAnterior(max));
  const s = useResource<MonthSummaryView>(`/closings/summary?month=${month}`);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ClosingBatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { ask, dialog } = useConfirm();

  const rows = s.data?.rows ?? [];
  const open = rows.filter((r) => r.closing?.status !== 'closed');
  const blocked = open.filter((r) => r.pendingCorrections > 0).length;

  async function closeAll() {
    const ok = await ask({
      title: `Fechar ${nomeMes(month)}`,
      confirmLabel: 'Fechar o mês',
      message: (
        <>
          <p>
            Vamos fechar o mês de {plural(open.length - blocked, 'funcionário', 'funcionários')}. Uma fotografia de cada espelho fica guardada e novos ajustes ficam bloqueados até reabrir.
          </p>
          {blocked ? <p className="mt-2 font-semibold text-perigo">{plural(blocked, 'funcionário fica', 'funcionários ficam')} de fora porque há pedido de ajuste para decidir.</p> : null}
        </>
      ),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.post<ClosingBatchResult>('/closings/batch', { month }));
      s.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível fechar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader {...SECAO.fechamento}
        title="Folha do mês"
        back={{ href: '/painel', label: 'Início' }}
        alert={blocked && s.data?.ended ? `${plural(blocked, 'funcionário tem', 'funcionários têm')} pedido de ajuste para decidir antes do fechamento` : null}
        actions={
          <>
            {can('exports.run') ? (
              <a href={`/api/exports/summary.csv?month=${month}`} className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-marca/70 bg-card px-4 font-semibold text-marca hover:bg-marca-suave">
                <Download size={18} aria-hidden /> Exportar para o contador (CSV)
              </a>
            ) : null}
            {can('closings.manage') && s.data?.ended && open.length > blocked ? (
              <Button onClick={closeAll} busy={busy}>
                <Lock size={18} aria-hidden /> Fechar o mês de todos
              </Button>
            ) : null}
          </>
        }
      />
      <div className="mb-4">
        <MonthNav month={month} onChange={(m) => { setMonth(m); setResult(null); }} max={max} />
      </div>
      {result ? (
        <div className="mb-3">
          <Notice tone={result.skipped.length ? 'warn' : 'ok'}>
            {plural(result.closed, 'mês fechado', 'meses fechados')}.
            {result.skipped.map((x) => (
              <span key={x.employeeId} className="block">
                {x.fullName}: {x.reason}
              </span>
            ))}
          </Notice>
        </div>
      ) : null}
      {error ? <div className="mb-3"><Notice tone="error">{error}</Notice></div> : null}
      <Card>
        {s.loading && !s.data ? (
          <Loading />
        ) : s.error ? (
          <ErrorState message={s.error.message} onRetry={s.reload} />
        ) : (
          <DataTable
            pageSize={20}
            rows={rows}
            rowKey={(r) => r.employeeId}
            empty={<Empty title="Nenhum funcionário com contrato neste mês" />}
            columns={[
              {
                key: 'nome',
                header: 'Funcionário',
                cell: (r) => (
                  <Link href={`/painel/espelho?funcionario=${r.employeeId}&mes=${month}`} className="font-semibold text-texto hover:underline">
                    {r.fullName}
                  </Link>
                ),
              },
              { key: 'trab', header: 'Trabalhado', className: 'text-right', cell: (r) => <span className="font-semibold tabular">{duracao(r.workedSeconds)}</span> },
              { key: 'prev', header: 'Previsto', className: 'text-right', cell: (r) => <span className="tabular">{duracao(r.expectedSeconds)}</span> },
              { key: 'extra', header: 'Horas extras', className: 'text-right', cell: (r) => <span className="tabular">{r.paidOvertimeSeconds ? duracao(r.paidOvertimeSeconds) : '—'}</span> },
              { key: 'falta', header: 'Faltas', className: 'text-right', cell: (r) => <span className="tabular">{r.absences || '—'}</span> },
              {
                key: 'sit',
                header: 'Situação',
                cell: (r) => {
                  const x = situacao(r, s.data?.ended ?? false);
                  return <span className={`font-semibold ${x.tone}`}>{x.text}</span>;
                },
              },
            ]}
          />
        )}
      </Card>
      <p className="mt-3 text-sm text-texto-3">Valores de referência. Confira com o contador antes da folha de pagamento. Para ver o dia a dia, imprimir ou reabrir, clique no nome.</p>
      {dialog}
    </div>
  );
}
