import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { blankSet, finishPlan, newDraftExercise } from '../lib/draft';
import { findPRs } from '../lib/prs';
import { summariseWeek } from '../lib/weekly';
import { TrackerDB } from './db';
import { LIBRARY_VERSION } from './library';
import { addExampleWarmups, buildProgramDraft, finishDraft, getSettings, listSessions, listTemplates, saveProgram, startup } from './repo';
import { applyLibrary } from './seed';
import type { Draft, Exercise } from './types';

let db: TrackerDB;
let n = 0;
beforeEach(async () => {
  db = new TrackerDB(`warm-${++n}`);
  await startup(db, null);
});

const ex = async (id: string) => (await db.exercises.get(id))!;
const draftOf = (exercises: Draft['exercises']): Draft => ({ v: 2, unit: 'kg', date: '2026-11-02', startedAt: '', templateId: null, notes: '', rest: null, exercises });

describe('warm-up drills', () => {
  it('start as one tick-off line with the drill’s target', async () => {
    const d = newDraftExercise(await ex('a-skips'), null, 'kg');
    expect(d.target).toBe('2 × 20 m');
    expect(d.sets).toHaveLength(1);
    expect(d.sets[0].type).toBe('warmup');
  });

  it('only save when ticked, and never ask about unticked ones', async () => {
    const legSwings = newDraftExercise(await ex('leg-swings'), null, 'kg');
    const pullAparts = newDraftExercise(await ex('band-pull-aparts'), null, 'kg');
    const squat = newDraftExercise(await ex('squat'), null, 'kg');
    legSwings.sets[0].done = true;
    squat.sets = [{ ...blankSet(), reps: '5', weight: '100', done: true }];
    const d = draftOf([legSwings, pullAparts, squat]);
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e] as [string, Exercise]));
    expect(finishPlan(d, exercises, true)).toMatchObject({ ticked: 2, unticked: 0 });

    const s = await finishDraft(db, d);
    expect(s!.exercises.map((e) => e.exerciseId)).toEqual(['leg-swings', 'squat']);
    expect(s!.exercises[0].sets[0]).toMatchObject({ type: 'warmup', notes: '10 each leg', weightKg: null, reps: null });
  });

  it('never count towards PRs, tonnage or hard sets', async () => {
    const drill = newDraftExercise(await ex('high-knees'), null, 'kg');
    drill.sets[0].done = true;
    await finishDraft(db, draftOf([drill]));
    await finishDraft(db, { ...draftOf([{ ...newDraftExercise(await ex('high-knees'), null, 'kg'), sets: [{ ...drill.sets[0], id: 'x' }] }]), date: '2026-11-03' });
    const sessions = await listSessions(db);
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e] as [string, Exercise]));
    expect(findPRs(sessions, exercises).size).toBe(0);
    const week = summariseWeek(sessions, exercises, '2026-11-02');
    expect(week).toMatchObject({ workingSets: 0, tonnageKg: 0, untagged: 0 });
    expect(week.hardSets.size).toBe(0);
  });

  it('work inside programs, with the program’s own target', async () => {
    const p = await saveProgram(db, {
      name: 'With warm-up', weeks: 1, deloadEvery: null, maxes: {},
      days: [{ id: 'a', name: 'A', exercises: [{ id: 'w', exerciseId: 'a-skips', sets: 1, reps: '1', method: 'fixed', startKg: null, pcts: [], rpe: null, incrementKg: 0, effort: null, distanceM: null, notes: '3 × 20 m' }] }]
    });
    const d = await buildProgramDraft(db, p, { key: 'w1d1', week: 1, day: 0 }, await getSettings(db), '2026-11-02');
    expect(d.exercises[0]).toMatchObject({ exerciseId: 'a-skips', target: '3 × 20 m' });
  });

  it('come as example templates, added once', async () => {
    expect(await addExampleWarmups(db)).toBe(3);
    expect(await addExampleWarmups(db)).toBe(0);
    const sprint = (await listTemplates(db)).find((t) => t.name === 'Sprint Warm-up')!;
    expect(sprint.exercises.map((e) => e.exerciseId)).toContain('a-skips');
    // Every example drill is a real library drill (no stray strength exercises created).
    for (const t of await listTemplates(db)) {
      if (!t.name.includes('Warm-up')) continue;
      for (const e of t.exercises) expect((await ex(e.exerciseId)).tracking, e.exerciseId).toBe('drill');
    }
  });
});

describe('library upgrade to warm-ups', () => {
  it('adds the drills to a database that has the first library version', async () => {
    await db.exercises.delete('leg-swings');
    await db.meta.put({ key: 'library', value: { version: 1 } });
    await applyLibrary(db);
    expect(await db.exercises.get('leg-swings')).toMatchObject({ tracking: 'drill', defaultTarget: '10 each leg' });
    expect((await db.meta.get('library'))?.value).toMatchObject({ version: LIBRARY_VERSION });
  });
});
