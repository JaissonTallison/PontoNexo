'use client';
import { formatCpf, GEO_STATUS_LABEL, PUNCH_TYPE_LABEL, type ReceiptView } from '@pontonexo/shared';
import { Check, ChevronDown, ChevronRight, Copy, FileDown, Share2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type React from 'react';

/** Documento formal do comprovante (impressão/PDF e diálogo do painel): todos os campos, layout de documento. */
export function ReceiptDocument({ r }: { r: ReceiptView & { publicKeyPem?: string } }) {
  const p = r.payload;
  const [date, time] = p.localTime.split(' ');
  const box = (label: string, value: string) => (
    <div className="px-3 py-2">
      <p className="text-[7.5pt] font-bold tracking-wide text-texto-3 uppercase print:text-black">{label}</p>
      <p className="text-[12pt] font-semibold tabular">{value}</p>
    </div>
  );
  const row = (k: string, v: string) => (
    <div className="flex justify-between gap-4 border-b border-borda py-1.5 last:border-0 print:border-neutral-300">
      <dt className="text-texto-3 print:text-neutral-700">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
  return (
    <article className="text-[9.5pt] leading-snug text-texto print:px-[14mm] print:py-[12mm] print:text-black">
      <header className="flex items-start justify-between gap-4 border-b-2 border-marca pb-2 print:border-black">
        <div>
          <h1 className="text-[13pt] font-bold tracking-wide text-marca uppercase print:text-black">Comprovante de Registro de Ponto</h1>
          <p className="text-texto-3 print:text-neutral-700">do Trabalhador · nº {String(p.nsr).padStart(9, '0')}</p>
        </div>
        <img src="/brand/pontonexo-logo-horizontal-mono-preto.svg" alt="PontoNexo" className="h-8 w-auto" />
      </header>

      <section className="mt-3 grid grid-cols-2 divide-x divide-borda rounded-[8px] border border-borda sm:grid-cols-4 print:grid-cols-4 print:border-black">
        {box('Marcação', PUNCH_TYPE_LABEL[p.punchType])}
        {box('Data', date ?? '')}
        {box('Hora', time ?? '')}
        {box('NSR', String(p.nsr).padStart(9, '0'))}
      </section>

      <section className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
        <div>
          <p className="text-[7.5pt] font-bold tracking-wide text-texto-3 uppercase print:text-black">Empregador</p>
          <p className="font-semibold">{p.employer.name}</p>
          <p>CPF {formatCpf(p.employer.document)}</p>
        </div>
        <div>
          <p className="text-[7.5pt] font-bold tracking-wide text-texto-3 uppercase print:text-black">Trabalhador</p>
          <p className="font-semibold">{p.employee.name}</p>
          <p>CPF {formatCpf(p.employee.cpf)}</p>
        </div>
      </section>

      <section className="mt-3">
        <p className="text-[7.5pt] font-bold tracking-wide text-texto-3 uppercase print:text-black">Detalhes da marcação</p>
        <dl className="mt-1">
          {row('Local', p.location ?? 'Outro local')}
          {row('Localização no momento', GEO_STATUS_LABEL[p.geoStatus])}
          {row('Origem', p.origin === 'online' ? 'Online, no momento da marcação' : 'Enviada após falta de conexão (hora de recebimento)')}
          {row('Fuso horário', p.timezone)}
          {row('Data e hora UTC', p.serverTimeUtc)}
        </dl>
      </section>

      <section className="mt-3 rounded-[8px] border border-borda p-3 print:border-black">
        <p className="text-[7.5pt] font-bold tracking-wide text-texto-3 uppercase print:text-black">Autenticidade</p>
        <p className="mt-1">
          Código de verificação <span className="font-mono text-[11pt] font-semibold tracking-wider">{r.code}</span>, conferível em /verificar
        </p>
        <div className="mt-2 space-y-1 font-mono text-[7pt] break-all text-texto-3 print:text-neutral-700">
          <p>Hash do registro: {p.punchHash}</p>
          <p>Hash do comprovante (SHA-256): {r.hash}</p>
          <p>
            Assinatura {r.algorithm} (chave {r.keyId}): {r.signature}
          </p>
        </div>
      </section>

      <footer className="mt-3 border-t border-borda pt-1.5 text-[7pt] text-texto-3 print:border-black print:text-neutral-700">
        {p.system.name} {p.system.version} · {p.system.modality}. Assinatura eletrônica do próprio sistema; não é certificado ICP-Brasil.
      </footer>
    </article>
  );
}

const ORIGEM: Record<string, string> = { online: 'Pelo aplicativo, na hora', offline_sync: 'Enviada depois (estava sem internet)' };
const LUGAR: Record<string, { text: string; ok: boolean }> = {
  inside: { text: 'No local de trabalho', ok: true },
  outside: { text: 'Fora do local de trabalho', ok: false },
  low_accuracy: { text: 'Sinal de GPS fraco', ok: false },
  unavailable: { text: 'Localização indisponível', ok: false },
  denied: { text: 'Localização bloqueada no celular', ok: false },
  no_geofence: { text: 'Local sem verificação de GPS', ok: true },
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-sm text-texto-3">{label}</dt>
      <dd className="text-right font-semibold text-texto">{value}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 px-1 text-xs font-bold tracking-wide text-texto-3 uppercase">{title}</h2>
      <dl className="divide-y divide-borda rounded-[8px] bg-card px-4 shadow-card">{children}</dl>
    </section>
  );
}

/** Comprovante na tela, com cara de app. O documento formal completo vai para impressão/PDF. */
export function ReceiptScreen({ r, punchId }: { r: ReceiptView; punchId: string }) {
  const p = r.payload;
  const [date, time] = p.localTime.split(' ');
  const [d, m, y] = (date ?? '').split('/').map(Number) as [number, number, number];
  const longDate = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  const place = LUGAR[p.geoStatus] ?? { text: GEO_STATUS_LABEL[p.geoStatus], ok: true };
  const verifyUrl = typeof window !== 'undefined' ? `${window.location.origin}/verificar?codigo=${r.code}` : `/verificar?codigo=${r.code}`;
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-5 print:hidden">
      <section className="rounded-[8px] bg-card px-5 py-5 text-center shadow-card">
        <p className="text-sm font-semibold tracking-wide text-texto-3 uppercase">{PUNCH_TYPE_LABEL[p.punchType].replace('Início de intervalo', 'Pausa').replace('Fim de intervalo', 'Retorno')}</p>
        <p className="mt-1 text-[44px] leading-none font-bold tracking-tight text-marca tabular">{time?.slice(0, 5)}</p>
        <p className="mt-2 text-sm text-texto-2 first-letter:uppercase">{longDate}</p>
        <p className={`mt-3 inline-flex items-center gap-1.5 text-sm font-semibold ${place.ok ? 'text-acao' : 'text-atencao'}`}>
          {place.ok ? <Check size={16} aria-hidden /> : null}
          {place.ok ? `Registrada · ${place.text.toLowerCase()}` : place.text}
        </p>
      </section>

      <Group title="Registro">
        <Row label="Local" value={p.location ?? 'Outro lugar'} />
        <Row label="Origem" value={ORIGEM[p.origin] ?? p.origin} />
        <Row label="Hora exata" value={<span className="tabular">{time}</span>} />
        <Row label="Nº do registro" value={<span className="tabular">{p.nsr}</span>} />
      </Group>

      <Group title="Pessoas">
        <Row label="Trabalhador" value={<span>{p.employee.name}<span className="block text-xs font-normal text-texto-3">CPF {formatCpf(p.employee.cpf)}</span></span>} />
        <Row label="Empregador" value={<span>{p.employer.name}<span className="block text-xs font-normal text-texto-3">CPF {formatCpf(p.employer.document)}</span></span>} />
      </Group>

      <Group title="Autenticidade">
        <div className="flex items-center justify-between gap-3 py-3">
          <div>
            <dt className="text-sm text-texto-3">Código de verificação</dt>
            <dd className="font-mono text-md font-semibold tracking-wider text-marca">{r.code}</dd>
          </div>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard?.writeText(r.code).catch(() => undefined);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex h-10 items-center gap-1.5 rounded-[8px] px-3 text-sm font-semibold text-marca hover:bg-realce"
          >
            <Copy size={16} aria-hidden />
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <div className="py-3">
          <a href={`/verificar?codigo=${r.code}`} className="flex items-center justify-between font-semibold text-acao">
            <span className="flex items-center gap-2">
              <ShieldCheck size={18} aria-hidden /> Verificar autenticidade
            </span>
            <ChevronRight size={18} aria-hidden />
          </a>
        </div>
        <details className="group py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-texto-2">
            Ver dados técnicos
            <ChevronDown size={18} className="transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-2 space-y-2 text-xs text-texto-3">
            <p>
              Data e hora UTC: <span className="font-mono">{p.serverTimeUtc}</span> · fuso {p.timezone}
            </p>
            <p className="break-all">
              Hash do registro: <span className="font-mono">{p.punchHash}</span>
            </p>
            <p className="break-all">
              Hash do comprovante (SHA-256): <span className="font-mono">{r.hash}</span>
            </p>
            <p className="break-all">
              Assinatura {r.algorithm} (chave {r.keyId}): <span className="font-mono">{r.signature}</span>
            </p>
            <p>
              {p.system.name} {p.system.version} · {p.system.modality}. Assinatura do próprio sistema; não é certificado ICP-Brasil.
            </p>
          </div>
        </details>
      </Group>

      <div className="grid grid-cols-2 gap-3">
        <a href={`/api/me/receipts/${punchId}/pdf`} download className="flex h-12 items-center justify-center gap-2 rounded-[8px] bg-marca font-semibold text-white">
          <FileDown size={18} aria-hidden /> Baixar PDF
        </a>
        <button
          type="button"
          onClick={async () => {
            const text = `Comprovante de ponto: ${PUNCH_TYPE_LABEL[p.punchType]} em ${p.localTime}. Código ${r.code}.`;
            if (navigator.share) await navigator.share({ title: 'Comprovante de ponto', text, url: verifyUrl }).catch(() => undefined);
            else await navigator.clipboard?.writeText(`${text} ${verifyUrl}`).catch(() => undefined);
          }}
          className="flex h-12 items-center justify-center gap-2 rounded-[8px] border border-borda-forte bg-card font-semibold text-marca"
        >
          <Share2 size={18} aria-hidden /> Compartilhar
        </button>
      </div>
    </div>
  );
}
