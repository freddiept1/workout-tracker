import { useEffect, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { db } from '../../db/db';
import { saveProgram, type ProgramInput } from '../../db/repo';
import type { Exercise, Method, PlannedExercise, ProgramDay, Unit } from '../../db/types';
import { useExerciseMap } from '../../hooks';
import { move } from '../../lib/draft';
import { newId } from '../../lib/ids';
import { defaultPlan, METHOD_HINT, METHOD_LABEL } from '../../lib/programs';
import { EFFORT_VALUES, MODES, modeOf, RPE_VALUES } from '../../lib/tracking';
import { formatWeight, parseNumber, toKg } from '../../lib/units';
import { ExercisePicker } from '../log/ExercisePicker';

interface Props {
  open: boolean;
  initial: (ProgramInput & { id?: string }) | null;
  unit: Unit;
  onClose: () => void;
}

const METHODS: Method[] = ['linear', 'double', 'rpe', 'pct', 'fixed'];
const blank = (): ProgramInput => ({ name: '', weeks: 4, deloadEvery: null, maxes: {}, days: [{ id: newId(), name: 'Day A', exercises: [] }] });

/** Build or edit a program: weeks, deloads, and days of planned exercises. */
export function ProgramEditor({ open, initial, unit, onClose }: Props) {
  const exercises = useExerciseMap();
  const [p, setP] = useState<ProgramInput & { id?: string }>(blank());
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setP(initial ? structuredClone(initial) : blank()); setExpanded(null); setError(''); }
  }, [open, initial]);

  const setDay = (i: number, day: ProgramDay) => setP({ ...p, days: p.days.map((d, j) => (j === i ? day : d)) });
  const setPlan = (i: number, id: string, patch: Partial<PlannedExercise>) =>
    setDay(i, { ...p.days[i], exercises: p.days[i].exercises.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  async function save() {
    try {
      await saveProgram(db, p);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Sheet open={open} title={p.id ? 'Edit program' : 'New program'} onClose={onClose}>
      <div className="stack">
        <div>
          <label htmlFor="progName">Name</label>
          <input id="progName" placeholder="e.g. Meet Prep Block 1" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        </div>
        <div className="row">
          <div className="grow">
            <label htmlFor="progWeeks">Weeks</label>
            <input id="progWeeks" inputMode="numeric" value={p.weeks || ''} onChange={(e) => setP({ ...p, weeks: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
          </div>
          <div className="grow">
            <label htmlFor="progDeload">Deload</label>
            <select id="progDeload" value={p.deloadEvery ?? ''} onChange={(e) => setP({ ...p, deloadEvery: e.target.value ? Number(e.target.value) : null })}>
              <option value="">No deloads</option>
              {[3, 4, 5, 6].map((n) => <option key={n} value={n}>Every {n}th week</option>)}
            </select>
          </div>
        </div>
        <p className="hint">Workouts are done in order (Week 1 Day A, Day B…). Miss a day and the program waits for you. Deload weeks halve the sets and take 10% off.</p>

        {p.days.map((day, i) => (
          <div className="card program-day" key={day.id}>
            <div className="row">
              <input className="grow day-name" aria-label="Day name" value={day.name} onChange={(e) => setDay(i, { ...day, name: e.target.value })} />
              <button type="button" className="danger icon" aria-label="Remove day" onClick={() => confirm(`Remove ${day.name}?`) && setP({ ...p, days: p.days.filter((_, j) => j !== i) })}>✕</button>
            </div>
            {day.exercises.map((plan, k) => (
              <PlanRow
                key={plan.id} plan={plan} exercise={exercises.get(plan.exerciseId)} weeks={p.weeks} unit={unit}
                max={p.maxes[plan.exerciseId] ?? null}
                expanded={expanded === plan.id}
                onToggle={() => setExpanded(expanded === plan.id ? null : plan.id)}
                onChange={(patch) => setPlan(i, plan.id, patch)}
                onMax={(kg) => setP({ ...p, maxes: kg ? { ...p.maxes, [plan.exerciseId]: kg } : Object.fromEntries(Object.entries(p.maxes).filter(([id]) => id !== plan.exerciseId)) })}
                onMove={(dir) => setDay(i, { ...day, exercises: move(day.exercises, k, k + dir) })}
                onRemove={() => setDay(i, { ...day, exercises: day.exercises.filter((e) => e.id !== plan.id) })}
              />
            ))}
            <button type="button" className="ghost small" onClick={() => setPickFor(i)}>+ Add exercise</button>
          </div>
        ))}
        <button
          type="button" className="ghost full"
          onClick={() => setP({ ...p, days: [...p.days, { id: newId(), name: `Day ${String.fromCharCode(65 + p.days.length)}`, exercises: [] }] })}
        >+ Add day</button>

        {error && <p className="error">{error}</p>}
        <button type="button" className="full" onClick={save}>{p.id ? 'Save program' : 'Create program'}</button>
      </div>

      <ExercisePicker
        open={pickFor !== null}
        onClose={() => setPickFor(null)}
        onPick={(ex) => {
          if (pickFor === null) return;
          const plan = defaultPlan(ex, newId());
          setDay(pickFor, { ...p.days[pickFor], exercises: [...p.days[pickFor].exercises, plan] });
          setExpanded(plan.id);
        }}
      />
    </Sheet>
  );
}

function planSummary(plan: PlannedExercise, exercise: Exercise | undefined, unit: Unit): string {
  if (MODES[modeOf(exercise)].rating === 'effort') {
    return `${plan.sets} × ${plan.distanceM ? `${plan.distanceM} m × ` : ''}${plan.reps}${plan.effort ? ` @ ${plan.effort}%` : ''}`;
  }
  const w = (kg: number) => `${formatWeight(kg, unit)} ${unit}`;
  const base = `${plan.sets} × ${plan.reps}`;
  switch (plan.method) {
    case 'linear': return `${base} · linear +${w(plan.incrementKg)}`;
    case 'double': return `${base} · double +${w(plan.incrementKg)}`;
    case 'rpe': return `${base} @ RPE ${plan.rpe ?? 8}`;
    case 'pct': return `${base} @ ${plan.pcts.join('/')}%`;
    case 'fixed': return `${base}${plan.startKg ? ` @ ${w(plan.startKg)}` : ''}`;
  }
}

interface RowProps {
  plan: PlannedExercise;
  exercise: Exercise | undefined;
  weeks: number;
  unit: Unit;
  max: number | null;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<PlannedExercise>) => void;
  onMax: (kg: number | null) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}

function PlanRow({ plan, exercise, weeks, unit, max, expanded, onToggle, onChange, onMax, onMove, onRemove }: RowProps) {
  const athletic = MODES[modeOf(exercise)].rating === 'effort';
  const mode = MODES[modeOf(exercise)];
  const kgField = (label: string, value: number | null, set: (kg: number | null) => void, id: string) => (
    <div className="grow">
      <label htmlFor={id} className="sub">{label}</label>
      <input
        id={id} inputMode="decimal" placeholder="–" defaultValue={value ? formatWeight(value, unit) : ''}
        onBlur={(e) => { const n = parseNumber(e.target.value); set(n ? toKg(n, unit) : null); }}
      />
    </div>
  );
  const pcts = Array.from({ length: Math.max(1, weeks) }, (_, w) => plan.pcts[Math.min(w, plan.pcts.length - 1)] ?? 75);

  return (
    <div className={'plan-row' + (expanded ? ' open' : '')}>
      <button type="button" className="plan-head" onClick={onToggle}>
        <span className="grow">
          <b>{exercise?.name ?? plan.exerciseId}</b>
          <span className="pick-sub">{planSummary(plan, exercise, unit)}{plan.notes ? ` · ${plan.notes}` : ''}</span>
        </span>
        <span className="chev-small">{expanded ? '▴' : '▾'}</span>
      </button>
      {expanded && (
        <div className="stack plan-body">
          {!athletic && (
            <div>
              <div className="chips">
                {METHODS.map((m) => (
                  <button type="button" key={m} className={'chip-btn' + (plan.method === m ? ' on' : '')} onClick={() => onChange({ method: m })}>{METHOD_LABEL[m]}</button>
                ))}
              </div>
              <p className="hint">{METHOD_HINT[plan.method]}</p>
            </div>
          )}
          <div className="row">
            <div className="grow">
              <label className="sub" htmlFor={plan.id + 'sets'}>Sets</label>
              <input id={plan.id + 'sets'} inputMode="numeric" value={plan.sets || ''} onChange={(e) => onChange({ sets: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
            </div>
            <div className="grow">
              <label className="sub" htmlFor={plan.id + 'reps'}>{plan.method === 'double' && !athletic ? 'Rep range' : 'Reps'}</label>
              <input id={plan.id + 'reps'} value={plan.reps} placeholder={plan.method === 'double' ? '8-12' : '5'} onChange={(e) => onChange({ reps: e.target.value.replace(/[^\d-–]/g, '') })} />
            </div>
            {athletic && mode.fields.includes('distance') && (
              <div className="grow">
                <label className="sub" htmlFor={plan.id + 'dist'}>Distance (m)</label>
                <input id={plan.id + 'dist'} inputMode="decimal" value={plan.distanceM ?? ''} onChange={(e) => onChange({ distanceM: parseNumber(e.target.value) })} />
              </div>
            )}
          </div>

          {athletic ? (
            <div>
              <label className="sub">Effort</label>
              <div className="chips">
                {EFFORT_VALUES.map((v) => (
                  <button type="button" key={v} className={'chip-btn' + (plan.effort === v ? ' on' : '')} onClick={() => onChange({ effort: v })}>{v}%</button>
                ))}
              </div>
              {mode.fields.includes('weight') && kgField(`Load (${unit})`, plan.startKg, (kg) => onChange({ startKg: kg }), plan.id + 'load')}
            </div>
          ) : (
            <>
              {(plan.method === 'linear' || plan.method === 'double' || plan.method === 'fixed') && (
                <div className="row">
                  {kgField(plan.method === 'fixed' ? `Load (${unit})` : `Starting weight (${unit})`, plan.startKg, (kg) => onChange({ startKg: kg }), plan.id + 'start')}
                  {plan.method !== 'fixed' && kgField(`Add each time (${unit})`, plan.incrementKg, (kg) => onChange({ incrementKg: kg ?? 2.5 }), plan.id + 'inc')}
                </div>
              )}
              {plan.method === 'rpe' && (
                <div>
                  <label className="sub">Target RPE</label>
                  <div className="chips">
                    {RPE_VALUES.map((v) => (
                      <button type="button" key={v} className={'chip-btn' + (plan.rpe === v ? ' on' : '')} onClick={() => onChange({ rpe: v })}>{v}</button>
                    ))}
                  </div>
                </div>
              )}
              {plan.method === 'pct' && (
                <div>
                  <label className="sub">% of 1RM {weeks > 1 ? 'by week' : ''}</label>
                  <div className="pct-grid">
                    {pcts.map((v, w) => (
                      <label key={w} className="pct-cell">
                        <span>W{w + 1}</span>
                        <input
                          inputMode="decimal" value={v}
                          onChange={(e) => { const next = [...pcts]; next[w] = parseNumber(e.target.value) ?? 0; onChange({ pcts: next }); }}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="row">{kgField(`1RM (${unit}, optional)`, max, onMax, plan.id + 'max')}</div>
                  <p className="hint">Leave 1RM empty to use your best estimated 1RM from the last 12 weeks.</p>
                </div>
              )}
            </>
          )}

          <div>
            <label className="sub" htmlFor={plan.id + 'notes'}>Note</label>
            <input id={plan.id + 'notes'} placeholder="e.g. Top set, Back-off sets" value={plan.notes} onChange={(e) => onChange({ notes: e.target.value })} />
          </div>
          <div className="row">
            <button type="button" className="ghost small grow" onClick={() => onMove(-1)}>Move up</button>
            <button type="button" className="ghost small grow" onClick={() => onMove(1)}>Move down</button>
            <button type="button" className="danger small grow" onClick={onRemove}>Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}
