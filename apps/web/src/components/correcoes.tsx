'use client';
import {
  CORRECTION_KIND_LABEL,
  CORRECTION_STATUS_LABEL,
  localToInstant,
  PUNCH_TYPE_LABEL,
  PUNCH_TYPES,
  type CorrectionKind,
  type CorrectionView,
  type Page,
  type PunchType,
  type PunchView,
} from '@pontonexo/shared';
import { useState } from 'react';
import { api, ApiError, qs } from '@/lib/api';
import { dataHora, hojeLocal, mesAtual } from '@/lib/formato';
import { useResource } from '@/lib/hooks';
import { Button, Dialog, Empty, Input, Notice, Select, Textarea, Tone } from './ui';

const statusTone = (s: CorrectionView['status']) => (s === 'approved' ? 'ok' : s === 'rejected' ? 'error' : s === 'pending' ? 'warn' : 'muted');

export function describeCorrection(c: CorrectionView, tz: string) {
  const alvo = c.targetPunch ? `${PUNCH_TYPE_LABEL[c.targetPunch.type]} de ${dataHora(c.targetPunch.serverTime, tz)} (NSR ${c.targetPunch.nsr})` : null;
  switch (c.kind) {
    case 'include_punch':
      return `Incluir ${c.proposedType ? PUNCH_TYPE_LABEL[c.proposedType].toLowerCase() : 'marcação'} em ${dataHora(c.proposedTime, tz)}`;
    case 'disregard_punch':
      return `Desconsiderar ${alvo}`;
    case 'replace_time':
      return `Ajustar ${alvo} para ${dataHora(c.proposedTime, tz)}`;
    case 'justify_absence':
      return `Abonar ausência de ${c.absenceDate?.split('-').reverse().join('/')}`;
  }
}

export function CorrectionList({ items, tz, onDecide, showEmployee }: { items: CorrectionView[]; tz: string; onDecide?: (c: CorrectionView) => void; showEmployee?: boolean }) {
  if (!items.length) return <Empty title="Nenhuma solicitação" />;
  return (
    <ul className="divide-y divide-borda">
      {items.map((c) => (
        <li key={c.id} className="py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold">{describeCorrection(c, tz)}</p>
              <p className="text-sm text-texto-3">
                {showEmployee ? `${c.employeeName} · ` : ''}
                {c.initiatedBy === 'employee' ? 'Pedido do funcionário' : 'Proposta do empregador'} por {c.requestedByName} em {dataHora(c.requestedAt, tz)}
              </p>
              <p className="mt-1 text-sm text-texto-2">Motivo: {c.reason}</p>
              {c.decisionReason ? (
                <p className="mt-1 text-sm text-texto-2">
                  Decisão{c.decidedByName ? ` de ${c.decidedByName}` : ''}: {c.decisionReason}
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <Tone tone={statusTone(c.status)}>{c.status === 'pending' && c.initiatedBy === 'employer' ? 'Aguardando o funcionário' : CORRECTION_STATUS_LABEL[c.status]}</Tone>
              {c.canDecide && onDecide ? (
                <div className="mt-2">
                  <Button size="sm" onClick={() => onDecide(c)}>
                    Analisar
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DecisionDialog({ item, tz, onClose, onDone }: { item: CorrectionView | null; tz: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  async function decide(decision: 'approve' | 'reject') {
    if (!item) return;
    setBusy(decision);
    setError(null);
    try {
      await api.post(`/corrections/${item.id}/decide`, { decision, reason });
      setReason('');
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields.reason ?? e.message) : 'Não foi possível registrar a decisão.');
    } finally {
      setBusy(null);
    }
  }
  return (
    <Dialog
      open={item !== null}
      title="Analisar solicitação"
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" busy={busy === 'reject'} disabled={busy !== null} onClick={() => decide('reject')}>
            Recusar
          </Button>
          <Button busy={busy === 'approve'} disabled={busy !== null} onClick={() => decide('approve')}>
            Aprovar
          </Button>
        </>
      }
    >
      {item ? (
        <div className="space-y-3">
          <p className="font-semibold">{describeCorrection(item, tz)}</p>
          <p className="text-sm text-texto-2">Motivo informado: {item.reason}</p>
          <p className="text-sm text-texto-3">
            Aprovar cria um tratamento: a marcação original continua guardada e o espelho passa a considerar o ajuste. A decisão fica registrada com seu nome, data e motivo.
          </p>
          <Textarea label="Motivo da decisão" value={reason} onChange={(e) => setReason(e.target.value)} />
          {error ? <Notice tone="error">{error}</Notice> : null}
        </div>
      ) : null}
    </Dialog>
  );
}

const KINDS: CorrectionKind[] = ['include_punch', 'replace_time', 'disregard_punch', 'justify_absence'];

/** Formulário de correção. Funcionário: pedido. Empregador: proposta que o funcionário precisa aceitar. */
export function CorrectionForm({ tz, employeeId, onDone }: { tz: string; employeeId?: string; onDone: () => void }) {
  const [kind, setKind] = useState<CorrectionKind>('include_punch');
  const [month, setMonth] = useState(mesAtual(tz));
  const [type, setType] = useState<PunchType>('clock_out');
  const [date, setDate] = useState(hojeLocal(tz));
  const [time, setTime] = useState('');
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsTarget = kind === 'disregard_punch' || kind === 'replace_time';
  const [y, m] = month.split('-');
  const last = new Date(Number(y), Number(m), 0).getDate();
  const punchesPath = !needsTarget ? null : employeeId ? `/punches${qs({ employeeId, from: `${month}-01`, to: `${month}-${last}`, pageSize: 100 })}` : `/me/punches?month=${month}`;
  const punches = useResource<PunchView[] | Page<PunchView>>(punchesPath);
  const list: PunchView[] = !punches.data ? [] : Array.isArray(punches.data) ? punches.data : punches.data.items;

  async function submit() {
    setBusy(true);
    setFields({});
    setError(null);
    try {
      const proposedTime = (kind === 'include_punch' || kind === 'replace_time') && date && time ? localToInstant(date, time, tz).toISOString() : null;
      await api.post('/corrections', {
        kind,
        employeeId,
        targetPunchId: needsTarget ? target || null : null,
        proposedType: kind === 'include_punch' ? type : null,
        proposedTime,
        absenceDate: kind === 'justify_absence' ? date : null,
        reason,
      });
      setReason('');
      setTime('');
      setTarget('');
      onDone();
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        setError(e.message);
      } else setError('Não foi possível enviar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Select label="O que precisa ser corrigido" value={kind} onChange={(e) => setKind(e.target.value as CorrectionKind)}>
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {CORRECTION_KIND_LABEL[k]}
          </option>
        ))}
      </Select>
      {needsTarget ? (
        <>
          <Input label="Mês da marcação" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <Select label="Marcação" value={target} onChange={(e) => setTarget(e.target.value)} error={fields.targetPunchId}>
            <option value="">Escolha…</option>
            {list
              .filter((p) => !p.disregarded)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {dataHora(p.serverTime, tz)} · {PUNCH_TYPE_LABEL[p.type]} · NSR {p.nsr}
                </option>
              ))}
          </Select>
        </>
      ) : null}
      {kind === 'include_punch' ? (
        <Select label="Tipo da marcação" value={type} onChange={(e) => setType(e.target.value as PunchType)} error={fields.proposedType}>
          {PUNCH_TYPES.map((t) => (
            <option key={t} value={t}>
              {PUNCH_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      ) : null}
      {kind !== 'disregard_punch' ? (
        <div className="grid grid-cols-2 gap-3">
          <Input label={kind === 'justify_absence' ? 'Dia da ausência' : 'Dia'} type="date" value={date} onChange={(e) => setDate(e.target.value)} error={fields.absenceDate} />
          {kind !== 'justify_absence' ? <Input label={kind === 'replace_time' ? 'Horário correto' : 'Horário'} type="time" value={time} onChange={(e) => setTime(e.target.value)} error={fields.proposedTime} /> : null}
        </div>
      ) : null}
      <Textarea label="Motivo" hint="Explique o que aconteceu. Fica no histórico junto com a decisão." value={reason} onChange={(e) => setReason(e.target.value)} error={fields.reason} />
      {error && !Object.keys(fields).length ? <Notice tone="error">{error}</Notice> : null}
      <Button onClick={submit} busy={busy}>
        {employeeId ? 'Enviar proposta ao funcionário' : 'Enviar pedido'}
      </Button>
    </div>
  );
}
