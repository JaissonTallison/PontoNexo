'use client';
import type { AuditEventView, AuditVerification, Page } from '@pontonexo/shared';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Button, Card, DataTable, Empty, ErrorState, Input, Loading, Notice, PageHeader, Pagination, Segmented, Toolbar } from '@/components/ui';
import { SECAO } from '@/components/secoes';
import { api, errorMessage, qs } from '@/lib/api';
import { dataHora } from '@/lib/formato';
import { useResource } from '@/lib/hooks';

const CAT = { security: 'Segurança', privileged: 'Ação privilegiada', data: 'Dados', system: 'Sistema' } as Record<string, string>;

export default function Auditoria() {
  const { me } = useSession();
  const tz = me.timezone;
  const [category, setCategory] = useState<'all' | 'security' | 'privileged' | 'data' | 'system'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useResource<Page<AuditEventView>>(`/audit${qs({ category, from, to, page })}`);
  const [check, setCheck] = useState<{ audit: AuditVerification; punches: { valid: boolean; checked: number; firstBrokenNsr: number | null } } | null>(null);
  const [checkErr, setCheckErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <PageHeader {...SECAO.auditoria}
        back={{ href: '/painel', label: 'Início' }}
        title="Auditoria"
        actions={
          <Button
            busy={busy}
            onClick={async () => {
              setBusy(true);
              setCheckErr(null);
              try {
                setCheck(await api.post('/audit/verify'));
                reload();
              } catch (e) {
                setCheckErr(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Verificar integridade
          </Button>
        }
      />
      {check ? (
        <div className="mb-3 space-y-1">
          <Notice tone={check.audit.valid ? 'ok' : 'error'}>
            Trilha de auditoria: {check.audit.valid ? `íntegra (${check.audit.checked} eventos encadeados)` : `quebra na sequência ${check.audit.firstBrokenSeq}`}
          </Notice>
          <Notice tone={check.punches.valid ? 'ok' : 'error'}>
            Marcações: {check.punches.valid ? `íntegras (${check.punches.checked} registros, NSR contínuo)` : `quebra no NSR ${check.punches.firstBrokenNsr}`}
          </Notice>
        </div>
      ) : null}
      {checkErr ? <Notice tone="error">{checkErr}</Notice> : null}
      <Card>
        <Toolbar>
          <Segmented
            label="Categoria"
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'Todas' },
              { value: 'privileged', label: 'Privilegiadas' },
              { value: 'data', label: 'Dados' },
              { value: 'security', label: 'Segurança' },
              { value: 'system', label: 'Sistema' },
            ]}
          />
          <div className="w-40">
            <Input label="De" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="w-40">
            <Input label="Até" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </div>
        </Toolbar>
        {loading && !data ? <Loading /> : error ? <ErrorState message={error.message} onRetry={reload} /> : (
          <>
            <DataTable
              rows={data?.items ?? []}
              rowKey={(r) => r.id}
              empty={<Empty title="Nenhum evento no filtro" />}
              columns={[
                { key: 'seq', header: 'Seq.', cell: (r) => <span className="font-mono tabular">{r.seq}</span>, hideOnMobile: true },
                { key: 'quando', header: 'Quando', cell: (r) => <span className="font-mono tabular">{dataHora(r.createdAt, tz, true)}</span> },
                { key: 'cat', header: 'Categoria', cell: (r) => CAT[r.category] ?? r.category },
                { key: 'quem', header: 'Responsável', cell: (r) => r.actorName ?? 'Sistema' },
                { key: 'o-que', header: 'Evento', cell: (r) => <span>{r.summary}<span className="block font-mono text-xs text-texto-3">{r.action}</span></span> },
                { key: 'hash', header: 'Hash', cell: (r) => <span className="font-mono text-xs text-texto-3">{r.hash.slice(0, 12)}…</span>, hideOnMobile: true },
              ]}
            />
            {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
          </>
        )}
      </Card>
      <p className="mt-3 text-xs text-texto-3">A trilha é somente-inclusão e encadeada por hash. Os registros não guardam coordenadas, CPF, senhas nem tokens.</p>
    </div>
  );
}
