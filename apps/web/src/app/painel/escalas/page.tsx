'use client';
import { Archive, CalendarPlus, Check, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { formatDateBR, formatDuration, weekdayShort } from '@pontonexo/shared';
import { useState } from 'react';
import { useSession } from '@/components/session';
import { Button, Card, Checkbox, Dialog, Empty, ErrorState, Input, Loading, Notice, PageHeader, Select, Segmented, Tone, usePaged } from '@/components/ui';
import { SECAO } from '@/components/secoes';
import { api, ApiError } from '@/lib/api';
import { useResource } from '@/lib/hooks';

interface Sched {
  id: string;
  name: string;
  kind: 'weekly' | 'cycle_12x36';
  days: Array<{ weekday: number; start: string; end: string; breakMinutes: number }>;
  cycleAnchorDate: string | null;
  cycleStart: string | null;
  cycleEnd: string | null;
  cycleBreakMinutes: number | null;
  active: boolean;
  weeklySeconds: number;
}
interface Holiday {
  id: string | null;
  date: string;
  name: string;
  scope: string;
  removable: boolean;
}

const WEEK = [1, 2, 3, 4, 5, 6, 7];
const WEEK_LABEL = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export default function Escalas() {
  const { can } = useSession();
  const [tab, setTab] = useState<'escalas' | 'feriados'>('escalas');
  const [year, setYear] = useState(new Date().getFullYear());
  const s = useResource<Sched[]>('/schedules');
  const h = useResource<Holiday[]>(`/holidays?year=${year}`);
  const schedPage = usePaged(s.data ?? [], 6);
  const holPage = usePaged(h.data ?? [], 15);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', kind: 'weekly' as 'weekly' | 'cycle_12x36', cycleAnchorDate: '', cycleStart: '19:00', cycleEnd: '07:00', cycleBreakMinutes: 60 });
  const [days, setDays] = useState<Record<number, { on: boolean; start: string; end: string; breakMinutes: number }>>(Object.fromEntries(WEEK.map((w) => [w, { on: w <= 5, start: '08:00', end: '17:00', breakMinutes: 60 }])));
  const [hol, setHol] = useState({ date: '', name: '', scope: 'municipal' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, ok: string, after?: () => void) {
    setBusy(true);
    setFields({});
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'ok', text: ok });
      after?.();
    } catch (e) {
      if (e instanceof ApiError) setFields(e.fields);
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Não foi possível salvar.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader {...SECAO.escalas} title="Horários e feriados" back={{ href: '/painel', label: 'Início' }} actions={can('schedules.write') && tab === 'escalas' ? <Button onClick={() => setOpen(true)}><CalendarPlus size={18} aria-hidden /> Nova escala</Button> : null} />
      <div className="mb-4">
        <Segmented label="Seção" value={tab} onChange={setTab} options={[{ value: 'escalas', label: 'Escalas' }, { value: 'feriados', label: 'Feriados' }]} />
      </div>
      {msg ? <div className="mb-3"><Notice tone={msg.tone}>{msg.text}</Notice></div> : null}
      {tab === 'escalas' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {s.loading && !s.data ? <Loading /> : s.error ? <ErrorState message={s.error.message} onRetry={s.reload} /> : (s.data ?? []).length === 0 ? (
            <Card><Empty title="Nenhuma escala" description="A escala define a jornada prevista de cada dia. Ela é a base para apontar excedentes, faltas e atrasos." /></Card>
          ) : (
            schedPage.rows.map((x) => (
              <Card
                key={x.id}
                title={x.name}
                actions={
                  can('schedules.write') ? (
                    <Button size="sm" variant="ghost" onClick={() => run(() => api.post(`/schedules/${x.id}/${x.active ? 'archive' : 'activate'}`), x.active ? 'Escala arquivada.' : 'Escala reativada.', s.reload)}>
                      <Archive size={18} aria-hidden /> {x.active ? 'Arquivar' : 'Reativar'}
                    </Button>
                  ) : null
                }
              >
                {!x.active ? <p className="mb-2 text-sm"><Tone tone="muted">Arquivada: não pode ser atribuída a novos períodos.</Tone></p> : null}
                {x.kind === 'weekly' ? (
                  <>
                    <ul className="text-sm">
                      {WEEK.map((w) => {
                        const d = x.days.find((y) => y.weekday === w);
                        return (
                          <li key={w} className="flex justify-between border-b border-borda py-1 last:border-0">
                            <span>{WEEK_LABEL[w]}</span>
                            <span className="tabular">{d ? `${d.start}–${d.end} · intervalo ${d.breakMinutes} min` : <Tone tone="muted">Descanso</Tone>}</span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-2 text-sm text-texto-2">
                      Total semanal: <span className="font-semibold tabular">{formatDuration(x.weeklySeconds)}</span>
                      {x.weeklySeconds > 44 * 3600 ? <Tone tone="error"> · acima de 44 h (LC 150, art. 2º)</Tone> : null}
                    </p>
                  </>
                ) : (
                  <p className="text-sm">
                    Plantão 12×36 das {x.cycleStart} às {x.cycleEnd}, intervalo {x.cycleBreakMinutes} min. Data-base {x.cycleAnchorDate ? formatDateBR(x.cycleAnchorDate) : '—'} (dia de plantão). Feriados considerados compensados (LC 150, art. 10, § 1º).
                  </p>
                )}
              </Card>
            ))
          )}
          <div className="lg:col-span-2">{schedPage.pager}</div>
        </div>
      ) : (
        <Card
          title={`Feriados de ${year}`}
          actions={
            <span className="flex gap-1">
              <Button size="sm" variant="secondary" onClick={() => setYear(year - 1)}>
                <ChevronLeft size={18} aria-hidden /> {year - 1}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setYear(year + 1)}>
                {year + 1} <ChevronRight size={18} aria-hidden />
              </Button>
            </span>
          }
        >
          <ul className="divide-y divide-borda">
            {holPage.rows.map((x) => (
              <li key={`${x.date}${x.name}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="tabular">{formatDateBR(x.date)}</span> <span className="text-texto-3">{weekdayShort(x.date)}</span> · <span className="font-semibold">{x.name}</span>
                </span>
                <span className="flex items-center gap-2 text-sm text-texto-3">
                  {x.scope === 'national' ? 'Nacional (lei federal)' : x.scope === 'state' ? 'Estadual' : x.scope === 'municipal' ? 'Municipal' : 'Outro'}
                  {x.removable && x.id && can('schedules.write') ? (
                    <Button size="sm" variant="ghost" onClick={() => run(() => api.del(`/holidays/${x.id}`), 'Feriado removido.', h.reload)}>
                      <Trash2 size={18} aria-hidden /> Remover
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {holPage.pager}
          {can('schedules.write') ? (
            <div className="mt-4 grid gap-2 border-t border-borda pt-4 sm:grid-cols-[160px_1fr_160px_auto] sm:items-end">
              <Input label="Data" type="date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} error={fields.date} />
              <Input label="Nome" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} error={fields.name} />
              <Select label="Abrangência" value={hol.scope} onChange={(e) => setHol({ ...hol, scope: e.target.value })}>
                <option value="municipal">Municipal</option>
                <option value="state">Estadual</option>
                <option value="other">Outro</option>
              </Select>
              <Button busy={busy} onClick={() => run(() => api.post('/holidays', hol), 'Feriado cadastrado.', () => { setHol({ date: '', name: '', scope: 'municipal' }); h.reload(); })}>
                <Plus size={18} aria-hidden /> Adicionar
              </Button>
            </div>
          ) : null}
          <p className="mt-3 text-xs text-texto-3">Os nacionais vêm da lei federal. Cadastre os estaduais e municipais (inclusive Sexta-feira da Paixão, se for feriado no município).</p>
        </Card>
      )}

      <Dialog
        open={open}
        title="Nova escala"
        onClose={() => setOpen(false)}
        footer={
          <Button
            busy={busy}
            onClick={() =>
              run(
                () =>
                  api.post('/schedules', {
                    name: form.name,
                    kind: form.kind,
                    days: form.kind === 'weekly' ? WEEK.filter((w) => days[w]!.on).map((w) => ({ weekday: w, start: days[w]!.start, end: days[w]!.end, breakMinutes: days[w]!.breakMinutes })) : [],
                    cycleAnchorDate: form.kind === 'cycle_12x36' ? form.cycleAnchorDate || null : null,
                    cycleStart: form.kind === 'cycle_12x36' ? form.cycleStart : null,
                    cycleEnd: form.kind === 'cycle_12x36' ? form.cycleEnd : null,
                    cycleBreakMinutes: form.kind === 'cycle_12x36' ? form.cycleBreakMinutes : null,
                  }),
                'Escala criada. Atribua aos funcionários na ficha de cada um.',
                () => {
                  setOpen(false);
                  s.reload();
                },
              )
            }
          >
            <Check size={18} aria-hidden /> Salvar escala
          </Button>
        }
      >
        <div className="space-y-3">
          <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={fields.name} />
          <Segmented label="Tipo" value={form.kind} onChange={(k) => setForm({ ...form, kind: k })} options={[{ value: 'weekly', label: 'Semanal' }, { value: 'cycle_12x36', label: '12 × 36' }]} />
          {form.kind === 'weekly' ? (
            <div className="space-y-2">
              {fields.days ? <Notice tone="error">{fields.days}</Notice> : null}
              {WEEK.map((w) => (
                <div key={w} className="grid grid-cols-[110px_1fr] items-center gap-2 sm:grid-cols-[110px_110px_110px_120px]">
                  <Checkbox label={WEEK_LABEL[w]!} checked={days[w]!.on} onChange={(e) => setDays({ ...days, [w]: { ...days[w]!, on: e.target.checked } })} />
                  {days[w]!.on ? (
                    <>
                      <input aria-label={`Início ${WEEK_LABEL[w]}`} type="time" className="h-9 rounded-[8px] border border-borda bg-fundo px-2" value={days[w]!.start} onChange={(e) => setDays({ ...days, [w]: { ...days[w]!, start: e.target.value } })} />
                      <input aria-label={`Fim ${WEEK_LABEL[w]}`} type="time" className="h-9 rounded-[8px] border border-borda bg-fundo px-2" value={days[w]!.end} onChange={(e) => setDays({ ...days, [w]: { ...days[w]!, end: e.target.value } })} />
                      <input aria-label={`Intervalo ${WEEK_LABEL[w]} em minutos`} type="number" min={0} max={240} className="h-9 rounded-[8px] border border-borda bg-fundo px-2" value={days[w]!.breakMinutes} onChange={(e) => setDays({ ...days, [w]: { ...days[w]!, breakMinutes: Number(e.target.value) } })} />
                    </>
                  ) : (
                    <span className="text-sm text-texto-3">Descanso</span>
                  )}
                </div>
              ))}
              <p className="text-xs text-texto-3">Colunas: início, fim e intervalo (min). Fim menor que o início indica jornada que vira o dia.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Data-base (um dia de plantão)" type="date" value={form.cycleAnchorDate} onChange={(e) => setForm({ ...form, cycleAnchorDate: e.target.value })} error={fields.cycleAnchorDate} />
              <Input label="Intervalo (min)" type="number" value={form.cycleBreakMinutes} onChange={(e) => setForm({ ...form, cycleBreakMinutes: Number(e.target.value) })} />
              <Input label="Início do plantão" type="time" value={form.cycleStart} onChange={(e) => setForm({ ...form, cycleStart: e.target.value })} />
              <Input label="Fim do plantão" type="time" value={form.cycleEnd} onChange={(e) => setForm({ ...form, cycleEnd: e.target.value })} />
              <p className="text-xs text-texto-3 sm:col-span-2">12×36 exige acordo escrito (LC 150, art. 10), informado no contrato.</p>
            </div>
          )}
          {msg?.tone === 'error' && !Object.keys(fields).length ? <Notice tone="error">{msg.text}</Notice> : null}
        </div>
      </Dialog>
    </div>
  );
}
