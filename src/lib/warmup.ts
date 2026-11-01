import type { PlateSetup } from '../db/types';
import { roundToLoadable, smallestStep } from './plates';

export interface WarmupStep {
  weight: number; // in the setup's unit
  reps: number;
}

/** Empty bar, then 40/60/80/90% of the working weight. */
export const WARMUP_SCHEME = [
  { pct: 0, reps: 10 },
  { pct: 0.4, reps: 5 },
  { pct: 0.6, reps: 3 },
  { pct: 0.8, reps: 2 },
  { pct: 0.9, reps: 1 }
];

/**
 * Warm-up sets for a working weight, rounded to loadable weights. Steps that would round to the same
 * weight as the previous one, or reach the working weight, are skipped.
 */
export function warmupSets(working: number, setup: PlateSetup): WarmupStep[] {
  const bar = roundToLoadable(0, setup);
  if (working <= bar) return [];
  const steps: WarmupStep[] = [];
  const ceiling = working - smallestStep(setup) / 2;
  for (const { pct, reps } of WARMUP_SCHEME) {
    const weight = pct === 0 ? bar : roundToLoadable(working * pct, setup);
    if (weight >= ceiling) break;
    if (steps.length && weight <= steps[steps.length - 1].weight) continue;
    steps.push({ weight, reps });
  }
  return steps;
}
