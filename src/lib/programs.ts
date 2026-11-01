// Programs: the schedule (weeks × days, done in order) and the progression engines that decide each
// planned exercise's load. Pure functions: callers pass in history and a rounding function.
// Every prescription comes with a plain-language reason, and the lifter can always type over it.
import type { Exercise, Method, PlannedExercise, Program, SetEntry, Settings, Unit } from '../db/types';
import { roundToLoadable } from './plates';
import { rpePercent, setE1RM } from './strength';
import { MODES, modeOf } from './tracking';
import { formatWeight, fromKg, round, toKg } from './units';

// ---------- Schedule ----------

export interface Slot {
  key: string; // "w2d1"
  week: number; // 1-based
  day: number; // 0-based index into program.days
}

export const slotKey = (week: number, day: number) => `w${week}d${day + 1}`;

/** Every workout of the program, in the order they're done. */
export function slots(p: Pick<Program, 'weeks' | 'days'>): Slot[] {
  const out: Slot[] = [];
  for (let week = 1; week <= p.weeks; week++) for (let day = 0; day < p.days.length; day++) out.push({ key: slotKey(week, day), week, day });
  return out;
}

/**
 * The next workout: the first one not done or skipped. Missed days don't break anything; the
 * program simply waits for you.
 */
export function nextSlot(p: Pick<Program, 'weeks' | 'days' | 'log'>): Slot | null {
  return slots(p).find((s) => !p.log[s.key]) ?? null;
}

export const isDeloadWeek = (p: Pick<Program, 'deloadEvery'>, week: number) => !!p.deloadEvery && week % p.deloadEvery === 0;

export function progressOf(p: Pick<Program, 'weeks' | 'days' | 'log'>) {
  const all = slots(p);
  const done = all.filter((s) => p.log[s.key]).length;
  return { done, total: all.length, pct: all.length ? Math.round((done / all.length) * 100) : 0 };
}

// ---------- Reps ----------

export function parseReps(text: string): { lo: number; hi: number } {
  const nums = (text.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0);
  if (!nums.length) return { lo: 5, hi: 5 };
  const lo = Math.min(...nums.slice(0, 2));
  const hi = Math.max(...nums.slice(0, 2));
  return { lo, hi };
}

export const METHOD_LABEL: Record<Method, string> = {
  linear: 'Linear',
  double: 'Double progression',
  rpe: 'RPE-based',
  pct: '% of 1RM',
  fixed: 'Fixed load'
};

export const METHOD_HINT: Record<Method, string> = {
  linear: 'Add weight each time you hit every rep. Missing twice in a row resets 10%.',
  double: 'Work up the rep range; add weight once every set reaches the top.',
  rpe: 'Load from your latest estimated 1RM and a target RPE.',
  pct: 'A percentage of your 1RM, which can change week to week.',
  fixed: 'The same load every time.'
};

// ---------- Prescriptions ----------

export interface PlannedSet {
  weightKg: number | null;
  reps: number;
  rpe: number | null;
  effort: number | null;
  distanceM: number | null;
}

export interface Prescription {
  sets: PlannedSet[];
  summary: string; // "3 × 5 @ 142.5 kg"
  why: string; // "+2.5 kg: you hit 3 × 5 last time"
}

export interface HistoryEntry {
  date: string;
  sets: SetEntry[]; // working sets of this exercise in that session
}

export interface PrescribeInput {
  plan: PlannedExercise;
  exercise: Exercise | undefined;
  week: number;
  deload: boolean;
  history: HistoryEntry[]; // newest first
  ref1RM: { kg: number; source: string } | null; // for pct (entered 1RM or best recent e1RM)
  roundKg: (kg: number) => number; // to a load you can actually put on the bar
  unit: Unit;
}

const working = (sets: SetEntry[]) => sets.filter((s) => s.type !== 'warmup' && (s.reps ?? 0) > 0);
const topWeight = (sets: SetEntry[]) => Math.max(0, ...working(sets).map((s) => s.weightKg ?? 0));

/** Did every planned set get at least `reps` reps at the session's top weight? */
function hitAll(entry: HistoryEntry, sets: number, reps: number): boolean {
  const top = topWeight(entry.sets);
  const atTop = working(entry.sets).filter((s) => (s.weightKg ?? 0) >= top);
  return atTop.length >= sets && atTop.slice(0, sets).every((s) => (s.reps ?? 0) >= reps);
}

const maxRpe = (entry: HistoryEntry) => {
  const r = working(entry.sets).map((s) => s.rpe).filter((x): x is number => x != null);
  return r.length ? Math.max(...r) : null;
};

export function prescribe(input: PrescribeInput): Prescription {
  const { plan, exercise, week, deload, history, roundKg, unit } = input;
  const w = (kg: number) => `${formatWeight(kg, unit)} ${unit}`;
  const { lo, hi } = parseReps(plan.reps);
  let sets = Math.max(1, plan.sets);
  const mode = modeOf(exercise);

  // Athletic work: what to do and how hard, no load maths.
  if (MODES[mode].rating === 'effort') {
    if (deload) sets = Math.max(1, Math.round(sets / 2));
    const effort = deload && plan.effort ? Math.max(60, plan.effort - 10) : plan.effort;
    const set: PlannedSet = { weightKg: plan.startKg, reps: lo, rpe: null, effort, distanceM: plan.distanceM ?? exercise?.defaultDistanceM ?? null };
    const dist = set.distanceM ? `${set.distanceM} m × ` : '';
    return {
      sets: Array.from({ length: sets }, () => ({ ...set })),
      summary: `${sets} × ${dist}${lo}${effort ? ` @ ${effort}%` : ''}`,
      why: deload ? 'Deload week: half the sets, a little easier.' : 'From your program.'
    };
  }

  let weight: number | null = null;
  let reps = lo;
  let rpe: number | null = null;
  let why: string;
  const last = history[0];

  switch (plan.method) {
    case 'fixed':
      weight = plan.startKg;
      why = weight ? 'Fixed load from your program.' : 'No load set in the program; pick one.';
      break;

    case 'linear': {
      if (!last || !topWeight(last.sets)) {
        weight = plan.startKg;
        why = weight ? 'Starting weight from your program.' : 'First time: pick a starting weight you could do for a couple more reps.';
        break;
      }
      const prev = topWeight(last.sets);
      if (hitAll(last, sets, lo)) {
        const r = maxRpe(last);
        if (r != null && r >= 9.5) { weight = prev; why = `Same weight: you hit every rep last time, but it was RPE ${r}.`; }
        else if (r != null && r <= 7) { weight = prev + 2 * plan.incrementKg; why = `+${w(2 * plan.incrementKg)}: you hit every rep last time and the top RPE was only ${r}.`; }
        else { weight = prev + plan.incrementKg; why = `+${w(plan.incrementKg)}: you hit ${sets} × ${lo} at ${w(prev)} last time.`; }
      } else {
        const before = history[1];
        const missedTwice = before && topWeight(before.sets) === prev && !hitAll(before, sets, lo);
        if (missedTwice) { weight = prev * 0.9; why = `Reset 10%: missed reps at ${w(prev)} twice in a row. Build back up from here.`; }
        else {
          weight = prev;
          why = `Same weight: last time was ${working(last.sets).map((s) => s.reps).join(', ')} reps. Aim to hit ${sets} × ${lo}.`;
        }
      }
      break;
    }

    case 'double': {
      if (!last || !topWeight(last.sets)) {
        weight = plan.startKg;
        why = weight ? `Starting weight from your program. Aim for ${lo}–${hi} reps.` : `First time: pick a weight you can do for about ${lo} reps.`;
        break;
      }
      const prev = topWeight(last.sets);
      const done = working(last.sets).filter((s) => (s.weightKg ?? 0) >= prev).map((s) => s.reps ?? 0);
      if (done.length >= sets && done.slice(0, sets).every((r) => r >= hi)) {
        weight = prev + plan.incrementKg;
        reps = lo;
        why = `+${w(plan.incrementKg)}: you reached ${hi} reps on every set. Back to ${lo} reps and build up again.`;
      } else {
        weight = prev;
        reps = Math.min(hi, Math.min(...done.slice(0, sets)) + 1);
        why = `Same weight: last time was ${done.join(', ')} reps. Add a rep where you can, up to ${hi}.`;
      }
      break;
    }

    case 'rpe': {
      rpe = plan.rpe ?? 8;
      const best = last ? working(last.sets).map((s) => ({ s, e: setE1RM(s) })).filter((x) => x.e).sort((a, b) => b.e!.value - a.e!.value)[0] : null;
      const pct = rpePercent(lo, rpe);
      if (best && pct) {
        weight = (best.e!.value * pct) / 100;
        why = `Latest e1RM ${w(round(best.e!.value, 1))} (from ${w(best.s.weightKg!)} × ${best.s.reps}${best.s.rpe ? ` @ ${best.s.rpe}` : ''}). ${lo} reps @ RPE ${rpe} is about ${pct}% of that.`;
      } else {
        weight = plan.startKg;
        why = `Work up to ${lo} reps at RPE ${rpe} (${10 - rpe} rep${10 - rpe === 1 ? '' : 's'} left in the tank).`;
      }
      break;
    }

    case 'pct': {
      const pct = plan.pcts[Math.min(week - 1, plan.pcts.length - 1)] ?? plan.pcts[0];
      if (pct && input.ref1RM) {
        weight = (input.ref1RM.kg * pct) / 100;
        why = `${pct}% of ${w(round(input.ref1RM.kg, 1))} (${input.ref1RM.source}).`;
      } else {
        why = pct ? `${pct}% of your 1RM. Log this lift or enter a 1RM in the program to get a weight.` : 'Set a percentage for this week.';
      }
      break;
    }
  }

  if (deload) {
    sets = Math.max(1, Math.round(sets / 2));
    if (weight) weight *= 0.9;
    if (rpe) rpe = Math.max(6, rpe - 2);
    why = `Deload week: half the sets, 10% lighter. ${why}`;
  }
  if (weight) weight = roundKg(weight);

  const repsText = plan.method === 'double' && reps !== hi ? `${reps}–${hi}` : String(reps);
  const summary = `${sets} × ${repsText}${weight ? ` @ ${w(weight)}` : ''}${rpe ? ` (RPE ${rpe})` : ''}`;
  return { sets: Array.from({ length: sets }, () => ({ weightKg: weight, reps, rpe: null, effort: null, distanceM: null })), summary, why };
}

/**
 * Rounds a load to what can actually be loaded: barbell lifts to your plates, everything else
 * to whole kg (or 2.5 lb steps).
 */
export function loadRounder(exercise: Exercise | undefined, settings: Settings): (kg: number) => number {
  const unit = settings.unit;
  const barbell = ['barbell', 'trap_bar', 'safety_bar', 'ez_bar'].includes(exercise?.equipment ?? 'barbell');
  return (kg) => {
    const inUnit = fromKg(kg, unit);
    const rounded = barbell ? roundToLoadable(inUnit, settings.equipment[unit]) : unit === 'kg' ? Math.round(inUnit) : Math.round(inUnit / 2.5) * 2.5;
    return toKg(rounded, unit);
  };
}

/** A sensible default plan for an exercise added to a program day. */
export function defaultPlan(exercise: Exercise | undefined, id: string): PlannedExercise {
  const athletic = MODES[modeOf(exercise)].rating === 'effort';
  const isolation = exercise?.mechanic === 'isolation';
  const lower = ['squat', 'hinge', 'olympic'].includes(exercise?.pattern ?? '');
  return {
    id, exerciseId: exercise?.id ?? '', notes: '',
    sets: 3,
    reps: athletic ? '3' : isolation ? '8-12' : '5',
    method: athletic ? 'fixed' : isolation ? 'double' : 'linear',
    startKg: null, pcts: [75], rpe: 8,
    incrementKg: lower ? 5 : 2.5,
    effort: athletic ? 95 : null,
    distanceM: exercise?.defaultDistanceM ?? null
  };
}
