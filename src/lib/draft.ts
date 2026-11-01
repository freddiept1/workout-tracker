// Pure helpers for the in-progress workout (the draft).
import type { Draft, DraftExercise, DraftSet, DraftV1, Exercise, SetEntry, Unit } from '../db/types';
import { exerciseIdFor, newId } from './ids';
import { cleanInput, MODES, fieldText, isFilled, modeOf, type Field } from './tracking';
import { formatWeight, parseNumber, toKg } from './units';

export function blankSet(exercise?: Exercise): DraftSet {
  return {
    id: newId(), type: 'working', weight: '', reps: '', rpe: null, effort: null, tempo: '', notes: '', side: null,
    distance: exercise?.defaultDistanceM != null ? String(exercise.defaultDistanceM) : '',
    done: false, completedAt: null
  };
}

export function newDraftExercise(exercise: Exercise, lastSets: SetEntry[] | null, unit: Unit): DraftExercise {
  return { id: newId(), exerciseId: exercise.id, supersetGroup: null, restSec: null, notes: '', sets: prefill(exercise, lastSets, unit) };
}

/**
 * Sets copied from last time: values, types, sides, tempo and effort (effort is planned, like a load).
 * RPE and notes aren't copied, since they describe how that day's set went. No history: one blank set.
 */
export function prefill(exercise: Exercise, lastSets: SetEntry[] | null, unit: Unit): DraftSet[] {
  if (!lastSets?.length) return [blankSet(exercise)];
  const fields: Field[] = ['weight', 'reps', 'distance'];
  return lastSets.map((s) => {
    const set = blankSet(exercise);
    for (const f of fields) set[f] = fieldText(s, f, unit) || set[f];
    return { ...set, type: s.type, side: s.side ?? null, tempo: s.tempo ?? '', effort: s.effortPct ?? null };
  });
}

/** Converts a Phase 0 draft (exercise names) to v2 (exercise ids). Unnamed, empty exercises are dropped. */
export function upgradeDraftV1(old: DraftV1): { draft: Draft; names: string[] } {
  const names: string[] = [];
  const exercises: DraftExercise[] = [];
  for (const ex of old.exercises) {
    const hasData = ex.sets.some((s) => s.reps.trim() || s.weight.trim());
    const name = ex.name.trim() || (hasData ? 'Unnamed exercise' : '');
    if (!name) continue;
    names.push(name);
    exercises.push({
      id: ex.id, exerciseId: exerciseIdFor(name), supersetGroup: null, restSec: null, notes: '',
      sets: ex.sets.map((s) => ({ ...blankSet(), id: s.id, type: s.type, weight: s.weight, reps: s.reps }))
    });
  }
  return {
    draft: { v: 2, unit: old.unit, date: old.date, startedAt: old.startedAt, templateId: old.templateId, notes: old.notes, exercises, rest: null },
    names
  };
}

/** Re-expresses typed weights in another unit (when the kg/lb setting changes mid-workout). */
export function convertDraftUnit(draft: Draft, unit: Unit): Draft {
  const convert = (w: string) => {
    const n = parseNumber(w);
    return n === null ? w : formatWeight(toKg(n, draft.unit), unit);
  };
  return { ...draft, unit, exercises: draft.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((s) => ({ ...s, weight: convert(s.weight) })) })) };
}

/** The stored form of a typed set. */
export function toSetEntry(s: DraftSet, exercise: Exercise | undefined, unit: Unit, completedAt: string): SetEntry {
  const mode = MODES[modeOf(exercise)];
  const uses = (f: Field) => mode.fields.includes(f);
  const n = (f: Field) => (uses(f) ? parseNumber(cleanInput(f, s[f])) : null);
  const weight = n('weight');
  return {
    id: s.id,
    type: s.type,
    weightKg: weight === null ? (modeOf(exercise) === 'strength' ? 0 : null) : toKg(weight, unit),
    reps: n('reps'),
    rpe: mode.rating === 'rpe' ? s.rpe : null,
    effortPct: mode.rating === 'effort' ? s.effort : null,
    distanceM: n('distance'),
    side: exercise?.unilateral ? s.side : null,
    tempo: s.tempo.trim() || undefined,
    notes: s.notes.trim() || undefined,
    completedAt: s.completedAt ?? completedAt
  };
}

export interface FinishPlan {
  include: (ex: DraftExercise, s: DraftSet) => boolean;
  ticked: number;
  unticked: number; // filled in but never ticked
}

/** Which sets a finished workout keeps: ticked sets, plus filled-in unticked ones if the user agrees. */
export function finishPlan(draft: Draft, exercises: Map<string, Exercise>, includeUnticked: boolean): FinishPlan {
  let ticked = 0;
  let unticked = 0;
  const filled = (ex: DraftExercise, s: DraftSet) => isFilled(s, modeOf(exercises.get(ex.exerciseId)));
  for (const ex of draft.exercises) {
    for (const s of ex.sets) {
      if (!filled(ex, s)) continue;
      if (s.done) ticked++;
      else unticked++;
    }
  }
  return { include: (ex, s) => filled(ex, s) && (s.done || includeUnticked), ticked, unticked };
}

// ---------- Supersets ----------

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** "A", "B"... in order of first appearance, for labelling superset groups. */
export function groupLetters(draft: Pick<Draft, 'exercises'>): Map<string, string> {
  const letters = new Map<string, string>();
  for (const ex of draft.exercises) {
    if (ex.supersetGroup && !letters.has(ex.supersetGroup)) letters.set(ex.supersetGroup, LETTERS[letters.size % 26]);
  }
  return letters;
}

/** Joins exercise i with the next one (merging groups). */
export function linkWithNext(draft: Draft, i: number): Draft {
  const a = draft.exercises[i];
  const b = draft.exercises[i + 1];
  if (!a || !b) return draft;
  const group = a.supersetGroup ?? b.supersetGroup ?? newId();
  const merge = new Set([a.supersetGroup, b.supersetGroup].filter(Boolean));
  return {
    ...draft,
    exercises: draft.exercises.map((ex, j) =>
      j === i || j === i + 1 || (ex.supersetGroup && merge.has(ex.supersetGroup)) ? { ...ex, supersetGroup: group } : ex
    )
  };
}

/** Takes exercise i out of its group; a group left with one exercise is dissolved. */
export function unlink(draft: Draft, i: number): Draft {
  const group = draft.exercises[i].supersetGroup;
  let exercises = draft.exercises.map((ex, j) => (j === i ? { ...ex, supersetGroup: null } : ex));
  if (group && exercises.filter((ex) => ex.supersetGroup === group).length < 2) {
    exercises = exercises.map((ex) => (ex.supersetGroup === group ? { ...ex, supersetGroup: null } : ex));
  }
  return { ...draft, exercises };
}

/**
 * After ticking set `setIndex` of exercise `i`: in a superset, move on to the next exercise in the
 * group (no rest); after the last one, or outside a superset, rest.
 */
export function afterTick(draft: Draft, i: number): { rest: boolean; nextExerciseIndex: number | null } {
  const group = draft.exercises[i].supersetGroup;
  if (!group) return { rest: true, nextExerciseIndex: null };
  const members = draft.exercises.map((ex, j) => (ex.supersetGroup === group ? j : -1)).filter((j) => j >= 0);
  const pos = members.indexOf(i);
  if (pos < members.length - 1) return { rest: false, nextExerciseIndex: members[pos + 1] };
  return { rest: true, nextExerciseIndex: members[0] };
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}
