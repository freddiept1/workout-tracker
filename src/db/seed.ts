// Built-in athletic exercises, added to every install (existing or new) on startup if missing.
// The full exercise library comes in Phase 2.
import { exerciseIdFor, nowIso } from '../lib/ids';
import type { TrackerDB } from './db';
import type { Exercise, TrackingMode } from './types';

interface Seed {
  name: string;
  tracking: TrackingMode;
  unilateral?: boolean;
  defaultDistanceM?: number;
}

export const ATHLETIC_SEED: Seed[] = [
  // Sprints: distance × reps @ effort
  { name: '10 m Sprint', tracking: 'sprint', defaultDistanceM: 10 },
  { name: '20 m Sprint', tracking: 'sprint', defaultDistanceM: 20 },
  { name: '30 m Sprint', tracking: 'sprint', defaultDistanceM: 30 },
  { name: '40 m Sprint', tracking: 'sprint', defaultDistanceM: 40 },
  { name: 'Flying 10 m Sprint', tracking: 'sprint', defaultDistanceM: 10 },
  { name: 'Flying 20 m Sprint', tracking: 'sprint', defaultDistanceM: 20 },
  { name: 'Acceleration Sprint', tracking: 'sprint' },
  { name: 'Hill Sprint', tracking: 'sprint' },
  { name: '5-0-5 Agility', tracking: 'sprint', unilateral: true, defaultDistanceM: 10 },
  { name: 'Pro Agility (5-10-5)', tracking: 'sprint', defaultDistanceM: 20 },
  // Jumps: reps @ effort
  { name: 'Countermovement Jump', tracking: 'jump' },
  { name: 'Squat Jump', tracking: 'jump' },
  { name: 'Box Jump', tracking: 'jump' },
  { name: 'Depth Jump', tracking: 'jump' },
  { name: 'Broad Jump', tracking: 'jump' },
  { name: 'Triple Broad Jump', tracking: 'jump' },
  { name: 'Tuck Jump', tracking: 'jump' },
  { name: 'Hurdle Jump', tracking: 'jump' },
  { name: 'Single-Leg Box Jump', tracking: 'jump', unilateral: true },
  // Hops and bounds: reps @ effort, per leg
  { name: 'Single-Leg Hop', tracking: 'jump', unilateral: true },
  { name: 'Triple Hop', tracking: 'jump', unilateral: true },
  { name: 'Lateral Hop', tracking: 'jump', unilateral: true },
  { name: 'Crossover Hop', tracking: 'jump', unilateral: true },
  { name: 'Single-Leg Hurdle Hop', tracking: 'jump', unilateral: true },
  { name: 'Pogo Hops', tracking: 'jump' },
  { name: 'Bounds', tracking: 'jump' },
  { name: 'Lateral Bounds', tracking: 'jump' },
  // Throws: ball weight × reps @ effort
  { name: 'Medicine Ball Chest Pass', tracking: 'throw' },
  { name: 'Overhead Medicine Ball Throw', tracking: 'throw' },
  { name: 'Rotational Medicine Ball Throw', tracking: 'throw', unilateral: true },
  { name: 'Medicine Ball Scoop Toss', tracking: 'throw' },
  { name: 'Medicine Ball Slam', tracking: 'throw' },
  // Carries and sleds: load × distance @ effort
  { name: "Farmer's Carry", tracking: 'carry' },
  { name: 'Sled Push', tracking: 'carry' },
  { name: 'Sled Drag', tracking: 'carry' },
  { name: 'Resisted Sled Sprint', tracking: 'carry' }
];

/** Adds any built-in exercise that doesn't exist yet. Never changes or revives existing ones. */
export async function ensureSeedExercises(db: TrackerDB): Promise<number> {
  const now = nowIso();
  const wanted = ATHLETIC_SEED.map((s) => ({ ...s, id: exerciseIdFor(s.name) }));
  // One transaction, so two launches at once can't both add the same exercise.
  return db.transaction('rw', db.exercises, async () => {
    const existing = new Set((await db.exercises.bulkGet(wanted.map((s) => s.id))).filter(Boolean).map((e) => e!.id));
    const missing: Exercise[] = wanted
      .filter((s) => !existing.has(s.id))
      .map(({ id, name, tracking, unilateral, defaultDistanceM }) => ({
        id, name, tracking, unilateral: unilateral ?? false, defaultDistanceM: defaultDistanceM ?? null,
        isCustom: false, createdAt: now, updatedAt: now, deletedAt: null
      }));
    if (missing.length) await db.exercises.bulkPut(missing);
    return missing.length;
  });
}
