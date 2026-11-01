import { describe, expect, it } from 'vitest';
import { migrateLegacy } from './migrateLegacy';

const NOW = '2026-10-31T12:00:00.000Z';
let n = 0;
const newId = () => `id-${++n}`;

// Shaped exactly like the localStorage data the live app (schema v2) writes.
const v2 = {
  version: 2,
  settings: { unit: 'kg' },
  draft: {
    date: '2026-10-31',
    templateId: 'tpl-legs',
    notes: 'heavy day',
    exercises: [
      { name: 'Squat', sets: [{ reps: '5', weight: '140' }, { reps: '', weight: '' }] },
      { name: '', sets: [{ reps: '', weight: '' }] }
    ]
  },
  workouts: [
    {
      id: 'w1', date: '2026-10-17', templateId: 'tpl-legs', notes: '',
      exercises: [{ name: 'Squat', sets: [{ reps: 5, weight: 130 }, { reps: 5, weight: 132.5 }] }]
    },
    {
      id: 'w2', date: '2026-10-24', templateId: null, notes: 'felt strong',
      exercises: [
        { name: 'squat', sets: [{ reps: 3, weight: 140 }] },
        { name: 'Bench Press', sets: [{ reps: 5, weight: 100 }] },
        { name: 'Bench Press', sets: [{ reps: 8, weight: 80 }] }
      ]
    }
  ],
  templates: [{ id: 'tpl-legs', name: 'Legs', exercises: ['Squat', 'Leg Press', ''] }]
};

describe('migrateLegacy', () => {
  const r = migrateLegacy(v2, NOW, newId);

  it('keeps every workout and every set', () => {
    expect(r.sessions).toHaveLength(2);
    expect(r.setCount).toBe(5);
    expect(r.sessions.flatMap((s) => s.exercises.flatMap((e) => e.sets))).toHaveLength(5);
  });

  it('keeps ids, dates, notes and template links', () => {
    const [w1, w2] = r.sessions;
    expect(w1).toMatchObject({ id: 'w1', date: '2026-10-17', templateId: 'tpl-legs', source: 'migrated', deletedAt: null });
    expect(w2).toMatchObject({ id: 'w2', notes: 'felt strong', templateId: null });
    expect(r.templates[0].id).toBe('tpl-legs');
  });

  it('turns sets into working sets with weights in kg', () => {
    const set = r.sessions[0].exercises[0].sets[1];
    expect(set).toMatchObject({ type: 'working', weightKg: 132.5, reps: 5, rpe: null, completedAt: null });
  });

  it('merges exercise names that differ only in capitals, keeping the first spelling', () => {
    const squat = r.exercises.find((e) => e.id === 'squat');
    expect(squat?.name).toBe('Squat');
    expect(r.exercises.map((e) => e.id).sort()).toEqual(['bench-press', 'leg-press', 'squat']);
    expect(r.sessions[1].exercises[0].exerciseId).toBe('squat');
    expect(r.sessions[1].exerciseIds).toEqual(['squat', 'bench-press']);
  });

  it('keeps an exercise logged twice in one session as two entries', () => {
    expect(r.sessions[1].exercises.filter((e) => e.exerciseId === 'bench-press')).toHaveLength(2);
  });

  it('skips blank template exercise names', () => {
    expect(r.templates[0].exercises).toEqual([{ exerciseId: 'squat' }, { exerciseId: 'leg-press' }]);
  });

  it('carries the in-progress workout over exactly as typed', () => {
    expect(r.draft).toMatchObject({ v: 2, unit: 'kg', date: '2026-10-31', templateId: 'tpl-legs', notes: 'heavy day', rest: null });
    expect(r.draft!.exercises[0].exerciseId).toBe('squat');
    expect(r.draft!.exercises[0].sets.map((s) => [s.reps, s.weight, s.done])).toEqual([['5', '140', false], ['', '', false]]);
  });

  it('drops an unnamed, empty exercise from the in-progress workout', () => {
    expect(r.draft!.exercises).toHaveLength(1);
  });

  it('converts pound data to kg', () => {
    const lb = migrateLegacy({ ...v2, settings: { unit: 'lb' } }, NOW, newId);
    expect(lb.settings.unit).toBe('lb');
    expect(lb.sessions[1].exercises[1].sets[0].weightKg).toBeCloseTo(45.3592, 3); // 100 lb
  });

  it('handles schema v1 data (no settings, no draft)', () => {
    const v1 = { version: 1, workouts: v2.workouts, templates: v2.templates };
    const r1 = migrateLegacy(v1, NOW, newId);
    expect(r1.settings.unit).toBe('kg');
    expect(r1.draft).toBeNull();
    expect(r1.sessions).toHaveLength(2);
    expect(r1.sourceVersion).toBe(1);
  });

  it('keeps odd values instead of dropping them', () => {
    const odd = migrateLegacy(
      { workouts: [{ date: '2026-01-01', exercises: [{ name: '  ', sets: [{ reps: '5', weight: 'x' }, {}] }] }] },
      NOW,
      newId
    );
    const ex = odd.sessions[0].exercises[0];
    expect(odd.exercises[0].name).toBe('Unnamed exercise');
    expect(ex.sets).toHaveLength(2);
    expect(ex.sets[0]).toMatchObject({ reps: 5, weightKg: null });
    expect(odd.sessions[0].id).toBeTruthy();
  });

  it('gives duplicate legacy ids new unique ids', () => {
    const dup = migrateLegacy({ workouts: [{ id: 'a', date: '2026-01-01' }, { id: 'a', date: '2026-01-02' }] }, NOW, newId);
    expect(new Set(dup.sessions.map((s) => s.id)).size).toBe(2);
  });

  it('rejects data that is not from this app', () => {
    expect(() => migrateLegacy({ hello: 1 }, NOW, newId)).toThrow();
    expect(() => migrateLegacy(null, NOW, newId)).toThrow();
  });
});
