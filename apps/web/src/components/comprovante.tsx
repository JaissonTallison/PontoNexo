'use client';
import { formatCpf, GEO_STATUS_LABEL, PUNCH_TYPE_LABEL, type ReceiptView } from '@pontonexo/shared';

export function ReceiptDocument({ r }: { r: ReceiptView & { publicKeyPem?: string } }) {
  const p = r.payload;
  const rows: Array<[string, string]> = [
    ['Empregador', p.employer.name],
    ['CPF do empregador', formatCpf(p.employer.document)],
    ['Trabalhador', p.employee.name],
    ['CPF do trabalhador', formatCpf(p.employee.cpf)],
    ['Marcação', PUNCH_TYPE_LABEL[p.punchType]],
    ['Data e hora', `${p.localTime} (${p.timezone})`],
    ['NSR', String(p.nsr).padStart(9, '0')],
    ['Local', p.location ?? 'Outro local'],
    ['Localização', GEO_STATUS_LABEL[p.geoStatus]],
    ['Origem', p.origin === 'online' ? 'Online' : 'Enviada após falta de conexão'],
  ];
  return (
    <article className="rounded-[8px] border border-borda bg-card p-5 print:border-0 print:px-[14mm] print:py-[12mm]">
      <h1 className="text-lg font-bold text-marca">{p.title}</h1>
      <dl className="mt-4 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-borda py-1 last:border-0">
            <dt className="text-sm text-texto-3">{k}</dt>
            <dd className="text-right font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 space-y-1 text-xs text-texto-3">
        <p>
          Código de verificação <span className="font-mono text-base font-semibold text-texto">{r.code}</span> — confira em /verificar
        </p>
        <p className="break-all font-mono">Hash do registro: {p.punchHash}</p>
        <p className="break-all font-mono">Hash do comprovante (SHA-256): {r.hash}</p>
        <p className="break-all font-mono">
          Assinatura {r.algorithm} (chave {r.keyId}): {r.signature}
        </p>
        <p>{p.system.name} {p.system.version} · {p.system.modality}. Assinatura do próprio sistema; não é certificado ICP-Brasil.</p>
      </div>
    </article>
  );
}

