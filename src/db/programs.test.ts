import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { exercisesFromSession } from '../lib/draft';
import { defaultPlan, nextSlot, slots } from '../lib/programs';
import { TrackerDB } from './db';
import { LEGACY_KEY } from './migrateLegacy';
import {
  buildProgramDraft, exportAll, finishDraft, getSettings, importAll, listPrograms, listSessions, listTemplates,
  restartProgram, saveProgram, saveTemplate, skipProgramSlot, startup, type ProgramInput
} from './repo';
import type { Exercise, PlannedExercise } from './types';

const legacy = {
  version: 2, settings: { unit: 'kg' }, draft: null, templates: [],
  workouts: [
    { id: 'w1', date: '2026-10-19', exercises: [{ name: 'Squat', sets: [{ reps: 5, weight: 140 }, { reps: 5, weight: 140 }, { reps: 5, weight: 140 }] }] },
    { id: 'w2', date: '2026-10-26', exercises: [{ name: 'Bench Press', sets: [{ reps: 5, weight: 100 }] }] }
  ]
};
const storage = { getItem: (k: string) => (k === LEGACY_KEY ? JSON.stringify(legacy) : null) };

let db: TrackerDB;
let n = 0;
beforeEach(async () => {
  db = new TrackerDB(`prog-${++n}`);
  await startup(db, storage);
});

const planned = (exerciseId: string, p: Partial<PlannedExercise> = {}): PlannedExercise =>
  ({ ...defaultPlan({ id: exerciseId } as Exercise, `${exerciseId}-plan`), exerciseId, ...p });

const programInput = (p: Partial<ProgramInput> = {}): ProgramInput => ({
  name: 'Strength Block', weeks: 4, deloadEvery: 4, maxes: {},
  days: [
    { id: 'a', name: 'Day A', exercises: [planned('squat', { method: 'linear', incrementKg: 5 }), planned('20-m-sprint', { method: 'fixed', sets: 4, reps: '1', effort: 95 })] },
    { id: 'b', name: 'Day B', exercises: [planned('bench-press', { method: 'pct', pcts: [70, 75, 80, 60], sets: 5 })] }
  ],
  ...p
});

describe('programs', () => {
  it('saves a program, validating name and days', async () => {
    const p = await saveProgram(db, programInput());
    expect(p).toMatchObject({ status: 'active', weeks: 4, deloadEvery: 4, log: {} });
    await expect(saveProgram(db, programInput({ name: ' ' }))).rejects.toThrow(/name/);
    await expect(saveProgram(db, programInput({ days: [] }))).rejects.toThrow(/day/);
  });

  it('builds the next workout with explained prescriptions', async () => {
    const p = await saveProgram(db, programInput());
    const settings = await getSettings(db);
    const draft = await buildProgramDraft(db, p, nextSlot(p)!, settings, '2026-11-02');
    expect(draft.program).toMatchObject({ programId: p.id, slot: 'w1d1', label: 'Strength Block · Week 1 · Day A' });
    const [squat, sprint] = draft.exercises;
    expect(squat.plan?.summary).toBe('3 × 5 @ 145 kg'); // 140 × 5 hit last time, +5
    expect(squat.plan?.why).toMatch(/\+5 kg/);
    expect(squat.sets.map((s) => [s.weight, s.reps])).toEqual([['145', '5'], ['145', '5'], ['145', '5']]);
    expect(sprint.sets).toHaveLength(4);
    expect(sprint.sets[0]).toMatchObject({ reps: '1', effort: 95, distance: '20' });
  });

  it('uses the best recent e1RM (or an entered 1RM) for percentages', async () => {
    const p = await saveProgram(db, programInput());
    const settings = await getSettings(db);
    const dayB = slots(p)[1];
    // Bench 100 × 5 -> e1RM 116.67; 70% = 81.67 -> 82.5 on the bar
    const d1 = await buildProgramDraft(db, p, dayB, settings, '2026-11-02');
    expect(d1.exercises[0].sets[0].weight).toBe('82.5');
    // Dates follow the device's language ("26 Oct" in the UK, "Oct 26" in the US).
    expect(d1.exercises[0].plan?.why).toMatch(/70% of 116.7 kg \(best e1RM, (26 Oct|Oct 26)\)/);
    const withMax = await saveProgram(db, { ...programInput(), id: p.id, maxes: { 'bench-press': 130 } });
    const d2 = await buildProgramDraft(db, withMax, dayB, settings, '2026-11-02');
    expect(d2.exercises[0].sets[0].weight).toBe('90'); // 91 -> 90
    expect(d2.exercises[0].plan?.why).toMatch(/1RM you entered/);
  });

  it('runs a deload week', async () => {
    const p = await saveProgram(db, programInput());
    const deloadDay = slots(p).find((s) => s.week === 4 && s.day === 1)!;
    const d = await buildProgramDraft(db, p, deloadDay, await getSettings(db), '2026-11-02');
    expect(d.program?.label).toMatch(/Week 4 \(deload\)/);
    expect(d.exercises[0].sets).toHaveLength(3); // 5 sets halved, rounded
    expect(d.exercises[0].plan?.why).toMatch(/^Deload week/);
  });

  it('ticks off finished workouts, and waits for the next one', async () => {
    const p = await saveProgram(db, programInput());
    const draft = await buildProgramDraft(db, p, nextSlot(p)!, await getSettings(db), '2026-11-02');
    draft.exercises[0].sets.forEach((s) => { s.done = true; });
    const session = await finishDraft(db, draft);
    expect(session?.programDayId).toBe(`${p.id}:w1d1`);
    const [after] = await listPrograms(db);
    expect(after.log.w1d1).toMatchObject({ sessionId: session!.id, skipped: false });
    expect(after.startedAt).toBe('2026-11-02');
    expect(nextSlot(after)?.key).toBe('w1d2');
  });

  it('skips a workout, finishes the program at the end, and restarts', async () => {
    const p = await saveProgram(db, programInput({ weeks: 1 }));
    await skipProgramSlot(db, p.id, 'w1d1', '2026-11-02');
    expect(nextSlot((await listPrograms(db))[0])?.key).toBe('w1d2');
    await skipProgramSlot(db, p.id, 'w1d2', '2026-11-03');
    expect((await listPrograms(db))[0].status).toBe('completed');
    await restartProgram(db, p.id);
    expect((await listPrograms(db))[0]).toMatchObject({ status: 'active', log: {} });
  });

  it('keeps progress when the program is edited', async () => {
    const p = await saveProgram(db, programInput());
    await skipProgramSlot(db, p.id, 'w1d1', '2026-11-02');
    const edited = await saveProgram(db, { ...programInput({ name: 'Block 2' }), id: p.id });
    expect(edited).toMatchObject({ name: 'Block 2', log: { w1d1: { skipped: true } } });
  });

  it('includes programs in backups', async () => {
    await saveProgram(db, programInput());
    const file = JSON.stringify(await exportAll(db));
    const other = new TrackerDB(`prog-${++n}`);
    await startup(other, null);
    await importAll(other, file);
    expect((await listPrograms(other)).map((p) => p.name)).toEqual(['Strength Block']);
  });
});

describe('repeat and save as template', () => {
  it('repeats a past workout with the same sets, nothing ticked', async () => {
    const [, squat] = await listSessions(db);
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    const repeated = exercisesFromSession(squat, exercises, 'kg');
    expect(repeated[0].exerciseId).toBe('squat');
    expect(repeated[0].sets.map((s) => [s.weight, s.reps, s.done])).toEqual([['140', '5', false], ['140', '5', false], ['140', '5', false]]);
  });

  it('saves a template straight from exercise ids', async () => {
    await saveTemplate(db, { name: 'Copied', exerciseIds: ['squat', 'bench-press'] });
    expect((await listTemplates(db)).find((t) => t.name === 'Copied')?.exercises).toEqual([{ exerciseId: 'squat' }, { exerciseId: 'bench-press' }]);
  });
});

describe('database upgrade', () => {
  it('adds the programs table to an existing (version 1) database without touching its data', async () => {
    const name = `upgrade-${++n}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ exercises: 'id, name, parentId, updatedAt', sessions: 'id, date, athleteId, *exerciseIds, updatedAt', templates: 'id, athleteId, order, updatedAt', meta: 'key' });
    await v1.table('sessions').put({ id: 'old', athleteId: 'me', date: '2026-10-01', exerciseIds: [], exercises: [], deletedAt: null, createdAt: '', updatedAt: '' });
    v1.close();
    const upgraded = new TrackerDB(name);
    expect(await upgraded.sessions.get('old')).toBeTruthy();
    expect(await upgraded.programs.count()).toBe(0);
    expect(upgraded.verno).toBe(2);
  });
});
