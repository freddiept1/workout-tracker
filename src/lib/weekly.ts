// Weekly numbers: tonnage, hard sets per muscle group, consistency. Weeks start on Monday.
import type { Exercise, Session, SetEntry } from '../db/types';
import { MUSCLES } from './muscles';
import { isLiftSet, tonnageOf } from './strength';
import { modeOf } from './tracking';

// ---------- Dates (YYYY-MM-DD, local, no time zones involved) ----------

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const day = parse(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

export const inWeek = (date: string, start: string) => date >= start && date <= addDays(start, 6);

// ---------- Hard sets per muscle group ----------

export type Region = 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'glutes' | 'quads' | 'hamstrings' | 'calves';

export const REGIONS: { id: Region; label: string; target: [number, number] }[] = [
  { id: 'chest', label: 'Chest', target: [10, 20] },
  { id: 'back', label: 'Back', target: [10, 20] },
  { id: 'shoulders', label: 'Shoulders', target: [8, 16] },
  { id: 'arms', label: 'Arms', target: [6, 14] },
  { id: 'core', label: 'Core', target: [4, 12] },
  { id: 'glutes', label: 'Glutes', target: [8, 16] },
  { id: 'quads', label: 'Quads', target: [10, 20] },
  { id: 'hamstrings', label: 'Hamstrings', target: [8, 16] },
  { id: 'calves', label: 'Calves', target: [6, 12] }
];

/**
 * How much one set counts for each muscle group: a main mover (25%+ of the work) counts as a full
 * set, a helper (10–24%) as half. Within a group, the biggest share counts (quads + adductors
 * isn't two sets of quads).
 */
export function regionShares(exercise: Exercise | undefined): Map<Region, number> {
  const shares = new Map<Region, number>();
  for (const m of exercise?.muscles ?? []) {
    const region = (MUSCLES as Record<string, { region: Region }>)[m.muscle]?.region;
    if (!region) continue;
    const credit = m.pct >= 25 ? 1 : m.pct >= 10 ? 0.5 : 0;
    if (credit) shares.set(region, Math.max(shares.get(region) ?? 0, credit));
  }
  return shares;
}

/**
 * A hard set: a working lifting or bodyweight set that wasn't easy (RPE 7+, or no RPE logged).
 * Athletic work isn't counted here; it's tracked as volume.
 */
export function isHardSet(s: SetEntry, exercise: Exercise | undefined): boolean {
  const mode = modeOf(exercise);
  if (mode !== 'strength' && mode !== 'reps') return false;
  if (s.type === 'warmup' || !((s.reps ?? 0) > 0)) return false;
  return s.rpe == null || s.rpe >= 7;
}

export interface WeekSummary {
  start: string;
  sessions: number;
  workingSets: number;
  tonnageKg: number;
  hardSets: Map<Region, number>;
  untagged: number; // hard sets from exercises without muscle tags
  athletic: { sprintMetres: number; jumps: number; throws: number };
  days: Set<string>;
}

export function summariseWeek(sessions: Session[], exercises: Map<string, Exercise>, start: string): WeekSummary {
  const w: WeekSummary = {
    start, sessions: 0, workingSets: 0, tonnageKg: 0, hardSets: new Map(), untagged: 0,
    athletic: { sprintMetres: 0, jumps: 0, throws: 0 }, days: new Set()
  };
  for (const session of sessions) {
    if (!inWeek(session.date, start)) continue;
    w.sessions++;
    w.days.add(session.date);
    for (const ex of session.exercises) {
      const exercise = exercises.get(ex.exerciseId);
      const mode = modeOf(exercise);
      const shares = regionShares(exercise);
      for (const s of ex.sets) {
        if (s.type === 'warmup') continue;
        w.workingSets++;
        if (isLiftSet(s, exercise)) w.tonnageKg += tonnageOf(s);
        if (mode === 'sprint') w.athletic.sprintMetres += (s.distanceM ?? 0) * (s.reps ?? 0);
        if (mode === 'jump') w.athletic.jumps += s.reps ?? 0;
        if (mode === 'throw') w.athletic.throws += s.reps ?? 0;
        if (!isHardSet(s, exercise)) continue;
        if (!shares.size) w.untagged++;
        for (const [region, credit] of shares) w.hardSets.set(region, (w.hardSets.get(region) ?? 0) + credit);
      }
    }
  }
  return w;
}

/** Tonnage for each of the last `count` weeks ending with the week of `today`, oldest first. */
export function weeklyTonnage(sessions: Session[], exercises: Map<string, Exercise>, today: string, count = 12) {
  const thisWeek = weekStart(today);
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(thisWeek, -7 * (count - 1 - i));
    return { start, tonnageKg: summariseWeek(sessions, exercises, start).tonnageKg };
  });
}

/** Training days for the calendar: the last `weeks` weeks, Monday-first columns. */
export function calendarWeeks(sessions: Session[], today: string, weeks = 16): { start: string; days: { date: string; trained: boolean; future: boolean }[] }[] {
  const trained = new Set(sessions.map((s) => s.date));
  const thisWeek = weekStart(today);
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisWeek, -7 * (weeks - 1 - i));
    return { start, days: Array.from({ length: 7 }, (_, d) => { const date = addDays(start, d); return { date, trained: trained.has(date), future: date > today }; }) };
  });
}
