'use client';
import { FileText } from 'lucide-react';
import { ALERT_LABEL, GEO_STATUS_LABEL, PUNCH_TYPE_LABEL, type Page, type PunchView, type ReceiptView } from '@pontonexo/shared';
import { useState } from 'react';
import { ReceiptDocument } from '@/components/comprovante';
import { EmployeeSelect } from '@/components/filtros';
import { useSession } from '@/components/session';
import { Button, Card, DataTable, Dialog, Empty, ErrorState, Input, Loading, PageHeader, Pagination, Segmented, Toolbar, Tone } from '@/components/ui';
import { SECAO } from '@/components/secoes';
import { api, qs } from '@/lib/api';
import { dataHora } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

export default function Marcacoes() {
  const { me } = useSession();
  const tz = me.timezone;
  const [employeeId, setEmployeeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [withAlerts, setWithAlerts] = useState<'all' | 'only'>('all');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useResource<Page<PunchView>>(`/punches${qs({ employeeId, from, to, withAlerts, page })}`);
  const [receipt, setReceipt] = useState<ReceiptView | null>(null);
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div>
      <PageHeader {...SECAO.marcacoes} title="Marcações" back={{ href: '/painel', label: 'Início' }} />
      <Card>
        <Toolbar>
          <div className="w-full sm:w-64">
            <EmployeeSelect value={employeeId} onChange={(v) => reset(() => setEmployeeId(v))} allowAll />
          </div>
          <div className="w-40">
            <Input label="De" type="date" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} />
          </div>
          <div className="w-40">
            <Input label="Até" type="date" value={to} onChange={(e) => reset(() => setTo(e.target.value))} />
          </div>
          <Segmented label="Filtro" value={withAlerts} onChange={(v) => reset(() => setWithAlerts(v))} options={[{ value: 'all', label: 'Todas' }, { value: 'only', label: 'Com ocorrência' }]} />
        </Toolbar>
        <p className="mb-3 text-sm text-texto-3">Registros originais: não podem ser editados nem apagados. Ajustes são feitos por correção e aparecem no espelho.</p>
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : (
          <>
            <DataTable
              wide
              rows={data?.items ?? []}
              rowKey={(r) => r.id}
              empty={<Empty title="Nenhuma marcação no filtro" />}
              columns={[
                { key: 'nsr', header: 'NSR', cell: (r) => <span className="font-mono tabular">{r.nsr}</span>, hideOnMobile: true },
                { key: 'quando', header: 'Data e hora', cell: (r) => <span className="font-mono tabular">{dataHora(r.serverTime, tz, true)}</span> },
                { key: 'quem', header: 'Funcionário', cell: (r) => r.employeeName },
                { key: 'tipo', header: 'Tipo', cell: (r) => PUNCH_TYPE_LABEL[r.type] },
                { key: 'local', header: 'Local', cell: (r) => r.locationName ?? 'Outro local', hideOnMobile: true },
                {
                  key: 'geo',
                  header: 'Localização',
                  cell: (r) => (
                    <span className={r.geoStatus === 'inside' ? '' : 'text-atencao'}>
                      {GEO_STATUS_LABEL[r.geoStatus]}
                      {r.distanceM !== null && r.geoStatus !== 'inside' ? ` (${r.distanceM} m)` : ''}
                    </span>
                  ),
                },
                {
                  key: 'sit',
                  header: 'Situação',
                  cell: (r) =>
                    r.disregarded ? (
                      <Tone tone="muted">Desconsiderada por correção</Tone>
                    ) : r.alerts.length ? (
                      <span>
                        <Tone tone="warn">{r.alerts.map((a) => ALERT_LABEL[a.code]).join('; ')}</Tone>
                        {r.justification ? <span className="block text-sm text-texto-3">Justificativa: {r.justification}</span> : null}
                      </span>
                    ) : (
                      <Tone tone="ok">Registrada</Tone>
                    ),
                },
                {
                  key: 'comp',
                  header: '',
                  cell: (r) => (
                    <Button size="sm" variant="ghost" onClick={async () => setReceipt(await api.get<ReceiptView>(`/punches/${r.id}/receipt`))}>
                      <FileText size={18} aria-hidden /> Comprovante
                    </Button>
                  ),
                },
              ]}
            />
            {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
          </>
        )}
      </Card>
      <Dialog open={receipt !== null} title="Comprovante" onClose={() => setReceipt(null)}>
        {receipt ? <ReceiptDocument r={receipt} /> : null}
      </Dialog>
    </div>
  );
}
