import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../db/db';
import { finishDraft, lastPerformance, updateExercise } from '../db/repo';
import type { Draft, DraftExercise, DraftSet, Exercise, Settings, Template, Unit } from '../db/types';
import { useExerciseMap, useTemplates } from '../hooks';
import { unlockAudio } from '../lib/alerts';
import { shortDate } from '../lib/dates';
import { afterTick, blankSet, finishPlan, groupLetters, linkWithNext, move, newDraftExercise, unlink } from '../lib/draft';
import { newId, nowIso, today } from '../lib/ids';
import { cleanInput, fieldLabel, formatSet, inputMode, isFilled, MODES, modeOf, restFor, setBadge } from '../lib/tracking';
import { ExerciseMenu } from './log/ExerciseMenu';
import { ExercisePicker } from './log/ExercisePicker';
import { RestTimer } from './log/RestTimer';
import { RatingSheet, SetSheet } from './log/SetSheets';
import { TempoSheet } from './log/TempoSheet';

interface Props {
  draft: Draft | null;
  settings: Settings;
  onChange: (draft: Draft | null) => void;
  onSaved: () => void;
}

type SetRef = { ex: number; set: string };

export function LogView({ draft, settings, onChange, onSaved }: Props) {
  const templates = useTemplates();
  const exercises = useExerciseMap();
  const unit = settings.unit;
  const plates = settings.equipment[unit];
  const [picker, setPicker] = useState(false);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [setSheet, setSetSheet] = useState<SetRef | null>(null);
  const [ratingFor, setRatingFor] = useState<SetRef | null>(null);
  const [tempoFor, setTempoFor] = useState<number | null>(null);
  const [swapFor, setSwapFor] = useState<number | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  async function entryFor(ex: Exercise, u: Unit): Promise<DraftExercise> {
    return newDraftExercise(ex, (await lastPerformance(db, ex.id))?.sets ?? null, u);
  }

  async function start(template: Template | null) {
    const list = template ? template.exercises.map((e) => exercises.get(e.exerciseId)).filter((e): e is Exercise => !!e) : [];
    onChange({
      v: 2, unit, date: today(), startedAt: nowIso(), templateId: template?.id ?? null, notes: '', rest: null,
      exercises: await Promise.all(list.map((e) => entryFor(e, unit)))
    });
    if (!template) setPicker(true);
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
        <button type="button" className="ghost full" onClick={() => start(null)}>Start an empty workout</button>
      </>
    );
  }

  const d = draft;
  const letters = groupLetters(d);
  const setEntry = (i: number, entry: DraftExercise) => onChange({ ...d, exercises: d.exercises.map((e, j) => (j === i ? entry : e)) });
  const patchSet = (ref: SetRef, patch: Partial<DraftSet>) => {
    const entry = d.exercises[ref.ex];
    setEntry(ref.ex, { ...entry, sets: entry.sets.map((s) => (s.id === ref.set ? { ...s, ...patch } : s)) });
  };
  const findSet = (ref: SetRef | null) => (ref ? d.exercises[ref.ex]?.sets.find((s) => s.id === ref.set) ?? null : null);

  async function addExercise(ex: Exercise) {
    onChange({ ...d, exercises: [...d.exercises, await entryFor(ex, d.unit)] });
    setTimeout(() => [...document.querySelectorAll('.exercise-card')].pop()?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  /**
   * Swap an exercise for a variation. Ticked sets are kept; if none are ticked yet, the sets are
   * pre-filled from the new exercise's last session instead.
   */
  async function swap(i: number, ex: Exercise) {
    const entry = d.exercises[i];
    const untouched = entry.sets.every((s) => !s.done);
    const fresh = await entryFor(ex, d.unit);
    setEntry(i, {
      ...entry,
      exerciseId: ex.id,
      tempo: untouched ? fresh.tempo : entry.tempo, // ticked sets were done at the current tempo
      restSec: null,
      sets: untouched ? fresh.sets : entry.sets
    });
  }

  function addSet(i: number) {
    // Copy the previous set (values, type, effort) so repeating it is one tap.
    const entry = d.exercises[i];
    const last = entry.sets[entry.sets.length - 1];
    const set: DraftSet = last
      ? { ...last, id: newId(), done: false, completedAt: null, rpe: null, notes: '', type: last.type === 'warmup' ? 'working' : last.type }
      : blankSet(exercises.get(entry.exerciseId));
    setJustAdded(set.id);
    setEntry(i, { ...entry, sets: [...entry.sets, set] });
  }

  function tick(i: number, s: DraftSet) {
    const entry = d.exercises[i];
    const exercise = exercises.get(entry.exerciseId);
    if (!s.done && !isFilled(s, modeOf(exercise))) {
      // Jump to the first empty field instead of ticking an empty set.
      document.querySelector<HTMLInputElement>(`[data-set="${s.id}"] input:placeholder-shown`)?.focus();
      return;
    }
    unlockAudio();
    const done = !s.done;
    let next: Draft = {
      ...d,
      exercises: d.exercises.map((e, j) =>
        j === i ? { ...e, sets: e.sets.map((x) => (x.id === s.id ? { ...x, done, completedAt: done ? nowIso() : null } : x)) } : e
      )
    };
    if (done) {
      const { rest, nextExerciseIndex } = afterTick(next, i);
      if (rest) {
        const sec = restFor(exercise, entry.restSec);
        if (sec > 0) next = { ...next, rest: { endsAt: new Date(Date.now() + sec * 1000).toISOString(), durationSec: sec, draftExerciseId: entry.id } };
      } else if (nextExerciseIndex !== null) {
        // Superset: straight on to the next exercise.
        setTimeout(() => document.getElementById('ex-' + d.exercises[nextExerciseIndex].id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
    }
    onChange(next);
  }

  async function finish() {
    if (!d.date) return alert('Pick a date for this workout.');
    const plan = finishPlan(d, exercises, true);
    if (!plan.ticked && !plan.unticked) return alert('Nothing to save yet: fill in and tick at least one set.');
    let includeUnticked = true;
    if (plan.ticked && plan.unticked) {
      includeUnticked = confirm(`${plan.unticked} set${plan.unticked === 1 ? ' is' : 's are'} filled in but not ticked. Save ${plan.unticked === 1 ? 'it' : 'them'} too?`);
    }
    const saved = await finishDraft(db, d, includeUnticked);
    if (!saved) return alert('Nothing to save yet: fill in and tick at least one set.');
    onChange(null);
    onSaved();
  }

  // Name of what's next after the rest (for the timer and notification).
  const restEntry = d.rest ? d.exercises.findIndex((e) => e.id === d.rest!.draftExerciseId) : -1;
  const nextName = restEntry >= 0 ? exercises.get(d.exercises[afterTick(d, restEntry).nextExerciseIndex ?? restEntry].exerciseId)?.name ?? '' : '';

  const menuEntry = menuFor !== null ? d.exercises[menuFor] : null;
  const sheetSet = findSet(setSheet);
  const sheetExercise = setSheet ? exercises.get(d.exercises[setSheet.ex]?.exerciseId) : undefined;
  const ratingSet = findSet(ratingFor);
  const ratingExercise = ratingFor ? exercises.get(d.exercises[ratingFor.ex]?.exerciseId) : undefined;

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

      {d.exercises.map((entry, i) => {
        const exercise = exercises.get(entry.exerciseId);
        const mode = modeOf(exercise);
        const info = MODES[mode];
        const letter = entry.supersetGroup ? letters.get(entry.supersetGroup) : null;
        const cols = `30px ${exercise?.unilateral ? '40px ' : ''}${info.fields.map(() => 'minmax(0,1fr)').join(' ')} 52px 44px`;
        return (
          <div className={'card exercise-card' + (letter ? ' superset' : '')} id={'ex-' + entry.id} key={entry.id}>
            {letter && <div className="superset-label">Superset {letter}</div>}
            <div className="exercise-title">
              <div className="grow">
                <div className="card-title">{exercise?.name ?? entry.exerciseId}</div>
                {mode !== 'strength' && <span className="tag">{info.label}</span>}
              </div>
              <button type="button" className="ghost icon" aria-label="Exercise options" onClick={() => setMenuFor(i)}>⋯</button>
            </div>
            <LastTime exerciseId={entry.exerciseId} exercise={exercise} unit={d.unit} />
            {info.rating === 'rpe' && (
              <button type="button" className={'tempo-chip' + (entry.tempo ? ' on' : '')} onClick={() => setTempoFor(i)}>
                {entry.tempo ? <>Tempo <b>{entry.tempo}</b></> : '+ Tempo'}
              </button>
            )}
            {entry.notes && <p className="exercise-note">{entry.notes}</p>}

            <div className="set-grid set-labels" style={{ gridTemplateColumns: cols }}>
              <span>Set</span>
              {exercise?.unilateral && <span>Side</span>}
              {info.fields.map((f) => <span key={f}>{fieldLabel(f, mode, d.unit)}</span>)}
              <span>{info.rating === 'rpe' ? 'RPE' : 'Effort'}</span>
              <span />
            </div>
            {entry.sets.map((s, j) => (
              <div
                key={s.id} data-set={s.id} style={{ gridTemplateColumns: cols }}
                className={'set-grid' + (s.done ? ' done' : '') + (justAdded === s.id ? ' new' : '')}
              >
                <button type="button" className={'set-badge type-' + s.type} aria-label="Set options" onClick={() => setSetSheet({ ex: i, set: s.id })}>
                  {setBadge(entry.sets, j)}
                </button>
                {exercise?.unilateral && (
                  <button
                    type="button" className={'side-btn' + (s.side ? ' on' : '')}
                    onClick={() => patchSet({ ex: i, set: s.id }, { side: s.side === 'L' ? 'R' : s.side === 'R' ? null : 'L' })}
                  >{s.side ?? '–'}</button>
                )}
                {info.fields.map((f) => (
                  <input
                    key={f} type="text" inputMode={inputMode(f)} placeholder="0" value={s[f]} aria-label={fieldLabel(f, mode, d.unit)}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => patchSet({ ex: i, set: s.id }, { [f]: cleanInput(f, e.target.value) })}
                  />
                ))}
                <button type="button" className={'rating-cell' + ((info.rating === 'rpe' ? s.rpe : s.effort) != null ? ' on' : '')} onClick={() => setRatingFor({ ex: i, set: s.id })}>
                  {info.rating === 'rpe' ? s.rpe ?? '–' : s.effort != null ? `${s.effort}%` : '–'}
                </button>
                <button type="button" className={'tick' + (s.done ? ' on' : '')} aria-label={s.done ? 'Untick set' : 'Tick set'} onClick={() => tick(i, s)}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </button>
              </div>
            ))}
            <button type="button" className="ghost small" onClick={() => addSet(i)}>+ Add set</button>
          </div>
        );
      })}

      <div className="stack">
        <button type="button" className="ghost full" onClick={() => setPicker(true)}>+ Add exercise</button>
        <div>
          <label htmlFor="logNotes">Session notes</label>
          <textarea id="logNotes" placeholder="How did it feel?" value={d.notes} onChange={(e) => onChange({ ...d, notes: e.target.value })} />
        </div>
      </div>
      <button type="button" className="full finish-bottom" onClick={finish}>Finish workout</button>
      <HeaderButton onClick={finish}>Finish</HeaderButton>

      <RestTimer rest={d.rest} sound={settings.restSound} nextName={nextName} onChange={(rest) => onChange({ ...d, rest })} />

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={addExercise} />

      <ExercisePicker
        open={swapFor !== null}
        familyOfId={swapFor !== null ? d.exercises[swapFor]?.exerciseId : null}
        onClose={() => setSwapFor(null)}
        onPick={(ex) => swapFor !== null && swap(swapFor, ex)}
      />

      <TempoSheet
        open={tempoFor !== null && !!d.exercises[tempoFor]}
        exerciseName={tempoFor !== null ? exercises.get(d.exercises[tempoFor]?.exerciseId)?.name ?? '' : ''}
        value={tempoFor !== null ? d.exercises[tempoFor]?.tempo ?? '' : ''}
        defaultTempo={tempoFor !== null ? exercises.get(d.exercises[tempoFor]?.exerciseId)?.defaultTempo ?? '' : ''}
        onClose={() => setTempoFor(null)}
        onSave={(tempo, makeDefault) => {
          const entry = d.exercises[tempoFor!];
          setEntry(tempoFor!, { ...entry, tempo });
          if (makeDefault) void updateExercise(db, entry.exerciseId, { defaultTempo: tempo || null });
        }}
      />

      <ExerciseMenu
        open={menuFor !== null}
        entry={menuEntry}
        exercise={menuEntry ? exercises.get(menuEntry.exerciseId) : undefined}
        index={menuFor ?? 0}
        count={d.exercises.length}
        unit={d.unit}
        plates={plates}
        onClose={() => setMenuFor(null)}
        onRest={(sec) => {
          setEntry(menuFor!, { ...menuEntry!, restSec: sec });
          void updateExercise(db, menuEntry!.exerciseId, { restSec: sec });
        }}
        onNotes={(notes) => setEntry(menuFor!, { ...menuEntry!, notes })}
        onWarmups={(steps) => {
          const warmups: DraftSet[] = steps.map((w) => ({ ...blankSet(), type: 'warmup', weight: String(w.weight), reps: String(w.reps) }));
          setEntry(menuFor!, { ...menuEntry!, sets: [...warmups, ...menuEntry!.sets.filter((s) => s.type !== 'warmup')] });
        }}
        onSwap={() => setSwapFor(menuFor)}
        onLinkNext={() => onChange(linkWithNext(d, menuFor!))}
        onUnlink={() => onChange(unlink(d, menuFor!))}
        onMove={(dir) => {
          onChange({ ...d, exercises: move(d.exercises, menuFor!, menuFor! + dir) });
          setMenuFor(menuFor! + dir);
        }}
        onRemove={() => onChange({ ...d, exercises: d.exercises.filter((_, j) => j !== menuFor) })}
      />

      <SetSheet
        open={setSheet !== null}
        set={sheetSet}
        mode={modeOf(sheetExercise)}
        unilateral={!!sheetExercise?.unilateral}
        unit={d.unit}
        plates={plates}
        onChange={(patch) => setSheet && patchSet(setSheet, patch)}
        onDelete={() => {
          if (!setSheet) return;
          const entry = d.exercises[setSheet.ex];
          setEntry(setSheet.ex, { ...entry, sets: entry.sets.filter((s) => s.id !== setSheet.set) });
        }}
        onClose={() => setSetSheet(null)}
      />

      <RatingSheet
        open={ratingFor !== null && !!ratingSet}
        mode={modeOf(ratingExercise)}
        value={ratingSet ? (MODES[modeOf(ratingExercise)].rating === 'rpe' ? ratingSet.rpe : ratingSet.effort) : null}
        onPick={(v) => ratingFor && patchSet(ratingFor, MODES[modeOf(ratingExercise)].rating === 'rpe' ? { rpe: v } : { effort: v })}
        onClose={() => setRatingFor(null)}
      />
    </>
  );
}

/** A button in the top bar, next to the settings gear, so it's always in reach without covering sets. */
function HeaderButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById('header-slot')), []);
  return slot ? createPortal(<button type="button" className="small" onClick={onClick}>{children}</button>, slot) : null;
}

/** "Last · 24 Oct: 140 kg × 5 @ 8, 140 kg × 5 @ 8.5" (warm-ups left out). */
function LastTime({ exerciseId, exercise, unit }: { exerciseId: string; exercise: Exercise | undefined; unit: Unit }) {
  const last = useLiveQuery(() => lastPerformance(db, exerciseId), [exerciseId]);
  const sets = last?.sets.filter((s) => s.type !== 'warmup') ?? [];
  if (!last || !sets.length) return <div className="last-time">First time logging this</div>;
  return (
    <div className="last-time">
      Last · {shortDate(last.date)}: <b>{sets.map((s) => formatSet(s, modeOf(exercise), unit)).join(', ')}</b>
    </div>
  );
}
