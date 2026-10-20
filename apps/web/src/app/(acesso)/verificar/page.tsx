'use client';
import { PUNCH_TYPE_LABEL, type ReceiptVerification } from '@pontonexo/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { Button, cls, DescList, Input, Notice, Tone } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

function Verificar() {
  const params = useSearchParams();
  const [code, setCode] = useState(params.get('codigo') ?? '');
  const [result, setResult] = useState<ReceiptVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(c: string) {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.get<ReceiptVerification>(`/receipts/verify/${encodeURIComponent(c.trim())}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const c = params.get('codigo');
    if (c) void check(c);
  }, [params]);

  return (
    <div className={`${cls.card} p-5 sm:p-6`}>
      <h1 className="text-xl font-bold text-marca">Verificar comprovante</h1>
      <p className="mt-1 text-texto-2">Confere se o comprovante corresponde ao registro original e se não foi alterado.</p>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void check(code);
        }}
      >
        <Input label="Código do comprovante" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="h-11 font-mono tracking-wider" />
        <Button type="submit" size="lg" className="w-full" busy={busy} disabled={code.trim().length < 8}>
          Verificar
        </Button>
      </form>
      {error ? <div className="mt-4"><Notice tone="error">{error}</Notice></div> : null}
      {result ? (
        <div className="mt-5 border-t border-borda pt-4">
          <p className="text-md">
            <Tone tone={result.valid ? 'ok' : 'error'}>{result.valid ? 'Comprovante íntegro' : 'Comprovante não confere'}</Tone>
          </p>
          <p className="mt-1 text-sm text-texto-2">{result.reason}</p>
          {result.receipt ? (
            <div className="mt-4">
              <DescList
                items={[
                  ['Empregador', result.receipt.employerName],
                  ['Marcação', PUNCH_TYPE_LABEL[result.receipt.punchType]],
                  ['Data e hora', result.receipt.localTime],
                  ['NSR', String(result.receipt.nsr)],
                ]}
              />
              <p className="mt-3 break-all font-mono text-xs text-texto-3">SHA-256 {result.receipt.hash}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Verificar />
    </Suspense>
  );
}
