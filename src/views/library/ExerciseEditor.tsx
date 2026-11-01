import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { db } from '../../db/db';
import { hideExercise, listExercises, mergeExercise, saveExercise, toggleFavourite, type ExerciseInput } from '../../db/repo';
import type { Exercise, MuscleShare } from '../../db/types';
import { EQUIPMENT, MUSCLES, PATTERNS } from '../../lib/muscles';
import { MODE_ORDER, MODES } from '../../lib/tracking';
import { parseNumber } from '../../lib/units';

interface Props {
  open: boolean;
  exercise: Exercise | null; // null = new exercise
  usage: number; // workouts it appears in
  onClose: () => void;
  onMerged: () => void;
}

const empty: ExerciseInput = {
  name: '', tracking: 'strength', unilateral: false, parentId: null, muscles: [], pattern: null, equipment: null,
  mechanic: 'compound', restSec: null, defaultTempo: null, defaultDistanceM: null
};

function toInput(e: Exercise): ExerciseInput {
  return {
    id: e.id, name: e.name, tracking: e.tracking ?? 'strength', unilateral: !!e.unilateral, parentId: e.parentId ?? null,
    muscles: e.muscles ?? [], pattern: e.pattern ?? null, equipment: e.equipment ?? null, mechanic: e.mechanic ?? null,
    restSec: e.restSec ?? null, defaultTempo: e.defaultTempo ?? null, defaultDistanceM: e.defaultDistanceM ?? null
  };
}

export function ExerciseEditor({ open, exercise, usage, onClose, onMerged }: Props) {
  const all = useLiveQuery(() => listExercises(db), []) ?? [];
  const [form, setForm] = useState<ExerciseInput>(empty);
  const [restText, setRestText] = useState('');
  const [distText, setDistText] = useState('');
  const [mergeInto, setMergeInto] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const f = exercise ? toInput(exercise) : empty;
    setForm(f);
    setRestText(f.restSec == null ? '' : String(f.restSec));
    setDistText(f.defaultDistanceM == null ? '' : String(f.defaultDistanceM));
    setMergeInto('');
    setError('');
  }, [open, exercise?.id]);

  const others = useMemo(() => all.filter((e) => e.id !== exercise?.id).sort((a, b) => a.name.localeCompare(b.name)), [all, exercise?.id]);
  const total = (form.muscles ?? []).reduce((n, m) => n + m.pct, 0);
  const mode = MODES[form.tracking];
  const set = (patch: Partial<ExerciseInput>) => setForm({ ...form, ...patch });
  const setMuscle = (i: number, patch: Partial<MuscleShare>) =>
    set({ muscles: (form.muscles ?? []).map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  async function save() {
    try {
      await saveExercise(db, { ...form, restSec: parseNumber(restText), defaultDistanceM: parseNumber(distText) });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function merge() {
    const into = all.find((e) => e.id === mergeInto);
    if (!exercise || !into) return;
    if (!confirm(`Move all of “${exercise.name}” (${usage} workout${usage === 1 ? '' : 's'}) into “${into.name}”, and remove “${exercise.name}”? This can't be undone.`)) return;
    await mergeExercise(db, exercise.id, into.id);
    onMerged();
    onClose();
  }

  async function hide() {
    if (!exercise) return;
    if (!confirm(`Remove “${exercise.name}” from your lists? Its history is kept, and you can bring it back from “Removed exercises”.`)) return;
    await hideExercise(db, exercise.id);
    onClose();
  }

  return (
    <Sheet open={open} title={exercise ? 'Edit exercise' : 'New exercise'} onClose={onClose}>
      <div className="stack">
        <div className="row">
          <div className="grow">
            <label htmlFor="exName">Name</label>
            <input id="exName" autoCapitalize="words" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          {exercise && (
            <button type="button" className={'ghost star-btn' + (exercise.favourite ? ' on' : '')} aria-label="Favourite" onClick={() => toggleFavourite(db, exercise.id)}>
              {exercise.favourite ? '★' : '☆'}
            </button>
          )}
        </div>

        <div>
          <label>How it's logged</label>
          <div className="chips">
            {MODE_ORDER.map((m) => (
              <button type="button" key={m} className={'chip-btn' + (form.tracking === m ? ' on' : '')} onClick={() => set({ tracking: m })}>{MODES[m].label}</button>
            ))}
          </div>
          <p className="hint">
            {mode.hint}.
            {exercise && usage > 0 && form.tracking !== (exercise.tracking ?? 'strength') && ' Past sets keep their numbers, but may show differently.'}
          </p>
          <label className="toggle">
            <input type="checkbox" checked={form.unilateral} onChange={(e) => set({ unilateral: e.target.checked })} />
            Single-leg / single-arm (log left and right)
          </label>
        </div>

        <div>
          <label htmlFor="exParent">Variation of</label>
          <select id="exParent" value={form.parentId ?? ''} onChange={(e) => set({ parentId: e.target.value || null })}>
            <option value="">— None (a main lift) —</option>
            {others.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <p className="hint">e.g. Paused Squat is a variation of Squat. Variations are grouped under their lift.</p>
        </div>

        <div className="row">
          <div className="grow">
            <label htmlFor="exPattern">Movement</label>
            <select id="exPattern" value={form.pattern ?? ''} onChange={(e) => set({ pattern: e.target.value || null })}>
              <option value="">—</option>
              {Object.entries(PATTERNS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div className="grow">
            <label htmlFor="exEquipment">Equipment</label>
            <select id="exEquipment" value={form.equipment ?? ''} onChange={(e) => set({ equipment: e.target.value || null })}>
              <option value="">—</option>
              {Object.entries(EQUIPMENT).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
        </div>

        <div className="segmented">
          {(['compound', 'isolation'] as const).map((m) => (
            <button type="button" key={m} className={form.mechanic === m ? 'on' : ''} onClick={() => set({ mechanic: m })}>
              {m === 'compound' ? 'Compound' : 'Isolation'}
            </button>
          ))}
        </div>

        <div>
          <label>Muscles worked (% of the effort)</label>
          {(form.muscles ?? []).map((m, i) => (
            <div className="muscle-row" key={i}>
              <select aria-label="Muscle" value={m.muscle} onChange={(e) => setMuscle(i, { muscle: e.target.value })}>
                {Object.entries(MUSCLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <input
                aria-label="Percent" inputMode="numeric" value={m.pct || ''} placeholder="%"
                onChange={(e) => setMuscle(i, { pct: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              />
              <button type="button" className="ghost icon" aria-label="Remove muscle" onClick={() => set({ muscles: (form.muscles ?? []).filter((_, j) => j !== i) })}>✕</button>
            </div>
          ))}
          <div className="row">
            <button
              type="button" className="ghost small"
              onClick={() => set({ muscles: [...(form.muscles ?? []), { muscle: Object.keys(MUSCLES).find((k) => !(form.muscles ?? []).some((m) => m.muscle === k)) ?? 'chest', pct: Math.max(0, 100 - total) }] })}
            >+ Add muscle</button>
            {(form.muscles ?? []).length > 0 && <span className={'hint' + (total !== 100 ? ' warn' : '')}>Total {total}%{total !== 100 ? ' (aim for 100)' : ''}</span>}
          </div>
          <p className="hint">Used for weekly sets per muscle and muscle levels in later updates.</p>
        </div>

        <div className="row">
          <div className="grow">
            <label htmlFor="exRest">Rest (seconds)</label>
            <input id="exRest" inputMode="numeric" placeholder={String(mode.restSec)} value={restText} onChange={(e) => setRestText(e.target.value.replace(/\D/g, ''))} />
          </div>
          {mode.rating === 'rpe' && (
            <div className="grow">
              <label htmlFor="exTempo">Default tempo</label>
              <input id="exTempo" placeholder="e.g. 3-1-X-0" value={form.defaultTempo ?? ''} onChange={(e) => set({ defaultTempo: e.target.value })} />
            </div>
          )}
          {mode.fields.includes('distance') && (
            <div className="grow">
              <label htmlFor="exDist">Default distance (m)</label>
              <input id="exDist" inputMode="decimal" value={distText} onChange={(e) => setDistText(e.target.value)} />
            </div>
          )}
        </div>

        {error && <p className="error">{error}</p>}
        <button type="button" className="full" onClick={save}>{exercise ? 'Save changes' : 'Add exercise'}</button>

        {exercise && (
          <>
            <p className="hint">{usage ? `Logged in ${usage} workout${usage === 1 ? '' : 's'}.` : 'Not logged yet.'}</p>
            <div>
              <label htmlFor="exMerge">Merge into another exercise</label>
              <div className="row">
                <select id="exMerge" className="grow" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
                  <option value="">Choose…</option>
                  {others.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <button type="button" className="ghost" disabled={!mergeInto} onClick={merge}>Merge</button>
              </div>
              <p className="hint">For duplicates, e.g. “Bench” you typed before the library had “Bench Press”. All its history moves across.</p>
            </div>
            <button type="button" className="danger full" onClick={hide}>Remove from my exercises</button>
          </>
        )}
      </div>
    </Sheet>
  );
}
