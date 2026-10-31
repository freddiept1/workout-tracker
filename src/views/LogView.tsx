import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db/db';
import { finishDraft, lastPerformance } from '../db/repo';
import type { Draft, DraftExercise, DraftSet, Template, Unit } from '../db/types';
import { useExerciseMap, useExerciseNames, useTemplates } from '../hooks';
import { shortDate } from '../lib/dates';
import { exerciseIdFor, newId, nowIso, today } from '../lib/ids';
import { formatWeight } from '../lib/units';

interface Props {
  draft: Draft | null;
  unit: Unit;
  onChange: (draft: Draft | null) => void;
  onSaved: () => void;
}

const blankSet = (): DraftSet => ({ id: newId(), type: 'working', weight: '', reps: '' });

// Keep only digits (and one decimal point for weight); iPhone number pads can still paste junk.
const cleanReps = (v: string) => v.replace(/\D/g, '');
const cleanWeight = (v: string) => v.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');

export function LogView({ draft, unit, onChange, onSaved }: Props) {
  const templates = useTemplates();
  const exercises = useExerciseMap();
  const [justAdded, setJustAdded] = useState<string | null>(null);

  async function start(template: Template | null) {
    const names = template ? template.exercises.map((e) => exercises.get(e.exerciseId)?.name ?? e.exerciseId) : [''];
    // Pre-fill each exercise with what you did last time, so you only change what's different.
    const draftExercises: DraftExercise[] = await Promise.all(
      names.map(async (name) => {
        const last = name ? await lastPerformance(db, exerciseIdFor(name)) : null;
        const sets = last
          ? last.sets.map((s) => ({ ...blankSet(), weight: formatWeight(s.weightKg, unit), reps: s.reps === null ? '' : String(s.reps) }))
          : [blankSet()];
        return { id: newId(), name, sets };
      })
    );
    onChange({ unit, date: today(), startedAt: nowIso(), templateId: template?.id ?? null, notes: '', exercises: draftExercises });
  }

  if (!draft) {
    return (
      <>
        <h2>Start a workout</h2>
        {templates?.map((t) => (
          <div className="card template-card" key={t.id}>
            <div className="grow">
              <div className="card-title">{t.name}</div>
              <div className="card-sub">{t.exercises.map((e) => exercises.get(e.exerciseId)?.name ?? e.exerciseId).join(' · ')}</div>
            </div>
            <button type="button" onClick={() => start(t)}>Start</button>
          </div>
        ))}
        <button type="button" className="ghost full" onClick={() => start(null)}>Start a blank workout</button>
      </>
    );
  }

  const d = draft;
  const setExercise = (i: number, ex: DraftExercise) =>
    onChange({ ...d, exercises: d.exercises.map((e, j) => (j === i ? ex : e)) });

  function addSet(i: number) {
    // Copy the previous set so repeating the same weight is one tap.
    const ex = d.exercises[i];
    const last = ex.sets[ex.sets.length - 1];
    const set = { ...blankSet(), weight: last?.weight ?? '', reps: last?.reps ?? '' };
    setJustAdded(set.id);
    setExercise(i, { ...ex, sets: [...ex.sets, set] });
  }

  function removeExercise(i: number) {
    const ex = d.exercises[i];
    if (ex.name.trim() && !confirm(`Remove ${ex.name}?`)) return;
    onChange({ ...d, exercises: d.exercises.filter((_, j) => j !== i) });
  }

  function addExercise() {
    onChange({ ...d, exercises: [...d.exercises, { id: newId(), name: '', sets: [blankSet()] }] });
    // Focus the new name field once it has rendered.
    setTimeout(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('.exercise-head input');
      inputs[inputs.length - 1]?.focus();
    });
  }

  async function save() {
    if (!d.date) return alert('Pick a date for this workout.');
    const saved = await finishDraft(db, d);
    if (!saved) return alert('Add at least one exercise with a name and a set with reps.');
    onChange(null);
    onSaved();
  }

  return (
    <>
      <div className="card row">
        <div className="grow">
          <label htmlFor="logDate">Date</label>
          <input type="date" id="logDate" value={d.date} onChange={(e) => onChange({ ...d, date: e.target.value })} />
        </div>
        <button type="button" className="danger" onClick={() => confirm('Discard this workout? It has not been saved.') && onChange(null)}>
          Discard
        </button>
      </div>

      {d.exercises.map((ex, i) => (
        <div className="card" key={ex.id}>
          <div className="exercise-head">
            <input
              list="exerciseList"
              placeholder="Exercise name"
              autoCapitalize="words"
              value={ex.name}
              onChange={(e) => setExercise(i, { ...ex, name: e.target.value })}
            />
            <button type="button" className="danger icon" aria-label="Remove exercise" onClick={() => removeExercise(i)}>✕</button>
          </div>
          <LastTime name={ex.name} unit={unit} />
          <div className="set-row set-labels"><span /><span>Reps</span><span>Weight ({unit})</span><span /></div>
          {ex.sets.map((s, j) => {
            const setSet = (patch: Partial<DraftSet>) =>
              setExercise(i, { ...ex, sets: ex.sets.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) });
            return (
              <div className={'set-row' + (justAdded === s.id ? ' new' : '')} key={s.id}>
                <span className="set-num">{j + 1}</span>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={s.reps}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setSet({ reps: cleanReps(e.target.value) })}
                />
                <input
                  type="text" inputMode="decimal" placeholder="0" value={s.weight}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setSet({ weight: cleanWeight(e.target.value) })}
                />
                <button
                  type="button" className="ghost icon" aria-label="Remove set"
                  onClick={() => setExercise(i, { ...ex, sets: ex.sets.filter((x) => x.id !== s.id) })}
                >✕</button>
              </div>
            );
          })}
          <button type="button" className="ghost small" onClick={() => addSet(i)}>+ Add set</button>
        </div>
      ))}

      <div className="stack">
        <button type="button" className="ghost full" onClick={addExercise}>+ Add exercise</button>
        <div>
          <label htmlFor="logNotes">Notes</label>
          <textarea id="logNotes" placeholder="How did it feel?" value={d.notes} onChange={(e) => onChange({ ...d, notes: e.target.value })} />
        </div>
      </div>
      <button type="button" className="full save-bar" onClick={save}>Save workout</button>
      <ExerciseDatalist />
    </>
  );
}

function LastTime({ name, unit }: { name: string; unit: Unit }) {
  const id = exerciseIdFor(name);
  const last = useLiveQuery(() => (name.trim() ? lastPerformance(db, id) : null), [id]);
  return (
    <div className="last-time">
      {last && (
        <>
          Last time ({shortDate(last.date)}):{' '}
          <b>{last.sets.map((s) => `${s.reps} × ${formatWeight(s.weightKg, unit)} ${unit}`).join(', ')}</b>
        </>
      )}
    </div>
  );
}

function ExerciseDatalist() {
  const names = useExerciseNames();
  return (
    <datalist id="exerciseList">
      {names.map((n) => <option key={n} value={n} />)}
    </datalist>
  );
}
