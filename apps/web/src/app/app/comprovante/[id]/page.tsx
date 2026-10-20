'use client';
import type { ReceiptView } from '@pontonexo/shared';
import { useParams } from 'next/navigation';
import { ReceiptDocument, ReceiptScreen } from '@/components/comprovante';
import { BackBar, ErrorState, Loading } from '@/components/ui';
import { useResource } from '@/lib/hooks';

export default function Comprovante() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useResource<ReceiptView>(`/me/receipts/${id}`);
  if (loading && !data) return <><BackBar title="Comprovante" fallback="/app/historico" /><Loading /></>;
  if (error || !data) return <><BackBar title="Comprovante" fallback="/app/historico" /><ErrorState message={error?.message ?? 'Comprovante não encontrado.'} onRetry={reload} /></>;
  return (
    <>
      <BackBar title="Comprovante" fallback="/app/historico" />
      <ReceiptScreen r={data} punchId={id} />
      {/* documento formal completo só no papel/PDF */}
      <div className="hidden print:block">
        <ReceiptDocument r={data} />
      </div>
    </>
  );
}
