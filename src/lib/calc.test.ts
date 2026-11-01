import { describe, expect, it } from 'vitest';
import type { DraftSet, Session, SetEntry } from '../db/types';
import { DEFAULT_EQUIPMENT, loadBar, roundToLoadable, smallestStep } from './plates';
import { bestByDate, metricFor } from './progress';
import { formatSet, isFilled, modeOf, setBadge } from './tracking';
import { warmupSets } from './warmup';

const kg = DEFAULT_EQUIPMENT.kg;
const lb = DEFAULT_EQUIPMENT.lb;

describe('plate calculator', () => {
  it('loads common kg totals', () => {
    expect(loadBar(140, kg)).toEqual({ perSide: [25, 25, 10], achieved: 140, remainder: 0 });
    expect(loadBar(102.5, kg).perSide).toEqual([25, 15, 1.25]);
    expect(loadBar(20, kg).perSide).toEqual([]);
  });

  it('loads common lb totals', () => {
    expect(loadBar(315, lb).perSide).toEqual([45, 45, 45]);
    expect(loadBar(225, lb).perSide).toEqual([45, 45]);
    expect(loadBar(185, lb).perSide).toEqual([45, 25]);
  });

  it('counts collars', () => {
    expect(loadBar(150, { ...kg, collar: 2.5 })).toEqual({ perSide: [25, 25, 10, 2.5], achieved: 150, remainder: 0 });
  });

  it('reports what it could not load', () => {
    expect(loadBar(101, kg)).toEqual({ perSide: [25, 15], achieved: 100, remainder: 1 });
    expect(loadBar(10, kg)).toMatchObject({ perSide: [], achieved: 20, remainder: -10 });
  });

  it('uses change plates when available', () => {
    expect(loadBar(141, { ...kg, plates: [...kg.plates, 0.5] }).perSide).toEqual([25, 25, 10, 0.5]);
  });

  it('rounds to loadable weights', () => {
    expect(smallestStep(kg)).toBe(2.5);
    expect(roundToLoadable(101.4, kg)).toBe(102.5);
    expect(roundToLoadable(56, kg)).toBe(55);
    expect(roundToLoadable(3, kg)).toBe(20);
    expect(roundToLoadable(57, { ...kg, plates: [...kg.plates, 0.25] })).toBe(57);
  });
});

describe('warm-up generator', () => {
  it('builds bar, 40/60/80/90% for a heavy squat', () => {
    expect(warmupSets(200, kg)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 80, reps: 5 },
      { weight: 120, reps: 3 },
      { weight: 160, reps: 2 },
      { weight: 180, reps: 1 }
    ]);
  });

  it('rounds to loadable weights', () => {
    expect(warmupSets(142.5, kg).map((s) => s.weight)).toEqual([20, 57.5, 85, 115, 127.5]);
  });

  it('drops steps that collapse together for light weights', () => {
    expect(warmupSets(40, kg).map((s) => s.weight)).toEqual([20, 25, 32.5, 35]);
    expect(warmupSets(22.5, kg)).toEqual([{ weight: 20, reps: 10 }]);
    expect(warmupSets(20, kg)).toEqual([]);
  });

  it('works in pounds', () => {
    expect(warmupSets(405, lb).map((s) => s.weight)).toEqual([45, 160, 245, 325, 365]);
  });
});

const set = (p: Partial<SetEntry>): SetEntry => ({ id: 'x', type: 'working', weightKg: null, reps: null, rpe: null, completedAt: null, ...p });

describe('set display', () => {
  it('formats lifting with RPE and athletic work with effort', () => {
    expect(formatSet(set({ weightKg: 140, reps: 5, rpe: 8 }), 'strength', 'kg')).toBe('140 kg × 5 @ 8');
    expect(formatSet(set({ reps: 12 }), 'reps', 'kg')).toBe('12 reps');
    expect(formatSet(set({ distanceM: 20, reps: 4, effortPct: 95 }), 'sprint', 'kg')).toBe('20 m × 4 @ 95%');
    expect(formatSet(set({ reps: 5, effortPct: 100 }), 'jump', 'kg')).toBe('5 jumps @ 100%');
    expect(formatSet(set({ reps: 3, side: 'L', effortPct: 90 }), 'jump', 'kg')).toBe('3 jumps (L) @ 90%');
    expect(formatSet(set({ weightKg: 4, reps: 6, effortPct: 100 }), 'throw', 'kg')).toBe('4 kg × 6 @ 100%');
    expect(formatSet(set({ weightKg: 100, distanceM: 20, effortPct: 90 }), 'carry', 'kg')).toBe('100 kg × 20 m @ 90%');
  });

  it('numbers working sets and letters the rest', () => {
    const sets = [{ type: 'warmup' }, { type: 'warmup' }, { type: 'working' }, { type: 'top' }, { type: 'working' }] as SetEntry[];
    expect(sets.map((_, i) => setBadge(sets, i))).toEqual(['W', 'W', '1', 'T', '3']);
  });

  it('knows when a set has its required values', () => {
    const d = (p: Partial<DraftSet>) => ({ weight: '', reps: '', distance: '', ...p }) as DraftSet;
    expect(isFilled(d({ weight: '100' }), 'strength')).toBe(false);
    expect(isFilled(d({ reps: '5' }), 'strength')).toBe(true);
    expect(isFilled(d({ reps: '0' }), 'strength')).toBe(false);
    expect(isFilled(d({ distance: '20' }), 'sprint')).toBe(false);
    expect(isFilled(d({ distance: '20', reps: '4' }), 'sprint')).toBe(true);
    expect(isFilled(d({ reps: '5' }), 'jump')).toBe(true);
    expect(isFilled(d({ distance: '20' }), 'carry')).toBe(true);
  });

  it('treats unknown tracking types as strength', () => {
    expect(modeOf({ tracking: 'timed' as never })).toBe('strength');
    expect(modeOf(undefined)).toBe('strength');
  });
});

describe('progress metrics', () => {
  const session = (date: string, sets: Partial<SetEntry>[]): Session => ({
    id: date, athleteId: 'me', date, startedAt: null, endedAt: null, templateId: null, notes: '', source: 'live',
    exerciseIds: ['e'], createdAt: '', updatedAt: '', deletedAt: null,
    exercises: [{ id: 'se', exerciseId: 'e', sets: sets.map(set) }]
  });

  it('charts the heaviest working set for strength, ignoring warm-ups', () => {
    const sessions = [session('2026-10-01', [{ weightKg: 150, reps: 5, type: 'warmup' }, { weightKg: 100, reps: 5 }]), session('2026-10-08', [{ weightKg: 105, reps: 5 }])];
    expect(bestByDate(sessions, 'e', metricFor('strength', 'kg'))).toEqual([{ date: '2026-10-01', value: 100 }, { date: '2026-10-08', value: 105 }]);
  });

  it('charts sprint volume in metres', () => {
    const s = session('2026-10-01', [{ distanceM: 20, reps: 4 }, { distanceM: 30, reps: 2 }, { distanceM: 10, reps: 3, type: 'warmup' }]);
    expect(bestByDate([s], 'e', metricFor('sprint', 'kg'))).toEqual([{ date: '2026-10-01', value: 140 }]);
  });

  it('charts total jumps and throws', () => {
    const s = session('2026-10-01', [{ reps: 5 }, { reps: 5 }, { reps: 3 }]);
    expect(bestByDate([s], 'e', metricFor('jump', 'kg'))[0].value).toBe(13);
    expect(bestByDate([s], 'e', metricFor('throw', 'kg'))[0].value).toBe(13);
  });

  it('charts the heaviest carry load', () => {
    const s = session('2026-10-01', [{ weightKg: 80, distanceM: 20 }, { weightKg: 100, distanceM: 20 }]);
    expect(bestByDate([s], 'e', metricFor('carry', 'kg'))[0].value).toBe(100);
  });

  it('converts strength charts to pounds', () => {
    expect(bestByDate([session('2026-10-01', [{ weightKg: 100, reps: 1 }])], 'e', metricFor('strength', 'lb'))[0].value).toBeCloseTo(220.46, 2);
  });
});
