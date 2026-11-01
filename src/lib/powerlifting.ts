// Powerlifting total and scoring. All weights in kg.
import type { Exercise, Session } from '../db/types';
import { isLiftSet, setE1RM } from './strength';
import { round } from './units';

export type Sex = 'male' | 'female';

const poly = (coeffs: number[], x: number) => coeffs.reduce((sum, c, i) => sum + c * x ** i, 0);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const DOTS = {
  male: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093],
  female: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706]
};
const DOTS_RANGE = { male: [40, 210], female: [40, 150] };

/** DOTS score (IPF-style bodyweight-adjusted total). */
export function dots(totalKg: number, bodyweightKg: number, sex: Sex): number {
  const bw = clamp(bodyweightKg, DOTS_RANGE[sex][0], DOTS_RANGE[sex][1]);
  return round((totalKg * 500) / poly(DOTS[sex], bw), 2);
}

const WILKS = {
  male: [-216.0475144, 16.2606339, -0.002388645, -0.00113732, 7.01863e-6, -1.291e-8],
  female: [594.31747775582, -27.23842536447, 0.82112226871, -0.00930733913, 4.731582e-5, -9.054e-8]
};
const WILKS_RANGE = { male: [40, 201.9], female: [26.51, 154.53] };

/** Classic Wilks score. */
export function wilks(totalKg: number, bodyweightKg: number, sex: Sex): number {
  const bw = clamp(bodyweightKg, WILKS_RANGE[sex][0], WILKS_RANGE[sex][1]);
  return round((totalKg * 500) / poly(WILKS[sex], bw), 2);
}

/** Exercises that count as the competition lift (no partials like block or rack pulls). */
export const COMPETITION_LIFTS: Record<'squat' | 'bench' | 'deadlift', string[]> = {
  squat: ['squat', 'paused-squat', 'low-bar-squat', 'high-bar-squat', 'beltless-squat'],
  bench: ['bench-press', 'paused-bench-press', 'long-pause-bench-press', 'touch-and-go-bench-press', 'feet-up-bench-press'],
  deadlift: ['deadlift', 'sumo-deadlift', 'paused-deadlift', 'beltless-deadlift', 'paused-sumo-deadlift']
};

export interface LiftBest {
  weightKg: number;
  reps: number;
  date: string;
  exerciseId: string;
}

export interface TotalLift {
  lifted: LiftBest | null; // heaviest single (or more reps) actually lifted
  estimated: (LiftBest & { e1rm: number }) | null; // best e1RM
}

export function bestLifts(sessions: Session[], exercises: Map<string, Exercise>): Record<keyof typeof COMPETITION_LIFTS, TotalLift> {
  const result = {} as Record<keyof typeof COMPETITION_LIFTS, TotalLift>;
  for (const [lift, ids] of Object.entries(COMPETITION_LIFTS) as [keyof typeof COMPETITION_LIFTS, string[]][]) {
    const idSet = new Set(ids);
    let lifted: LiftBest | null = null;
    let estimated: TotalLift['estimated'] = null;
    for (const session of sessions) {
      for (const ex of session.exercises) {
        if (!idSet.has(ex.exerciseId)) continue;
        for (const s of ex.sets) {
          if (!isLiftSet(s, exercises.get(ex.exerciseId))) continue;
          const here = { weightKg: s.weightKg!, reps: s.reps!, date: session.date, exerciseId: ex.exerciseId };
          if (!lifted || here.weightKg > lifted.weightKg) lifted = here;
          const e = setE1RM(s)?.value ?? 0;
          if (e && (!estimated || e > estimated.e1rm)) estimated = { ...here, e1rm: e };
        }
      }
    }
    result[lift] = { lifted, estimated };
  }
  return result;
}
