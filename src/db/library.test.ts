import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { blankSet } from '../lib/draft';
import { familyOf, familyOrder, filterExercises, matchesQuery } from '../lib/exerciseList';
import { exerciseIdFor } from '../lib/ids';
import { EQUIPMENT, MUSCLES, PATTERNS } from '../lib/muscles';
import { MODES } from '../lib/tracking';
import { TrackerDB } from './db';
import { LIBRARY } from './library';
import { LEGACY_KEY } from './migrateLegacy';
import {
  createExercise, finishDraft, getDraft, hideExercise, lastPerformance, listExercises, listSessions, listTemplates,
  mergeExercise, restoreExercise, saveDraft, saveExercise, saveTemplate, startup, toggleFavourite, type ExerciseInput
} from './repo';
import { applyLibrary } from './seed';
import type { Draft, Exercise } from './types';

describe('library data', () => {
  const names = LIBRARY.map((e) => e.name);
  const ids = names.map(exerciseIdFor);

  it('has unique names and ids', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('links every variation to a lift that exists', () => {
    for (const e of LIBRARY) if (e.parent) expect(names, e.name).toContain(e.parent);
  });

  it('uses known tags, and muscle shares add up to 100%', () => {
    for (const e of LIBRARY) {
      expect(Object.keys(PATTERNS), e.name).toContain(e.pattern);
      expect(Object.keys(EQUIPMENT), e.name).toContain(e.equipment);
      expect(Object.keys(MODES), e.name).toContain(e.tracking ?? 'strength');
      for (const m of Object.keys(e.muscles)) expect(Object.keys(MUSCLES), `${e.name}: ${m}`).toContain(m);
      expect(Object.values(e.muscles).reduce((a, b) => a + b!, 0), e.name).toBe(100);
    }
  });

  it('includes the Olympic lifts', () => {
    for (const n of ['Clean', 'Power Clean', 'Hang Clean', 'Clean and Jerk', 'Split Jerk', 'Push Jerk', 'Snatch', 'Power Snatch', 'Hang Snatch', 'Snatch Pull', 'Clean Pull', 'Overhead Squat']) {
      expect(names).toContain(n);
    }
  });

  it('includes powerlifting variations under the right lift', () => {
    const parentOf = (n: string) => LIBRARY.find((e) => e.name === n)?.parent;
    expect(parentOf('Paused Squat')).toBe('Squat');
    expect(parentOf('Larsen Press')).toBe('Bench Press');
    expect(parentOf('Spoto Press')).toBe('Bench Press');
    expect(parentOf('Close-Grip Bench Press')).toBe('Bench Press');
    expect(parentOf('Deficit Deadlift')).toBe('Deadlift');
    expect(parentOf('Deficit Sumo Deadlift')).toBe('Sumo Deadlift');
    expect(parentOf('Tempo Squat')).toBe('Squat');
    expect(LIBRARY.find((e) => e.name === 'Tempo Squat')?.defaultTempo).toBe('3-1-X-0');
  });

  it('keeps the ids of the Phase 1 athletic exercises and template exercises', () => {
    for (const id of ['20-m-sprint', 'single-leg-hop', 'medicine-ball-chest-pass', 'sled-push', 'countermovement-jump',
      'squat', 'bench-press', 'deadlift', 'overhead-press', 'romanian-deadlift', 'pull-up', 'barbell-row', 'incline-dumbbell-press',
      'triceps-pushdown', 'biceps-curl', 'leg-press', 'calf-raise']) {
      expect(ids).toContain(id);
    }
  });
});

const legacy = {
  version: 2, settings: { unit: 'kg' }, draft: null,
  workouts: [
    { id: 'w1', date: '2026-10-17', exercises: [{ name: 'Squat', sets: [{ reps: 5, weight: 130 }] }, { name: 'Bench', sets: [{ reps: 5, weight: 100 }] }] },
    { id: 'w2', date: '2026-10-24', exercises: [{ name: 'Push-up', sets: [{ reps: 20, weight: 10 }] }] }
  ],
  templates: [{ id: 't1', name: 'Upper', exercises: ['Bench'] }]
};
const storage = { getItem: (k: string) => (k === LEGACY_KEY ? JSON.stringify(legacy) : null) };

let db: TrackerDB;
let n = 0;
beforeEach(async () => {
  db = new TrackerDB(`lib-${++n}`);
  await startup(db, storage);
});

describe('installing the library', () => {
  it('adds every library exercise', async () => {
    const all = await listExercises(db);
    for (const e of LIBRARY) expect(all.map((x) => x.id)).toContain(exerciseIdFor(e.name));
  });

  it('tags exercises that already had history without changing how they are logged', async () => {
    const squat = (await db.exercises.get('squat'))!;
    expect(squat).toMatchObject({ name: 'Squat', pattern: 'squat', equipment: 'barbell', isCustom: false, tracking: 'strength' });
    expect(squat.muscles!.length).toBeGreaterThan(2);
    // Library Push-up is reps-only, but this lifter logged weight × reps, so it stays strength.
    expect((await db.exercises.get('push-up'))?.tracking).toBe('strength');
  });

  it('never overwrites the lifter’s own edits, and never revives hidden exercises', async () => {
    await saveExercise(db, { ...(await input('squat')), pattern: 'hinge', defaultTempo: '2-2-X-0' });
    await hideExercise(db, 'larsen-press');
    await applyLibrary(db, true);
    expect(await db.exercises.get('squat')).toMatchObject({ pattern: 'hinge', defaultTempo: '2-2-X-0' });
    expect((await db.exercises.get('larsen-press'))?.deletedAt).toBeTruthy();
  });

  it('only runs once per library version', async () => {
    expect(await applyLibrary(db)).toEqual({ added: 0, updated: 0 });
  });
});

async function input(id: string): Promise<ExerciseInput> {
  const e = (await db.exercises.get(id))!;
  return {
    id: e.id, name: e.name, tracking: e.tracking ?? 'strength', unilateral: !!e.unilateral, parentId: e.parentId ?? null,
    muscles: e.muscles ?? [], pattern: e.pattern ?? null, equipment: e.equipment ?? null, mechanic: e.mechanic ?? null,
    restSec: e.restSec ?? null, defaultTempo: e.defaultTempo ?? null, defaultDistanceM: e.defaultDistanceM ?? null
  };
}

describe('editing the library', () => {
  const blank: ExerciseInput = {
    name: 'Spoto Pin Press', tracking: 'strength', unilateral: false, parentId: 'bench-press', muscles: [{ muscle: 'chest', pct: 60 }, { muscle: 'triceps', pct: 40 }],
    pattern: 'push_h', equipment: 'barbell', mechanic: 'compound', restSec: 180, defaultTempo: ' 2-3-X-0 ', defaultDistanceM: null
  };

  it('creates a custom variation', async () => {
    const ex = await saveExercise(db, blank);
    expect(ex).toMatchObject({ id: 'spoto-pin-press', isCustom: true, parentId: 'bench-press', defaultTempo: '2-3-X-0', restSec: 180 });
  });

  it('rejects duplicate names and parent loops', async () => {
    await expect(saveExercise(db, { ...blank, name: 'bench press' })).rejects.toThrow(/already/);
    await expect(saveExercise(db, { ...(await input('bench-press')), parentId: 'larsen-press' })).rejects.toThrow(/variation/);
  });

  it('keeps the id (and history) when renaming, and finds it by its new name', async () => {
    await saveExercise(db, { ...(await input('squat')), name: 'Back Squat' });
    expect((await db.exercises.get('squat'))?.name).toBe('Back Squat');
    await saveTemplate(db, { name: 'Legs', exerciseNames: ['back squat'] });
    expect((await listTemplates(db)).find((t) => t.name === 'Legs')?.exercises).toEqual([{ exerciseId: 'squat' }]);
  });

  it('gives a new exercise a fresh id if a hidden one has the same slug', async () => {
    await hideExercise(db, 'larsen-press');
    await saveExercise(db, { ...(await input('larsen-press')), id: undefined, name: 'Larsen  Press ' });
    // Same name as the hidden one: that's allowed, and it gets its own id.
    expect((await listExercises(db)).filter((e) => e.name === 'Larsen  Press'.trim()).length).toBe(1);
  });

  it('hides and restores', async () => {
    await hideExercise(db, 'pec-deck');
    expect((await listExercises(db)).some((e) => e.id === 'pec-deck')).toBe(false);
    await restoreExercise(db, 'pec-deck');
    expect((await listExercises(db)).some((e) => e.id === 'pec-deck')).toBe(true);
  });

  it('stars favourites', async () => {
    await toggleFavourite(db, 'squat');
    expect((await db.exercises.get('squat'))?.favourite).toBe(true);
  });
});

describe('merging duplicates', () => {
  it('moves history, templates and in-progress sets onto the other exercise', async () => {
    const draft: Draft = {
      v: 2, unit: 'kg', date: '2026-10-31', startedAt: '', templateId: null, notes: '', rest: null,
      exercises: [{ id: 'd1', exerciseId: 'bench', supersetGroup: null, restSec: null, notes: '', sets: [blankSet()] }]
    };
    await saveDraft(db, draft);
    expect(await mergeExercise(db, 'bench', 'bench-press')).toEqual({ sessions: 1 });
    expect((await lastPerformance(db, 'bench-press'))?.sets[0].weightKg).toBe(100);
    expect(await lastPerformance(db, 'bench')).toBeNull();
    expect((await listTemplates(db))[0].exercises).toEqual([{ exerciseId: 'bench-press' }]);
    expect((await getDraft(db))!.exercises[0].exerciseId).toBe('bench-press');
    expect(await db.exercises.get('bench')).toMatchObject({ mergedInto: 'bench-press' });
    expect((await listExercises(db)).some((e) => e.id === 'bench')).toBe(false);
  });

  it('sends the old name to the merged exercise afterwards', async () => {
    await mergeExercise(db, 'bench', 'bench-press');
    expect((await createExercise(db, { name: 'Bench', tracking: 'strength', unilateral: false })).id).toBe('bench-press');
  });

  it('re-homes variations and avoids a parent loop', async () => {
    await mergeExercise(db, 'bench-press', 'larsen-press');
    expect((await db.exercises.get('spoto-press'))?.parentId).toBe('larsen-press');
    expect((await db.exercises.get('larsen-press'))?.parentId).toBeNull();
  });

  it('refuses to merge an exercise into itself', async () => {
    await expect(mergeExercise(db, 'squat', 'squat')).rejects.toThrow();
  });
});

describe('tempo', () => {
  it('applies the exercise tempo to sets without their own', async () => {
    const d: Draft = {
      v: 2, unit: 'kg', date: '2026-10-31', startedAt: '', templateId: null, notes: '', rest: null,
      exercises: [{
        id: 'd1', exerciseId: 'tempo-squat', supersetGroup: null, restSec: null, notes: '', tempo: '3-1-X-0',
        sets: [{ ...blankSet(), reps: '5', weight: '100', done: true }, { ...blankSet(), reps: '5', weight: '100', done: true, tempo: '5-0-X-0' }]
      }]
    };
    const s = await finishDraft(db, d);
    expect(s!.exercises[0].sets.map((x) => x.tempo)).toEqual(['3-1-X-0', '5-0-X-0']);
    expect((await listSessions(db))[0].id).toBe(s!.id);
  });
});

describe('lists', () => {
  const ex = (p: Partial<Exercise>): Exercise => ({ id: p.name!.toLowerCase(), isCustom: false, createdAt: '', updatedAt: '', deletedAt: null, name: '', ...p });

  it('searches names and aliases word by word', () => {
    const cgbp = ex({ name: 'Close-Grip Bench Press', aliases: ['cgbp'] });
    expect(matchesQuery(cgbp, 'close grip')).toBe(true);
    expect(matchesQuery(cgbp, 'grip bench')).toBe(true);
    expect(matchesQuery(cgbp, 'cgbp')).toBe(true);
    expect(matchesQuery(cgbp, 'squat')).toBe(false);
  });

  it('nests variations under their lift', () => {
    const list = [ex({ name: 'Zercher', parentId: 'squat' }), ex({ name: 'Bench' }), ex({ name: 'Squat' }), ex({ name: 'Paused', parentId: 'squat' })];
    expect(familyOrder(list).map((r) => `${r.depth}${r.exercise.name}`)).toEqual(['0Bench', '0Squat', '1Paused', '1Zercher']);
  });

  it('finds variations by their lift’s name', async () => {
    const all = await listExercises(db);
    const bench = filterExercises(all, { query: 'bench' }).map((e) => e.name);
    for (const n of ['Spoto Press', 'Larsen Press', 'Pin Press', 'Floor Press', 'Incline Dumbbell Press']) expect(bench).toContain(n);
    expect(filterExercises(all, { query: 'squat' }).map((e) => e.name)).toContain('Paused Front Squat');
    expect(filterExercises(all, { query: 'bench' }).map((e) => e.name)).not.toContain('Squat');
  });

  it('filters by category, muscle and equipment', async () => {
    const all = await listExercises(db);
    const oly = filterExercises(all, { category: 'olympic' }).map((e) => e.name);
    expect(oly).toContain('Snatch');
    expect(oly).not.toContain('Squat');
    expect(filterExercises(all, { muscle: 'calves', equipment: 'machine' }).map((e) => e.name)).toContain('Calf Raise');
    expect(filterExercises(all, { category: 'sprint' }).every((e) => e.tracking === 'sprint')).toBe(true);
  });

  it('finds a whole family from any member', async () => {
    const all = new Map((await listExercises(db)).map((e) => [e.id, e]));
    const fam = familyOf('paused-front-squat', all).map((e) => e.name);
    expect(fam).toContain('Squat');
    expect(fam).toContain('Pin Squat');
    expect(fam).not.toContain('Bench Press');
  });
});
