import type { Session, SetEntry, TrackingMode, Unit } from '../db/types';
import { setE1RM } from './strength';
import { weekStart } from './weekly';
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

/** Estimated 1RM per day: the best set's estimate (RPE chart if RPE was logged, else Epley). */
export function e1rmMetric(unit: Unit): Metric {
  return {
    label: 'Estimated 1RM', unit, combine: 'max',
    value: (s) => {
      if (!((s.weightKg ?? 0) > 0)) return null;
      const e = setE1RM(s);
      return e ? round(fromKg(e.value, unit), 1) : null;
    }
  };
}

/**
 * One value per training day (warm-ups left out), oldest first. `ids` can include variations.
 * With `byWeek`, one value per week (Monday) instead, which smooths out mixing a lift with its
 * lighter variations (squat on Monday, paused squat on Thursday).
 */
export function bestByDate(sessions: Session[], ids: string | Set<string>, metric: Metric, byWeek = false): Point[] {
  const wanted = typeof ids === 'string' ? new Set([ids]) : ids;
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const day = byWeek ? weekStart(s.date) : s.date;
    for (const ex of s.exercises) {
      if (!wanted.has(ex.exerciseId)) continue;
      for (const set of ex.sets) {
        if (set.type === 'warmup') continue;
        const v = metric.value(set);
        if (v == null) continue;
        const prev = byDay.get(day);
        byDay.set(day, prev === undefined ? v : metric.combine === 'sum' ? prev + v : Math.max(prev, v));
      }
    }
  }
  return [...byDay.keys()].sort().map((date) => ({ date, value: round(byDay.get(date)!, 2) }));
}
