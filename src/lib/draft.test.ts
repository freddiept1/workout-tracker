import { describe, expect, it } from 'vitest';
import type { Draft, DraftExercise, Exercise, SetEntry } from '../db/types';
import { afterTick, blankSet, convertDraftUnit, finishPlan, groupLetters, linkWithNext, move, prefill, unlink } from './draft';

const exercise = (p: Partial<Exercise> = {}): Exercise => ({ id: 'squat', name: 'Squat', isCustom: false, createdAt: '', updatedAt: '', deletedAt: null, ...p });
const dex = (id: string, group: string | null = null): DraftExercise => ({ id, exerciseId: id, supersetGroup: group, restSec: null, notes: '', sets: [blankSet()] });
const draft = (exercises: DraftExercise[]): Draft => ({ v: 2, unit: 'kg', date: '', startedAt: '', templateId: null, notes: '', exercises, rest: null });
const stored = (p: Partial<SetEntry>): SetEntry => ({ id: 'x', type: 'working', weightKg: null, reps: null, rpe: null, completedAt: null, ...p });

describe('pre-fill from last time', () => {
  it('copies weights, reps, types and tempo but not RPE or notes', () => {
    const sets = prefill(exercise(), [
      stored({ type: 'warmup', weightKg: 60, reps: 5 }),
      stored({ weightKg: 140, reps: 5, rpe: 8, tempo: '3-1-X-0', notes: 'grindy' })
    ], 'kg');
    expect(sets.map((s) => [s.type, s.weight, s.reps, s.rpe, s.tempo, s.notes, s.done])).toEqual([
      ['warmup', '60', '5', null, '', '', false],
      ['working', '140', '5', null, '3-1-X-0', '', false]
    ]);
  });

  it('shows weights in the current unit', () => {
    expect(prefill(exercise(), [stored({ weightKg: 100, reps: 5 })], 'lb')[0].weight).toBe('220.46');
  });

  it('copies sprint distance, reps and effort, and hop sides', () => {
    const [s] = prefill(exercise({ tracking: 'sprint' }), [stored({ distanceM: 20, reps: 4, effortPct: 95 })], 'kg');
    expect([s.distance, s.reps, s.effort]).toEqual(['20', '4', 95]);
    const [h] = prefill(exercise({ tracking: 'jump', unilateral: true }), [stored({ reps: 3, side: 'L', effortPct: 100 })], 'kg');
    expect([h.reps, h.side, h.effort]).toEqual(['3', 'L', 100]);
  });

  it('starts with one blank set, pre-filling a default distance', () => {
    expect(prefill(exercise(), null, 'kg')).toHaveLength(1);
    expect(prefill(exercise({ tracking: 'sprint', defaultDistanceM: 10 }), null, 'kg')[0].distance).toBe('10');
  });
});

describe('unit switch mid-workout', () => {
  it('converts typed weights and leaves blanks alone', () => {
    const d = draft([{ ...dex('squat'), sets: [{ ...blankSet(), weight: '100' }, { ...blankSet(), weight: '' }] }]);
    const lb = convertDraftUnit(d, 'lb');
    expect(lb.unit).toBe('lb');
    expect(lb.exercises[0].sets.map((s) => s.weight)).toEqual(['220.46', '']);
    expect(convertDraftUnit(lb, 'kg').exercises[0].sets[0].weight).toBe('100');
  });
});

describe('finishing', () => {
  it('counts ticked and filled-but-unticked sets', () => {
    const d = draft([{ ...dex('squat'), sets: [
      { ...blankSet(), reps: '5', done: true },
      { ...blankSet(), reps: '5' },
      { ...blankSet(), weight: '100' } // no reps: not filled
    ] }]);
    const plan = finishPlan(d, new Map([['squat', exercise()]]), false);
    expect([plan.ticked, plan.unticked]).toEqual([1, 1]);
    expect(d.exercises[0].sets.map((s) => plan.include(d.exercises[0], s))).toEqual([true, false, false]);
  });
});

describe('supersets', () => {
  it('links neighbours, merges groups and labels them', () => {
    let d = draft([dex('a'), dex('b'), dex('c'), dex('d')]);
    d = linkWithNext(d, 0);
    d = linkWithNext(d, 1); // a+b+c: a circuit
    const g = d.exercises[0].supersetGroup;
    expect(d.exercises.map((e) => e.supersetGroup === g)).toEqual([true, true, true, false]);
    expect([...groupLetters(d).values()]).toEqual(['A']);
  });

  it('rests only after the last exercise of a superset', () => {
    const d = linkWithNext(draft([dex('a'), dex('b'), dex('c')]), 0);
    expect(afterTick(d, 0)).toEqual({ rest: false, nextExerciseIndex: 1 });
    expect(afterTick(d, 1)).toEqual({ rest: true, nextExerciseIndex: 0 });
    expect(afterTick(d, 2)).toEqual({ rest: true, nextExerciseIndex: null });
  });

  it('dissolves a superset left with one exercise', () => {
    const d = unlink(linkWithNext(draft([dex('a'), dex('b')]), 0), 1);
    expect(d.exercises.map((e) => e.supersetGroup)).toEqual([null, null]);
  });
});

describe('move', () => {
  it('reorders and ignores moves off the ends', () => {
    expect(move([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });
});
