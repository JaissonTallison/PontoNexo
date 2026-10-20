'use client';
import { CONTRACT_REGIME_LABEL, LOCATION_KIND_LABEL, type ContractRegime, type LocationKind } from '@pontonexo/shared';
import { ArrowRight, Check, SkipForward, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { JobRoleSelect } from '@/components/funcao';
import { useSession } from '@/components/session';
import { Button, Card, Checkbox, Input, Notice, PageHeader, Select } from '@/components/ui';
import { SECAO } from '@/components/secoes';
import { api, ApiError } from '@/lib/api';
import { hojeLocal } from '@/lib/formato';
import { useResource } from '@/lib/hooks';
import { mascaraCpf, mascaraTelefone } from '@/lib/mascara';

const STEPS = ['Dados', 'Contrato', 'Horário', 'Local', 'Acesso'] as const;

interface Loc {
  id: string;
  name: string;
  kind: LocationKind;
  active: boolean;
  geofence: { radiusM: number } | null;
}

/** Guarda erros de campo e de envio de cada etapa. */
function useStep() {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setFields({});
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        setError(Object.keys(e.fields).length ? null : e.message);
      } else setError('Não foi possível salvar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };
  return { fields, error, busy, run };
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-4 grid grid-cols-5 gap-1.5" aria-label="Etapas do cadastro">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === step ? 'step' : undefined} className="flex flex-col items-center gap-1 text-center sm:flex-row sm:gap-2">
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-[8px] text-sm font-bold ${i < step ? 'bg-acao text-white' : i === step ? 'bg-marca text-white' : 'bg-realce text-texto-2'}`} aria-hidden>
            {i < step ? <Check size={16} /> : i + 1}
          </span>
          <span className={`text-xs font-semibold sm:text-sm ${i === step ? 'text-marca' : 'text-texto-3'}`}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

function StepCard({ title, intro, children, footer, error }: { title: string; intro: string; children: ReactNode; footer: ReactNode; error: string | null }) {
  return (
    <Card>
      <h2 className="text-lg font-bold text-marca">{title}</h2>
      <p className="mt-1 mb-4 text-texto-2">{intro}</p>
      {children}
      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-borda pt-4">{footer}</div>
    </Card>
  );
}

/**
 * Cadastro guiado: uma pergunta de cada vez, com valores comuns já preenchidos.
 * O funcionário é salvo na primeira etapa; as seguintes podem ser puladas e completadas depois na ficha.
 */
export default function NovoFuncionario() {
  const router = useRouter();
  const { me } = useSession();
  const tz = me.timezone;
  const today = hojeLocal(tz);
  const scheds = useResource<Array<{ id: string; name: string; active: boolean }>>('/schedules');
  const locs = useResource<Loc[]>('/locations');
  const [step, setStep] = useState(0);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const st = useStep();

  const [f, setF] = useState({ fullName: '', cpf: '', email: '', phone: '', jobRoleId: '' });
  const [c, setC] = useState({ startDate: today, regime: 'full_time' as ContractRegime, weeklyHours: 40, residesAtWorkplace: false });
  const [schedChoice, setSchedChoice] = useState<string>('novo');
  const [h, setH] = useState({ start: '08:00', end: '17:00', breakMinutes: 60, saturday: false, satStart: '08:00', satEnd: '12:00' });
  const [chosenLocs, setChosenLocs] = useState<string[] | null>(null);
  const [sendAccess, setSendAccess] = useState(true);

  const activeScheds = (scheds.data ?? []).filter((s) => s.active);
  const activeLocs = (locs.data ?? []).filter((l) => l.active);
  // padrão: todas as residências com cerca já vêm marcadas
  const selectedLocs = chosenLocs ?? activeLocs.filter((l) => l.kind === 'residence').map((l) => l.id);
  const next = () => setStep((s) => s + 1);
  const skip = (what: string) => {
    setSkipped((x) => [...x, what]);
    next();
  };
  const finish = () => router.replace(`/painel/funcionarios/${employeeId}?novo=1`);

  const skipButton = (what: string) => (
    <Button variant="secondary" onClick={() => skip(what)} disabled={st.busy}>
      <SkipForward size={18} aria-hidden /> Pular por agora
    </Button>
  );

  return (
    <div className="max-w-[760px]">
      <PageHeader {...SECAO.novoFuncionario} title="Novo funcionário" back={{ href: '/painel/funcionarios', label: 'Funcionários' }} />
      <Stepper step={step} />

      {step === 0 ? (
        <StepCard
          title="Quem é o funcionário?"
          intro="Só os dados necessários ao registro de jornada. Sem salário, documentos ou fotos."
          error={st.error}
          footer={
            <>
              <Button
                busy={st.busy}
                onClick={() =>
                  st.run(async () => {
                    const r = await api.post<{ id: string }>('/employees', { ...f, email: f.email || null, phone: f.phone || null, jobRoleId: f.jobRoleId || null, createAccess: false });
                    setEmployeeId(r.id);
                    next();
                  })
                }
              >
                Salvar e continuar <ArrowRight size={18} aria-hidden />
              </Button>
              <Button variant="secondary" onClick={() => router.back()}>
                <X size={18} aria-hidden /> Cancelar
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label="Nome completo" autoComplete="off" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} error={st.fields.fullName} />
            </div>
            <Input label="CPF" inputMode="numeric" placeholder="000.000.000-00" value={f.cpf} onChange={(e) => setF({ ...f, cpf: mascaraCpf(e.target.value) })} error={st.fields.cpf} hint="Aparece no comprovante de cada marcação." />
            <JobRoleSelect value={f.jobRoleId} onChange={(id) => setF({ ...f, jobRoleId: id })} error={st.fields.jobRoleId} />
            <Input label="Celular" type="tel" inputMode="tel" placeholder="(11) 98765-4321" value={f.phone} onChange={(e) => setF({ ...f, phone: mascaraTelefone(e.target.value) })} error={st.fields.phone} />
            <Input label="E-mail" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={st.fields.email} hint="Para enviar o acesso ao app." />
          </div>
        </StepCard>
      ) : null}

      {step === 1 && employeeId ? (
        <StepCard
          title="Contrato de trabalho"
          intro="Vale a partir da data de início. Banco de horas, 12 × 36 e acordos escritos podem ser registrados depois, na ficha do funcionário."
          error={st.error}
          footer={
            <>
              <Button busy={st.busy} onClick={() => st.run(async () => {
                await api.post(`/employees/${employeeId}/contracts`, { ...c, breakReductionAgreement: false, compensation: 'none', travelAgreement: false, writtenAgreementRef: null, notes: null });
                next();
              })}>
                Salvar e continuar <ArrowRight size={18} aria-hidden />
              </Button>
              {skipButton('contrato')}
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Começou a trabalhar em" type="date" value={c.startDate} onChange={(e) => setC({ ...c, startDate: e.target.value })} error={st.fields.startDate} />
            <Input label="Horas por semana" type="number" min={1} max={44} value={c.weeklyHours} onChange={(e) => setC({ ...c, weeklyHours: Number(e.target.value) })} error={st.fields.weeklyHours} hint="Até 44 h. Segunda a sexta, 8 h por dia = 40 h." />
            <div className="sm:col-span-2">
              <Select label="Tipo de jornada" value={c.regime} onChange={(e) => setC({ ...c, regime: e.target.value as ContractRegime })}>
                {(['full_time', 'part_time'] as const).map((r) => (
                  <option key={r} value={r}>
                    {CONTRACT_REGIME_LABEL[r]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Checkbox label="Mora no local de trabalho" hint="Permite dividir o intervalo em dois períodos (LC 150, art. 13, § 1º)." checked={c.residesAtWorkplace} onChange={(e) => setC({ ...c, residesAtWorkplace: e.target.checked })} />
            </div>
          </div>
        </StepCard>
      ) : null}

      {step === 2 && employeeId ? (
        <StepCard
          title="Horário de trabalho"
          intro="Usado para lembrar o funcionário de marcar e para calcular atrasos e horas extras."
          error={st.error}
          footer={
            <>
              <Button
                busy={st.busy}
                onClick={() =>
                  st.run(async () => {
                    let scheduleId = schedChoice;
                    if (schedChoice === 'novo') {
                      const days = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: h.start, end: h.end, breakMinutes: h.breakMinutes }));
                      if (h.saturday) days.push({ weekday: 6, start: h.satStart, end: h.satEnd, breakMinutes: 0 });
                      const name = `Seg a sex, ${h.start} às ${h.end}${h.saturday ? `, sáb ${h.satStart} às ${h.satEnd}` : ''}`;
                      const r = await api.post<{ id: string }>('/schedules', { name, kind: 'weekly', days });
                      scheduleId = r.id;
                    }
                    await api.post(`/employees/${employeeId}/schedules`, { scheduleId, validFrom: c.startDate < today ? c.startDate : today });
                    next();
                  })
                }
              >
                Salvar e continuar <ArrowRight size={18} aria-hidden />
              </Button>
              {skipButton('horário')}
            </>
          }
        >
          <fieldset className="space-y-2">
            <legend className="sr-only">Escolha o horário</legend>
            {activeScheds.map((s) => (
              <label key={s.id} className={`flex cursor-pointer items-center gap-3 rounded-[8px] border px-3 py-3 ${schedChoice === s.id ? 'border-marca-3 bg-marca-suave' : 'border-borda hover:bg-realce'}`}>
                <input type="radio" name="horario" className="size-4 accent-[var(--color-marca)]" checked={schedChoice === s.id} onChange={() => setSchedChoice(s.id)} />
                <span className="font-semibold">{s.name}</span>
              </label>
            ))}
            <label className={`flex cursor-pointer items-center gap-3 rounded-[8px] border px-3 py-3 ${schedChoice === 'novo' ? 'border-marca-3 bg-marca-suave' : 'border-borda hover:bg-realce'}`}>
              <input type="radio" name="horario" className="size-4 accent-[var(--color-marca)]" checked={schedChoice === 'novo'} onChange={() => setSchedChoice('novo')} />
              <span className="font-semibold">{activeScheds.length ? 'Criar outro horário' : 'Criar o horário de segunda a sexta'}</span>
            </label>
          </fieldset>
          {schedChoice === 'novo' ? (
            <div className="mt-3 rounded-[8px] border border-borda p-3">
              <p className="mb-3 text-sm font-semibold text-texto-2">Segunda a sexta</p>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Entrada" type="time" value={h.start} onChange={(e) => setH({ ...h, start: e.target.value })} />
                <Input label="Saída" type="time" value={h.end} onChange={(e) => setH({ ...h, end: e.target.value })} />
                <Input label="Almoço (min)" type="number" min={0} max={240} value={h.breakMinutes} onChange={(e) => setH({ ...h, breakMinutes: Number(e.target.value) })} />
              </div>
              <div className="mt-3">
                <Checkbox label="Trabalha também no sábado" checked={h.saturday} onChange={(e) => setH({ ...h, saturday: e.target.checked })} />
              </div>
              {h.saturday ? (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <Input label="Entrada no sábado" type="time" value={h.satStart} onChange={(e) => setH({ ...h, satStart: e.target.value })} />
                  <Input label="Saída no sábado" type="time" value={h.satEnd} onChange={(e) => setH({ ...h, satEnd: e.target.value })} />
                </div>
              ) : null}
              {st.fields.days ? <p className="mt-2 text-sm text-perigo">{st.fields.days}</p> : null}
            </div>
          ) : null}
        </StepCard>
      ) : null}

      {step === 3 && employeeId ? (
        <StepCard
          title="Onde pode marcar o ponto"
          intro="A marcação fora destes locais continua aceita, mas aparece em Para revisar."
          error={st.error}
          footer={
            <>
              <Button
                busy={st.busy}
                disabled={!selectedLocs.length}
                onClick={() =>
                  st.run(async () => {
                    for (const locationId of selectedLocs) await api.post(`/employees/${employeeId}/locations`, { locationId, validFrom: c.startDate < today ? c.startDate : today, validTo: null });
                    next();
                  })
                }
              >
                Salvar e continuar <ArrowRight size={18} aria-hidden />
              </Button>
              {skipButton('local')}
            </>
          }
        >
          {activeLocs.length ? (
            <div className="space-y-2">
              {activeLocs.map((l) => (
                <label key={l.id} className={`flex cursor-pointer items-center gap-3 rounded-[8px] border px-3 py-3 ${selectedLocs.includes(l.id) ? 'border-marca-3 bg-marca-suave' : 'border-borda hover:bg-realce'}`}>
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-marca)]"
                    checked={selectedLocs.includes(l.id)}
                    onChange={(e) => setChosenLocs(e.target.checked ? [...selectedLocs, l.id] : selectedLocs.filter((x) => x !== l.id))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{l.name}</span>
                    <span className="block text-sm text-texto-3">
                      {LOCATION_KIND_LABEL[l.kind]}
                      {l.geofence ? ` · área de ${l.geofence.radiusM} m` : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <Notice tone="warn">
              Nenhum local cadastrado ainda. Pule esta etapa e cadastre a casa em{' '}
              <Link href="/painel/locais" className="font-semibold underline">
                Casa e locais
              </Link>
              ; depois autorize o funcionário na ficha dele.
            </Notice>
          )}
        </StepCard>
      ) : null}

      {step === 4 && employeeId ? (
        <StepCard
          title="Acesso ao app"
          intro="O funcionário marca o ponto pelo celular. Ele recebe um link para criar a própria senha."
          error={st.error}
          footer={
            <>
              <Button
                busy={st.busy}
                onClick={() =>
                  st.run(async () => {
                    if (sendAccess && f.email) await api.post(`/employees/${employeeId}/access`);
                    finish();
                  })
                }
              >
                <Check size={18} aria-hidden /> Concluir cadastro
              </Button>
            </>
          }
        >
          {f.email ? (
            <Checkbox label={`Enviar o acesso para ${f.email}`} hint="Também dá para enviar depois, na ficha do funcionário." checked={sendAccess} onChange={(e) => setSendAccess(e.target.checked)} />
          ) : (
            <Notice tone="warn">Sem e-mail cadastrado. Informe o e-mail na ficha do funcionário para enviar o acesso ao app.</Notice>
          )}
          {skipped.length ? <p className="mt-4 text-sm font-semibold text-atencao">Ficou para depois: {skipped.join(', ')}. Complete na ficha do funcionário.</p> : null}
        </StepCard>
      ) : null}
    </div>
  );
}
