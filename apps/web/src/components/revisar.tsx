import type { ReactNode } from 'react';

/** Cabeçalho de uma aba dentro de uma página: ações à direita e o aviso em vermelho só quando algo pede ação. */
export function SectionHeader({ actions, alert }: { actions?: ReactNode; alert?: string | null }) {
  if (!actions && !alert) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      {alert ? <p className="text-sm font-semibold text-perigo">{alert}</p> : <span />}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
