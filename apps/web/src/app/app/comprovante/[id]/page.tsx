'use client';
import type { ReceiptView } from '@pontonexo/shared';
import { useParams } from 'next/navigation';
import { ReceiptDocument } from '@/components/comprovante';
import { Button, ErrorState, Loading } from '@/components/ui';
import { useResource } from '@/lib/hooks';

export default function Comprovante() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useResource<ReceiptView>(`/me/receipts/${id}`);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error?.message ?? 'Comprovante não encontrado.'} onRetry={reload} />;
  return (
    <div className="space-y-3">
      <ReceiptDocument r={data} />
      <Button variant="secondary" className="w-full print:hidden" onClick={() => window.print()}>
        Imprimir ou salvar em PDF
      </Button>
    </div>
  );
}
