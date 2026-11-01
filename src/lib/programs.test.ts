import { describe, expect, it } from 'vitest';
import type { Exercise, PlannedExercise, Program, Session, SetEntry } from '../db/types';
import { DEFAULT_EQUIPMENT, roundToLoadable } from './plates';
import { findPlateau } from './plateau';
import { defaultPlan, isDeloadWeek, nextSlot, parseReps, prescribe, progressOf, slots, type HistoryEntry, type PrescribeInput } from './programs';

const ex = (p: Partial<Exercise> = {}): Exercise => ({ id: 'squat', name: 'Squat', isCustom: false, tracking: 'strength', createdAt: '', updatedAt: '', deletedAt: null, ...p });
const plan = (p: Partial<PlannedExercise>): PlannedExercise => ({
  id: 'p', exerciseId: 'squat', sets: 3, reps: '5', method: 'linear', startKg: 100, pcts: [75], rpe: 8, incrementKg: 2.5,
  effort: null, distanceM: null, notes: '', ...p
});
let n = 0;
const set = (weightKg: number, reps: number, rpe: number | null = null): SetEntry => ({ id: `s${++n}`, type: 'working', weightKg, reps, rpe, completedAt: null });
const entry = (date: string, sets: SetEntry[]): HistoryEntry => ({ date, sets });
const input = (p: Partial<PlannedExercise>, history: HistoryEntry[] = [], extra: Partial<PrescribeInput> = {}): PrescribeInput => ({
  plan: plan(p), exercise: ex(), week: 1, deload: false, history, ref1RM: null, unit: 'kg',
  roundKg: (kg) => roundToLoadable(kg, DEFAULT_EQUIPMENT.kg), ...extra
});

describe('schedule', () => {
  const prog = { weeks: 4, days: [{ id: 'a', name: 'A', exercises: [] }, { id: 'b', name: 'B', exercises: [] }], log: {} as Program['log'], deloadEvery: 4 };

  it('lists workouts in order', () => {
    expect(slots(prog).map((s) => s.key)).toEqual(['w1d1', 'w1d2', 'w2d1', 'w2d2', 'w3d1', 'w3d2', 'w4d1', 'w4d2']);
  });

  it('waits for missed days instead of skipping ahead', () => {
    expect(nextSlot(prog)?.key).toBe('w1d1');
    const log = { w1d1: { sessionId: 'x', date: '2026-10-01', skipped: false } };
    expect(nextSlot({ ...prog, log })?.key).toBe('w1d2');
    expect(nextSlot({ ...prog, log: { ...log, w1d2: { sessionId: null, date: '2026-10-03', skipped: true } } })?.key).toBe('w2d1');
    expect(progressOf({ ...prog, log }).done).toBe(1);
  });

  it('knows deload weeks', () => {
    expect([1, 2, 3, 4, 8].map((w) => isDeloadWeek(prog, w))).toEqual([false, false, false, true, true]);
    expect(isDeloadWeek({ deloadEvery: null }, 4)).toBe(false);
  });

  it('reads rep targets', () => {
    expect(parseReps('5')).toEqual({ lo: 5, hi: 5 });
    expect(parseReps('8-12')).toEqual({ lo: 8, hi: 12 });
    expect(parseReps('12–8')).toEqual({ lo: 8, hi: 12 });
    expect(parseReps('')).toEqual({ lo: 5, hi: 5 });
  });
});

describe('linear progression', () => {
  it('starts from the program’s starting weight', () => {
    const p = prescribe(input({}));
    expect(p.summary).toBe('3 × 5 @ 100 kg');
    expect(p.why).toMatch(/Starting weight/);
  });

  it('adds the increment when every rep was hit', () => {
    const p = prescribe(input({}, [entry('2026-10-01', [set(140, 5), set(140, 5), set(140, 5)])]));
    expect(p.sets[0].weightKg).toBe(142.5);
    expect(p.why).toBe('+2.5 kg: you hit 3 × 5 at 140 kg last time.');
  });

  it('jumps twice as far when it was easy, and holds when it was a grind', () => {
    expect(prescribe(input({}, [entry('d', [set(140, 5, 7), set(140, 5), set(140, 5)])])).why).toBe('+5 kg: you hit every rep last time and the top RPE was only 7.');
    expect(prescribe(input({}, [entry('d', [set(140, 5, 9.5), set(140, 5), set(140, 5)])])).sets[0].weightKg).toBe(140);
  });

  it('repeats the weight after a miss, and resets 10% after two', () => {
    const miss = entry('2', [set(140, 5), set(140, 5), set(140, 4)]);
    const one = prescribe(input({}, [miss]));
    expect(one.sets[0].weightKg).toBe(140);
    expect(one.why).toMatch(/5, 5, 4/);
    const two = prescribe(input({}, [miss, entry('1', [set(140, 5), set(140, 3), set(140, 3)])]));
    expect(two.sets[0].weightKg).toBe(125); // 126 rounded to plates
    expect(two.why).toMatch(/Reset 10%/);
  });
});

describe('double progression', () => {
  it('builds reps, then adds weight at the top of the range', () => {
    const climbing = prescribe(input({ method: 'double', reps: '8-12' }, [entry('d', [set(60, 10), set(60, 9), set(60, 9)])]));
    expect(climbing.sets[0]).toMatchObject({ weightKg: 60, reps: 10 });
    expect(climbing.summary).toBe('3 × 10–12 @ 60 kg');
    const topped = prescribe(input({ method: 'double', reps: '8-12' }, [entry('d', [set(60, 12), set(60, 12), set(60, 12)])]));
    expect(topped.sets[0]).toMatchObject({ weightKg: 62.5, reps: 8 });
    expect(topped.why).toMatch(/reached 12 reps/);
  });
});

describe('RPE-based', () => {
  it('works out the load from the latest e1RM and the target RPE', () => {
    // 150 × 5 @ 8 -> e1RM 184.96; 5 @ 8 = 81.1% -> 150
    const p = prescribe(input({ method: 'rpe', rpe: 8 }, [entry('d', [set(150, 5, 8)])]));
    expect(p.sets[0].weightKg).toBe(150);
    expect(p.summary).toBe('3 × 5 @ 150 kg (RPE 8)');
    // 3 @ 9 = 89.2% of 185 = 165 (rounded)
    expect(prescribe(input({ method: 'rpe', rpe: 9, reps: '3' }, [entry('d', [set(150, 5, 8)])])).sets[0].weightKg).toBe(165);
  });

  it('asks you to work up when there is no history', () => {
    expect(prescribe(input({ method: 'rpe', startKg: null })).why).toMatch(/Work up to 5 reps at RPE 8/);
  });
});

describe('percentage waves', () => {
  it('uses the week’s percentage of the 1RM', () => {
    const ref = { kg: 200, source: 'your e1RM' };
    expect(prescribe(input({ method: 'pct', pcts: [70, 75, 80] }, [], { ref1RM: ref, week: 2 })).sets[0].weightKg).toBe(150);
    expect(prescribe(input({ method: 'pct', pcts: [70, 75, 80] }, [], { ref1RM: ref, week: 6 })).sets[0].weightKg).toBe(160); // past the list: last value
    expect(prescribe(input({ method: 'pct', pcts: [72] }, [], { ref1RM: ref })).why).toBe('72% of 200 kg (your e1RM).');
  });

  it('explains when there is no 1RM yet', () => {
    const p = prescribe(input({ method: 'pct', pcts: [75] }));
    expect(p.sets[0].weightKg).toBeNull();
    expect(p.why).toMatch(/enter a 1RM/);
  });
});

describe('deloads and athletic work', () => {
  it('halves sets and takes 10% off in a deload week', () => {
    const p = prescribe(input({ sets: 4 }, [entry('d', [set(140, 5), set(140, 5), set(140, 5), set(140, 5)])], { deload: true }));
    expect(p.sets).toHaveLength(2);
    expect(p.sets[0].weightKg).toBe(127.5); // 142.5 × 0.9 = 128.25
    expect(p.why).toMatch(/^Deload week/);
  });

  it('plans athletic work as reps at an effort', () => {
    const sprint = ex({ id: '20-m-sprint', tracking: 'sprint', defaultDistanceM: 20 });
    const p = prescribe(input({ method: 'fixed', reps: '1', sets: 6, effort: 95 }, [], { exercise: sprint }));
    expect(p.summary).toBe('6 × 20 m × 1 @ 95%');
    expect(p.sets[0]).toMatchObject({ effort: 95, distanceM: 20, rpe: null });
  });

  it('picks sensible defaults', () => {
    expect(defaultPlan(ex({ pattern: 'squat', mechanic: 'compound' }), 'x')).toMatchObject({ method: 'linear', reps: '5', incrementKg: 5 });
    expect(defaultPlan(ex({ pattern: 'isolation', mechanic: 'isolation' }), 'x')).toMatchObject({ method: 'double', reps: '8-12', incrementKg: 2.5 });
    expect(defaultPlan(ex({ tracking: 'jump' }), 'x')).toMatchObject({ effort: 95, reps: '3' });
  });
});

describe('plateaus', () => {
  const exercises = new Map<string, Exercise>([
    ['squat', ex()],
    ['paused-squat', ex({ id: 'paused-squat', name: 'Paused Squat', parentId: 'squat' })],
    ['pin-squat', ex({ id: 'pin-squat', name: 'Pin Squat', parentId: 'squat' })]
  ]);
  const sess = (date: string, w: number, reps = 5, rpe: number | null = null): Session => ({
    id: date, athleteId: 'me', date, startedAt: null, endedAt: null, templateId: null, notes: '', source: 'live',
    createdAt: date, updatedAt: date, deletedAt: null, exerciseIds: ['squat'],
    exercises: [{ id: 'e', exerciseId: 'squat', sets: [set(w, reps, rpe)] }]
  });

  it('flags a lift with no e1RM gain for 3+ weeks of training', () => {
    const s = [sess('2026-09-28', 150), sess('2026-10-05', 155), sess('2026-10-12', 152.5), sess('2026-10-19', 155), sess('2026-10-26', 152.5, 5, 9.5), sess('2026-10-29', 150, 5, 9)];
    const p = findPlateau(s, 'squat', exercises, '2026-11-01')!;
    expect(p).toMatchObject({ weeks: 3, sessionsSince: 4, bestDate: '2026-10-05' });
    expect(p.suggestions.join(' ')).toMatch(/Paused Squat/);
    expect(p.suggestions.join(' ')).toMatch(/RPE 9\.3/);
    expect(p.suggestions.join(' ')).toMatch(/sets of 5/);
  });

  it('doesn’t flag a lift that’s still improving or barely trained', () => {
    const rising = [sess('2026-10-05', 150), sess('2026-10-12', 152.5), sess('2026-10-19', 155), sess('2026-10-26', 157.5)];
    expect(findPlateau(rising, 'squat', exercises, '2026-11-01')).toBeNull();
    const sparse = [sess('2026-09-01', 160), sess('2026-10-26', 150), sess('2026-10-29', 150), sess('2026-10-30', 150)];
    expect(findPlateau(sparse, 'squat', exercises, '2026-11-01')).not.toBeNull(); // trained 3× since an old best
    expect(findPlateau(sparse.slice(0, 3), 'squat', exercises, '2026-11-01')).toBeNull(); // too few sessions
  });
});
