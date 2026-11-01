import type { Session, SetEntry, TrackingMode, Unit } from '../db/types';
import { fromKg, round } from './units';

/**
 * What the Progress chart plots for an exercise. Lifting charts the heaviest set (best per day);
 * athletic work isn't measured for results, so it charts how much was done (summed per day).
 */
export interface Metric {
  label: string;
  unit: string;
  combine: 'max' | 'sum';
  value: (s: SetEntry) => number | null; // in display units
}

const working = (s: SetEntry) => (s.reps ?? 0) > 0;

export function metricFor(mode: TrackingMode, unit: Unit): Metric {
  const load = (s: SetEntry) => (s.weightKg != null ? round(fromKg(s.weightKg, unit), 2) : null);
  switch (mode) {
    case 'strength':
      return { label: 'Heaviest set', unit, combine: 'max', value: (s) => (working(s) ? load(s) : null) };
    case 'reps':
      return { label: 'Most reps in a set', unit: 'reps', combine: 'max', value: (s) => s.reps ?? null };
    case 'sprint':
      return { label: 'Sprint volume', unit: 'm', combine: 'sum', value: (s) => (s.distanceM ?? 0) * (s.reps ?? 0) || null };
    case 'jump':
      return { label: 'Total jumps', unit: 'jumps', combine: 'sum', value: (s) => s.reps ?? null };
    case 'throw':
      return { label: 'Total throws', unit: 'throws', combine: 'sum', value: (s) => s.reps ?? null };
    case 'carry':
      return { label: 'Heaviest load', unit, combine: 'max', value: (s) => (s.weightKg ? load(s) : null) };
  }
}

export interface Point {
  date: string;
  value: number;
}

/** One value per training day (warm-ups left out), oldest first. */
export function bestByDate(sessions: Session[], exerciseId: string, metric: Metric): Point[] {
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const set of ex.sets) {
        if (set.type === 'warmup') continue;
        const v = metric.value(set);
        if (v == null) continue;
        const prev = byDay.get(s.date);
        byDay.set(s.date, prev === undefined ? v : metric.combine === 'sum' ? prev + v : Math.max(prev, v));
      }
    }
  }
  return [...byDay.keys()].sort().map((date) => ({ date, value: round(byDay.get(date)!, 2) }));
}
