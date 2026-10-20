'use client';
import { ArrowLeft, ChevronLeft, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

/* Classes comuns: mudar aqui muda o sistema inteiro. */
export const cls = {
  card: 'rounded-[8px] border border-borda bg-card shadow-card',
  campo:
    'h-9 w-full rounded-[8px] border border-borda bg-fundo px-3 text-base text-texto placeholder:text-texto-3 focus:bg-card focus:border-acao focus:outline-none disabled:opacity-60',
  rotulo: 'mb-1 block text-sm font-semibold text-texto-2',
};

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-marca text-white hover:bg-marca-2 disabled:bg-borda-forte',
  secondary: 'border border-marca/70 bg-card text-marca hover:bg-marca-suave',
  ghost: 'text-marca hover:bg-realce',
  danger: 'border border-perigo bg-card text-perigo hover:bg-perigo-suave',
};

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' | 'xl'; busy?: boolean }) {
  const sizes = { sm: 'h-8 px-3 text-sm', md: 'h-9 px-4 text-base', lg: 'h-12 px-5 text-md', xl: 'min-h-16 px-6 text-lg' };
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-[8px] font-semibold transition-colors disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {busy ? 'Aguarde…' : children}
    </button>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={cls.rotulo}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-perigo" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-texto-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ label, hint, error, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={rest.id ?? id}>
      <input id={rest.id ?? id} aria-invalid={Boolean(error) || undefined} {...rest} className={`${cls.campo} ${error ? 'border-perigo' : ''} ${className}`} />
    </Field>
  );
}

export function Select({ label, hint, error, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={rest.id ?? id}>
      <select id={rest.id ?? id} aria-invalid={Boolean(error) || undefined} {...rest} className={`${cls.campo} ${error ? 'border-perigo' : ''}`}>
        {children}
      </select>
    </Field>
  );
}

export function Textarea({ label, hint, error, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={rest.id ?? id}>
      <textarea
        id={rest.id ?? id}
        aria-invalid={Boolean(error) || undefined}
        rows={3}
        {...rest}
        className={`w-full rounded-[8px] border bg-fundo px-3 py-2 text-base focus:border-acao focus:bg-card focus:outline-none ${error ? 'border-perigo' : 'border-borda'}`}
      />
    </Field>
  );
}

export function Checkbox({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="checkbox" {...rest} className="mt-1 size-4 rounded-[2px] accent-acao" />
      <label htmlFor={id} className="text-base text-texto">
        {label}
        {hint ? <span className="block text-xs text-texto-3">{hint}</span> : null}
      </label>
    </div>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${cls.card} ${className}`}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-borda px-4 py-3">
          {title ? <h2 className="text-md font-bold text-marca">{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Cabeçalho da página: título e ações. A linha de alerta só aparece quando algo pede ação. */
export function PageHeader({ title, actions, alert, back }: { title: string; actions?: ReactNode; alert?: string | null; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5">
      {back ? (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-marca-3 hover:text-marca print:hidden">
          <ArrowLeft size={16} aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-marca">{title}</h1>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {alert ? <p className="mt-1 text-sm font-semibold text-perigo">{alert}</p> : null}
    </div>
  );
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <p className="py-8 text-center text-texto-3" role="status">
      {label}
    </p>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="py-8 text-center" role="alert">
      <p className="text-perigo">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Tentar de novo
        </Button>
      ) : null}
    </div>
  );
}

export function Empty({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="py-10 text-center">
      <p className="text-md font-semibold text-marca">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-texto-3">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Mensagem curta de resultado. Só texto, sem caixa colorida nem ícone. */
export function Notice({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'error'; children: ReactNode }) {
  const color = { neutral: 'text-texto-2', ok: 'text-acao', warn: 'text-atencao', error: 'text-perigo' }[tone];
  return (
    <p className={`text-sm font-semibold ${color}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

export function Tone({ tone, children }: { tone: 'ok' | 'warn' | 'error' | 'muted' | 'brand'; children: ReactNode }) {
  const color = { ok: 'text-acao', warn: 'text-atencao', error: 'text-perigo', muted: 'text-texto-3', brand: 'text-marca' }[tone];
  return <span className={`font-semibold ${color}`}>{children}</span>;
}

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** esconde no cartão do celular */
  hideOnMobile?: boolean;
}

/** Tabela zebrada; no celular vira cartões com rótulo e valor. */
export function DataTable<T>({ rows, columns, rowKey, onRowClick, empty }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; empty?: ReactNode }) {
  if (!rows.length) return <>{empty ?? <Empty title="Nada por aqui ainda" />}</>;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-base">
          <thead>
            <tr className="border-b border-borda text-left">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-3 py-2 text-sm font-semibold text-texto-2 ${c.className ?? ''}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`border-b border-borda last:border-0 even:bg-zebra hover:bg-realce ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 align-top ${c.className ?? ''}`}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)}>
            <div
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
              className="rounded-[8px] border border-borda bg-card p-3"
            >
              {columns
                .filter((c) => !c.hideOnMobile)
                .map((c) => (
                  <div key={c.key} className="flex justify-between gap-3 py-0.5">
                    <span className="text-sm text-texto-3">{c.header}</span>
                    <span className="text-right">{c.cell(r)}</span>
                  </div>
                ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total ? <p className="mt-3 text-sm text-texto-3">{total === 1 ? '1 registro' : `${total} registros`}</p> : null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="mt-3 flex items-center justify-between gap-2" aria-label="Paginação">
      <p className="text-sm text-texto-3 tabular">
        {from}–{to} de {total}
      </p>
      <div className="flex gap-1">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">
          <ChevronLeft size={16} />
        </Button>
        <span className="px-2 py-1 text-sm tabular">
          {page} / {pages}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Próxima página">
          <ChevronRight size={16} />
        </Button>
      </div>
    </nav>
  );
}

/** Seletor em trilho: opção ativa em branco com sombra leve. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-[8px] bg-realce p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-[8px] px-3 py-1 text-sm font-semibold ${o.value === value ? 'bg-card text-marca shadow-barra' : 'text-texto-2 hover:text-marca'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      className="m-auto w-[min(560px,calc(100vw-24px))] rounded-[8px] border border-borda bg-card p-0 text-texto shadow-flutuante backdrop:bg-marca/40"
    >
      {open ? (
        <div>
          <header className="flex items-center justify-between border-b border-borda px-4 py-3">
            <h2 className="text-lg font-bold text-marca">{title}</h2>
            <button onClick={onClose} className="rounded-[8px] p-1 text-texto-3 hover:bg-realce" aria-label="Fechar">
              <X size={18} />
            </button>
          </header>
          <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>
          {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-borda px-4 py-3">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end gap-3">{children}</div>;
}

export function DescList({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-sm text-texto-3">{k}</dt>
          <dd className="text-base">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Barra de voltar para telas internas do app. Volta para a tela anterior do histórico;
 * se a pessoa chegou direto (link), vai para `fallback`.
 */
export function BackBar({ title, fallback }: { title: string; fallback: string }) {
  const router = useRouter();
  return (
    <div className="mb-4 flex items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-card text-marca shadow-card active:bg-realce"
        aria-label="Voltar"
      >
        <ArrowLeft size={22} aria-hidden />
      </button>
      <h1 className="truncate text-xl font-bold text-marca">{title}</h1>
    </div>
  );
}

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
}

/**
 * Janela de confirmação no padrão do sistema (substitui o window.confirm, que é pequeno e sem contexto).
 * Uso: const { ask, dialog } = useConfirm(); ... if (!(await ask({...}))) return; ... e renderizar {dialog}.
 */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const finish = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const dialog = (
    <Dialog
      open={state !== null}
      title={state?.title ?? ''}
      onClose={() => finish(false)}
      footer={
        <>
          <Button variant="secondary" onClick={() => finish(false)}>
            Cancelar
          </Button>
          <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => finish(true)}>
            {state?.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-texto-2">{state?.message}</div>
    </Dialog>
  );
  return { ask, dialog };
}
