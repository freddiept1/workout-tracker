// Plateau detection: a lift whose estimated 1RM hasn't improved for 3+ weeks of training.
import type { Exercise, Session } from '../db/types';
import { familyOf } from './exerciseList';
import { isLiftSet, setE1RM } from './strength';
import { addDays, weekStart } from './weekly';

export interface Plateau {
  exerciseId: string;
  weeks: number; // full weeks since the best e1RM
  sessionsSince: number;
  bestKg: number;
  bestDate: string;
  avgRpe: number | null;
  suggestions: string[];
}

/** Look back this far for the best e1RM; older bests don't count as a current plateau. */
const WINDOW_WEEKS = 12;

/**
 * A lift has plateaued if its best e1RM in the last 12 weeks was 3+ weeks ago, and it has been
 * trained at least 3 times since (so a lift you've stopped doing isn't flagged).
 */
export function findPlateau(sessions: Session[], exerciseId: string, exercises: Map<string, Exercise>, today: string): Plateau | null {
  const exercise = exercises.get(exerciseId);
  const since = addDays(today, -7 * WINDOW_WEEKS);
  const entries: { date: string; e1rm: number; rpes: number[]; reps: number[] }[] = [];
  for (const s of sessions) {
    if (s.date < since || s.date > today) continue;
    const sets = s.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets).filter((x) => isLiftSet(x, exercise));
    if (!sets.length) continue;
    entries.push({
      date: s.date,
      e1rm: Math.max(0, ...sets.map((x) => setE1RM(x)?.value ?? 0)),
      rpes: sets.map((x) => x.rpe).filter((r): r is number => r != null),
      reps: sets.map((x) => x.reps!)
    });
  }
  if (entries.length < 4) return null;
  entries.sort((a, b) => (a.date < b.date ? -1 : 1));
  // Best, counting near-ties (within 0.5%) as no real progress since the earlier one.
  let best = entries[0];
  for (const e of entries) if (e.e1rm > best.e1rm * 1.005) best = e;
  const after = entries.filter((e) => e.date > best.date);
  const weeks = Math.floor((daysBetween(weekStart(best.date), weekStart(today))) / 7);
  if (weeks < 3 || after.length < 3) return null;

  const rpes = after.flatMap((e) => e.rpes);
  const avgRpe = rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null;
  const usualReps = mode(after.flatMap((e) => e.reps));
  return { exerciseId, weeks, sessionsSince: after.length, bestKg: best.e1rm, bestDate: best.date, avgRpe, suggestions: suggestFixes(exerciseId, exercises, usualReps, avgRpe) };
}

function suggestFixes(exerciseId: string, exercises: Map<string, Exercise>, usualReps: number, avgRpe: number | null): string[] {
  const out: string[] = [];
  const name = exercises.get(exerciseId)?.name ?? 'this lift';
  if (avgRpe != null && avgRpe >= 9) {
    out.push(`Your sets have averaged RPE ${avgRpe}. Take a deload week, then drop about 5% and build back up.`);
  }
  const variations = familyOf(exerciseId, exercises)
    .filter((e) => e.id !== exerciseId && e.parentId && (e.parentId === exerciseId || e.parentId === exercises.get(exerciseId)?.parentId))
    .map((e) => e.name)
    .slice(0, 3);
  if (variations.length) out.push(`Swap ${name} for a variation for 3–4 weeks to work its weak point: ${variations.join(', ')}.`);
  const otherReps = usualReps <= 3 ? '5–6' : usualReps <= 6 ? '3s, or sets of 8' : '4–6';
  out.push(`Change the rep range: you've mostly done sets of ${usualReps}; try ${otherReps} for a block.`);
  if (avgRpe == null || avgRpe < 9) out.push('Add a deload week if you haven’t had one in the last 4–6 weeks.');
  return out;
}

/** Plateaued lifts among those trained in the last 4 weeks, worst first. */
export function findPlateaus(sessions: Session[], exercises: Map<string, Exercise>, today: string): Plateau[] {
  const recent = new Set(sessions.filter((s) => s.date >= addDays(today, -28)).flatMap((s) => s.exerciseIds));
  return [...recent]
    .map((id) => findPlateau(sessions, id, exercises, today))
    .filter((p): p is Plateau => !!p)
    .sort((a, b) => b.weeks - a.weeks);
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

function mode(nums: number[]): number {
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 5;
}
