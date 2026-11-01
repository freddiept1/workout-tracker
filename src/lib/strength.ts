// Estimated one-rep max and which sets count as lifting work. All weights in kg.
import type { Exercise, SetEntry } from '../db/types';
import { modeOf } from './tracking';
import { round } from './units';

/** Sets beyond this many reps are too unreliable for a 1RM estimate. */
export const MAX_E1RM_REPS = 12;

/**
 * RTS-style RPE chart as one sequence: each extra rep, or each half-RPE below 10, moves one step down.
 * Index = (reps - 1) * 2 + (10 - RPE) * 2, so 1 rep @ 10 = 100%, 5 @ 8 = 81.1%, 12 @ 6.5 = 58.6%.
 */
const RPE_CHART = [
  100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2,
  75.1, 73.9, 72.3, 70.7, 69.4, 68.0, 66.7, 65.3, 64.0, 62.6, 61.3, 59.9, 58.6, 57.3
];

/** % of 1RM for a set of `reps` at `rpe` (6–10), or null outside the chart. */
export function rpePercent(reps: number, rpe: number): number | null {
  if (reps < 1 || reps > MAX_E1RM_REPS || rpe < 6 || rpe > 10) return null;
  const i = Math.round((reps - 1) * 2 + (10 - rpe) * 2);
  return RPE_CHART[i] ?? null;
}

/** Epley: weight × (1 + reps / 30). A single is its own 1RM. */
export function epley(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}

export interface E1RM {
  value: number; // kg
  method: 'rpe' | 'epley';
}

/** Best estimate for one set: from the RPE chart when RPE was logged, otherwise Epley. */
export function estimate1RM(weight: number, reps: number, rpe: number | null | undefined): E1RM | null {
  if (!(weight > 0) || !(reps >= 1) || reps > MAX_E1RM_REPS) return null;
  const pct = rpe != null ? rpePercent(reps, rpe) : null;
  if (pct) return { value: round((weight * 100) / pct, 2), method: 'rpe' };
  return { value: round(epley(weight, reps), 2), method: 'epley' };
}

/** A working set of a weighted lift: not a warm-up, with weight and reps. Athletic work never counts. */
export function isLiftSet(set: SetEntry, exercise: Pick<Exercise, 'tracking'> | undefined): boolean {
  return modeOf(exercise) === 'strength' && set.type !== 'warmup' && (set.weightKg ?? 0) > 0 && (set.reps ?? 0) > 0;
}

export const setE1RM = (s: SetEntry) => estimate1RM(s.weightKg ?? 0, s.reps ?? 0, s.rpe);

/** Weight × reps for lifting sets (tonnage). */
export const tonnageOf = (s: SetEntry) => (s.weightKg ?? 0) * (s.reps ?? 0);
