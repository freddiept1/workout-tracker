import type { PlateSetup, Unit } from '../db/types';

export const DEFAULT_EQUIPMENT: { kg: PlateSetup; lb: PlateSetup } = {
  kg: { bar: 20, collar: 0, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
  lb: { bar: 45, collar: 0, plates: [45, 35, 25, 10, 5, 2.5] }
};

/** Every plate size offered in settings (change plates included, off by default). */
export const ALL_PLATES: Record<Unit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 2, 1.5, 1.25, 1, 0.5, 0.25],
  lb: [55, 45, 35, 25, 15, 10, 5, 2.5, 1.25]
};

export interface PlateLoad {
  perSide: number[]; // heaviest first
  achieved: number; // total the bar will actually weigh
  remainder: number; // target - achieved (0 when exact)
}

// Work in hundredths so 1.25 + 0.25 etc. add up exactly.
const c = (n: number) => Math.round(n * 100);

/** Plates per side for a target total (all in the setup's unit). Greedy: optimal for standard plate sets. */
export function loadBar(target: number, setup: PlateSetup): PlateLoad {
  const empty = c(setup.bar) + 2 * c(setup.collar);
  let perSideLeft = Math.floor(Math.max(0, c(target) - empty) / 2);
  const perSide: number[] = [];
  for (const p of [...setup.plates].sort((a, b) => b - a)) {
    const pc = c(p);
    if (pc <= 0) continue;
    while (perSideLeft >= pc) {
      perSide.push(p);
      perSideLeft -= pc;
    }
  }
  const achieved = (empty + 2 * perSide.reduce((n, p) => n + c(p), 0)) / 100;
  return { perSide, achieved, remainder: Math.round((target - achieved) * 100) / 100 };
}

/** Smallest jump the bar can make (two of the smallest plate). */
export function smallestStep(setup: PlateSetup): number {
  const smallest = Math.min(...setup.plates.filter((p) => p > 0));
  return Number.isFinite(smallest) ? (c(smallest) * 2) / 100 : 0;
}

/** Nearest weight that can actually be loaded, never below the empty bar. */
export function roundToLoadable(weight: number, setup: PlateSetup): number {
  const empty = c(setup.bar) + 2 * c(setup.collar);
  const step = c(smallestStep(setup));
  if (!step) return empty / 100;
  const steps = Math.round((c(weight) - empty) / step);
  return (empty + Math.max(0, steps) * step) / 100;
}

/** IPF-style plate colours for the plate picture. */
export function plateColour(p: number, unit: Unit): string {
  const kg = unit === 'kg' ? p : p / 2.2046;
  if (kg >= 24) return '#d62828';
  if (kg >= 19) return '#1d4ed8';
  if (kg >= 14) return '#eab308';
  if (kg >= 9) return '#16a34a';
  if (kg >= 4.5) return '#e5e7eb';
  if (kg >= 2) return '#1f2937';
  return '#9ca3af';
}
