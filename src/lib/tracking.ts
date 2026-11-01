// What each tracking mode records, and how to read, store and show those values.
import type { DraftSet, Exercise, SetEntry, TrackingMode, Unit } from '../db/types';
import { formatWeight, parseNumber, round } from './units';

export type Field = 'weight' | 'reps' | 'distance';

export interface ModeInfo {
  label: string;
  hint: string;
  fields: Field[];
  /** Fields that must all be filled for a set to count. */
  required: Field[];
  /** How hard the set was: RPE for lifting, % of max effort for athletic work; warm-up drills have none. */
  rating: 'rpe' | 'effort' | 'none';
  restSec: number;
}

export const MODES: Record<TrackingMode, ModeInfo> = {
  strength: { label: 'Strength', hint: 'weight × reps @ RPE', fields: ['weight', 'reps'], required: ['reps'], rating: 'rpe', restSec: 150 },
  reps: { label: 'Bodyweight', hint: 'reps @ RPE', fields: ['reps'], required: ['reps'], rating: 'rpe', restSec: 90 },
  sprint: { label: 'Sprint', hint: 'distance × reps @ effort', fields: ['distance', 'reps'], required: ['distance', 'reps'], rating: 'effort', restSec: 120 },
  jump: { label: 'Jump / hop', hint: 'reps @ effort', fields: ['reps'], required: ['reps'], rating: 'effort', restSec: 90 },
  throw: { label: 'Throw', hint: 'ball kg × reps @ effort', fields: ['weight', 'reps'], required: ['reps'], rating: 'effort', restSec: 60 },
  carry: { label: 'Carry / sled', hint: 'load × distance @ effort', fields: ['weight', 'distance'], required: ['distance'], rating: 'effort', restSec: 120 },
  drill: { label: 'Warm-up drill', hint: 'ticked off, not tracked', fields: [], required: [], rating: 'none', restSec: 0 }
};

export const MODE_ORDER: TrackingMode[] = ['strength', 'reps', 'sprint', 'jump', 'throw', 'carry', 'drill'];

export const isDrill = (ex: Pick<Exercise, 'tracking'> | undefined) => modeOf(ex) === 'drill';

/** Unknown or missing modes (including types removed during Phase 1 development) count as strength. */
export const modeOf = (ex: Pick<Exercise, 'tracking'> | undefined): TrackingMode =>
  ex?.tracking && ex.tracking in MODES ? ex.tracking : 'strength';

export const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
export const EFFORT_VALUES = [60, 70, 80, 90, 95, 100];

export function restFor(ex: Exercise | undefined, override: number | null = null): number {
  return override ?? ex?.restSec ?? MODES[modeOf(ex)].restSec;
}

// ---------- Typing ----------

/** Strip characters a field can't contain (iPhone number pads can still paste junk). */
export function cleanInput(field: Field, v: string): string {
  if (field === 'reps') return v.replace(/\D/g, '');
  return v.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
}

export function fieldLabel(field: Field, mode: TrackingMode, unit: Unit): string {
  if (field === 'weight') return mode === 'throw' ? `Ball (${unit})` : mode === 'carry' ? `Load (${unit})` : `Weight (${unit})`;
  if (field === 'distance') return 'Distance (m)';
  return mode === 'jump' ? 'Jumps' : mode === 'throw' ? 'Throws' : 'Reps';
}

export const inputMode = (f: Field) => (f === 'reps' ? 'numeric' : 'decimal');

/** The typed text for one field of a stored set (used to pre-fill from last time). */
export function fieldText(set: SetEntry, field: Field, unit: Unit): string {
  switch (field) {
    case 'weight': return set.weightKg ? formatWeight(set.weightKg, unit) : '';
    case 'reps': return set.reps == null ? '' : String(set.reps);
    case 'distance': return set.distanceM == null ? '' : String(round(set.distanceM, 2));
  }
}

export function hasValue(set: DraftSet, field: Field): boolean {
  const n = parseNumber(set[field]);
  return n !== null && n > 0;
}

/** A set counts once all of its mode's required fields are filled. */
export function isFilled(set: DraftSet, mode: TrackingMode): boolean {
  return MODES[mode].required.every((f) => hasValue(set, f));
}

// ---------- Showing ----------

/** One-line summary of a stored set, e.g. "140 kg × 5 @ 8", "20 m × 4 @ 95%", "5 jumps (L) @ 100%". */
export function formatSet(set: SetEntry, mode: TrackingMode, unit: Unit): string {
  const w = set.weightKg ? `${formatWeight(set.weightKg, unit)} ${unit}` : '';
  const reps = set.reps ?? 0;
  const dist = set.distanceM != null ? `${round(set.distanceM, 2)} m` : '';
  let text: string;
  switch (mode) {
    case 'strength': text = `${w || `0 ${unit}`} × ${reps}`; break;
    case 'reps': text = `${reps} reps`; break;
    case 'sprint': text = `${dist} × ${reps}`; break;
    case 'jump': text = `${reps} ${reps === 1 ? 'jump' : 'jumps'}`; break;
    case 'throw': text = w ? `${w} × ${reps}` : `${reps} throws`; break;
    case 'carry': text = [w, dist].filter(Boolean).join(' × '); break;
    case 'drill': text = set.notes || '✓'; break;
  }
  if (set.side) text += ` (${set.side})`;
  if (set.rpe != null) text += ` @ ${set.rpe}`;
  if (set.effortPct != null) text += ` @ ${set.effortPct}%`;
  return text;
}

export const SET_TYPE_LABEL: Record<SetEntry['type'], string> = {
  warmup: 'Warm-up', working: 'Working', top: 'Top set', backoff: 'Back-off', amrap: 'AMRAP', drop: 'Drop set', failure: 'To failure'
};

/** Badge text: working sets are numbered (warm-ups don't count), other types get a letter. */
export function setBadge(sets: Pick<SetEntry, 'type'>[], index: number): string {
  const t = sets[index].type;
  if (t === 'warmup') return 'W';
  if (t === 'working') return String(sets.slice(0, index + 1).filter((s) => s.type !== 'warmup').length);
  return { top: 'T', backoff: 'B', amrap: 'A', drop: 'D', failure: 'F' }[t];
}
