// Vocabulary for exercise tags. Keys are stored in the database, so never rename one; add new ones.

export const MUSCLES = {
  chest: { label: 'Chest', region: 'chest' },
  front_delts: { label: 'Front delts', region: 'shoulders' },
  side_delts: { label: 'Side delts', region: 'shoulders' },
  rear_delts: { label: 'Rear delts', region: 'shoulders' },
  lats: { label: 'Lats', region: 'back' },
  upper_back: { label: 'Upper back', region: 'back' },
  traps: { label: 'Traps', region: 'back' },
  lower_back: { label: 'Lower back', region: 'back' },
  biceps: { label: 'Biceps', region: 'arms' },
  triceps: { label: 'Triceps', region: 'arms' },
  forearms: { label: 'Forearms', region: 'arms' },
  abs: { label: 'Abs', region: 'core' },
  obliques: { label: 'Obliques', region: 'core' },
  glutes: { label: 'Glutes', region: 'glutes' },
  quads: { label: 'Quads', region: 'quads' },
  hamstrings: { label: 'Hamstrings', region: 'hamstrings' },
  adductors: { label: 'Adductors', region: 'quads' },
  calves: { label: 'Calves', region: 'calves' }
} as const;

export type Muscle = keyof typeof MUSCLES;

export const PATTERNS = {
  squat: 'Squat',
  hinge: 'Hinge',
  push_h: 'Horizontal push',
  push_v: 'Vertical push',
  pull_h: 'Horizontal pull',
  pull_v: 'Vertical pull',
  lunge: 'Lunge / single-leg',
  olympic: 'Olympic lift',
  core: 'Core',
  isolation: 'Isolation',
  sprint: 'Sprint',
  jump: 'Jump / hop',
  throw: 'Throw',
  carry: 'Carry / sled',
  warmup: 'Warm-up'
} as const;

export type Pattern = keyof typeof PATTERNS;

export const EQUIPMENT = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  kettlebell: 'Kettlebell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  trap_bar: 'Trap bar',
  safety_bar: 'Safety squat bar',
  ez_bar: 'EZ bar',
  band: 'Band',
  medicine_ball: 'Medicine ball',
  sled: 'Sled',
  box: 'Box / hurdle',
  none: 'None'
} as const;

export type Equipment = keyof typeof EQUIPMENT;

export const muscleLabel = (m: string) => (MUSCLES as Record<string, { label: string }>)[m]?.label ?? m;
export const patternLabel = (p: string | null | undefined) => (p ? (PATTERNS as Record<string, string>)[p] ?? p : '');
export const equipmentLabel = (e: string | null | undefined) => (e ? (EQUIPMENT as Record<string, string>)[e] ?? e : '');

/** Primary muscles: everything at 25% or more, and always the biggest one. The rest are secondary. */
export function splitMuscles(muscles: { muscle: string; pct: number }[] = []) {
  const sorted = [...muscles].sort((a, b) => b.pct - a.pct);
  const primary = sorted.filter((m, i) => i === 0 || m.pct >= 25);
  return { primary, secondary: sorted.filter((m) => !primary.includes(m)) };
}
