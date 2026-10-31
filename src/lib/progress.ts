import type { Session } from '../db/types';

export interface TopSetPoint {
  date: string;
  weightKg: number;
}

/** Heaviest non-warm-up set per training day for one exercise, oldest first. */
export function topSetsByDate(sessions: Session[], exerciseId: string): TopSetPoint[] {
  const best = new Map<string, number>();
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const set of ex.sets) {
        if (set.type === 'warmup' || set.weightKg === null || !set.reps) continue;
        const prev = best.get(s.date);
        if (prev === undefined || set.weightKg > prev) best.set(s.date, set.weightKg);
      }
    }
  }
  return [...best.keys()].sort().map((date) => ({ date, weightKg: best.get(date)! }));
}
