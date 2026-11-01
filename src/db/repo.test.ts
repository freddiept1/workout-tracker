import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { blankSet } from '../lib/draft';
import { bestByDate, metricFor } from '../lib/progress';
import { TrackerDB } from './db';
import { LEGACY_KEY } from './migrateLegacy';
import {
  createExercise, deleteSession, exportAll, finishDraft, getDraft, getSettings, importAll, lastPerformance,
  listSessions, listTemplates, saveTemplate, setUnit, startup, updateExercise
} from './repo';
import type { Draft, DraftSet, DraftV1 } from './types';

const legacy = {
  version: 2,
  settings: { unit: 'kg' },
  draft: null,
  workouts: [
    { id: 'w1', date: '2026-10-17', templateId: null, notes: '', exercises: [{ name: 'Squat', sets: [{ reps: 5, weight: 130 }] }] },
    { id: 'w2', date: '2026-10-24', templateId: null, notes: '', exercises: [{ name: 'Squat', sets: [{ reps: 5, weight: 135 }, { reps: 3, weight: 140 }] }] }
  ],
  templates: [{ id: 't1', name: 'Legs', exercises: ['Squat'] }]
};

const storageWith = (value: unknown) => ({
  getItem: (k: string) => (k === LEGACY_KEY && value != null ? JSON.stringify(value) : null)
});

let db: TrackerDB;
let dbCount = 0;
const saveDraftRaw = (d: DraftV1) => db.meta.put({ key: 'draft', value: d });
beforeEach(() => {
  db = new TrackerDB(`test-${++dbCount}`);
});

describe('startup migration', () => {
  it('copies localStorage data into the database once', async () => {
    const res = await startup(db, storageWith(legacy));
    expect(res).toMatchObject({ status: 'ready', migrated: { from: 'localStorage', sessions: 2, sets: 3 } });
    expect(await listSessions(db)).toHaveLength(2);

    // A second launch does nothing, even if localStorage still has (or changes) the old data.
    const again = await startup(db, storageWith({ workouts: [] }));
    expect(again).toEqual({ status: 'ready', migrated: null });
    expect(await listSessions(db)).toHaveLength(2);
  });

  it('migrates only once when two launches race', async () => {
    const [a, b] = await Promise.all([startup(db, storageWith(legacy)), startup(db, storageWith(legacy))]);
    const migrated = [a, b].filter((r) => r.status === 'ready' && r.migrated);
    expect(migrated).toHaveLength(1);
    expect(await listSessions(db)).toHaveLength(2);
  });

  it('seeds starter templates on a fresh install', async () => {
    await startup(db, storageWith(null));
    expect((await listTemplates(db)).map((t) => t.name)).toEqual(['Push', 'Pull', 'Legs']);
  });

  it('reports corrupt old data instead of losing it', async () => {
    const res = await startup(db, { getItem: () => '{not json' });
    expect(res).toMatchObject({ status: 'error', legacyRaw: '{not json' });
    expect(await db.meta.get('migration')).toBeUndefined();
  });
});

describe('logging', () => {
  beforeEach(() => startup(db, storageWith(legacy)));

  const set = (p: Partial<DraftSet>): DraftSet => ({ ...blankSet(), done: true, ...p });
  const draft = (exercises: [string, Partial<DraftSet>[]][]): Draft => ({
    v: 2, unit: 'kg', date: '2026-10-31', startedAt: '2026-10-31T10:00:00.000Z', templateId: null, notes: ' ', rest: null,
    exercises: exercises.map(([exerciseId, sets], i) => ({
      id: `e${i}`, exerciseId, supersetGroup: null, restSec: null, notes: '', sets: sets.map(set)
    }))
  });

  it('shows the most recent session as "last time"', async () => {
    const last = await lastPerformance(db, 'squat');
    expect(last?.date).toBe('2026-10-24');
    expect(last?.sets.map((s) => s.weightKg)).toEqual([135, 140]);
  });

  it('saves ticked sets with RPE, type, tempo and notes, dropping empty ones', async () => {
    const s = await finishDraft(db, draft([['squat', [
      { type: 'warmup', reps: '5', weight: '60' },
      { reps: '5', weight: '142,5', rpe: 8.5, tempo: '3-1-X-0', notes: ' belt ' },
      { reps: '', weight: '100' }
    ]]]));
    expect(s?.exercises[0].sets.map((x) => [x.type, x.reps, x.weightKg, x.rpe])).toEqual([['warmup', 5, 60, null], ['working', 5, 142.5, 8.5]]);
    expect(s?.exercises[0].sets[1]).toMatchObject({ tempo: '3-1-X-0', notes: 'belt' });
    expect(s?.source).toBe('live');
    expect(await getDraft(db)).toBeNull();
    expect((await lastPerformance(db, 'squat'))?.date).toBe('2026-10-31');
  });

  it('leaves out filled-in sets that were never ticked, if asked to', async () => {
    const d = draft([['squat', [{ reps: '5', weight: '140' }, { reps: '5', weight: '140', done: false }]]]);
    expect((await finishDraft(db, d, false))?.exercises[0].sets).toHaveLength(1);
  });

  it('keeps unticked sets by default', async () => {
    const d = draft([['squat', [{ reps: '5', weight: '140', done: false }]]]);
    expect((await finishDraft(db, d))?.exercises[0].sets[0].completedAt).toBeTruthy();
  });

  it('saves nothing when no set has data', async () => {
    expect(await finishDraft(db, draft([['squat', [{ reps: '', weight: '100' }]]]))).toBeNull();
    expect(await listSessions(db)).toHaveLength(2);
  });

  it('stores pounds as kg', async () => {
    const s = await finishDraft(db, { ...draft([['squat', [{ reps: '5', weight: '225' }]]]), unit: 'lb' });
    expect(s?.exercises[0].sets[0].weightKg).toBeCloseTo(102.058, 3);
  });

  it('saves athletic sets as work done plus effort', async () => {
    const s = await finishDraft(db, draft([
      ['20-m-sprint', [{ distance: '20', reps: '4', effort: 95 }, { distance: '20', reps: '' }]],
      ['countermovement-jump', [{ reps: '5', effort: 100, rpe: 9 }]],
      ['single-leg-hop', [{ reps: '3', side: 'L', effort: 90 }, { reps: '3', side: 'R', effort: 90 }]],
      ['medicine-ball-chest-pass', [{ weight: '4', reps: '6', effort: 100 }]],
      ['sled-push', [{ weight: '120', distance: '20', effort: 90 }]]
    ]));
    const [sprint, cmj, hop, pass, sled] = s!.exercises;
    expect(sprint.sets).toHaveLength(1);
    expect(sprint.sets[0]).toMatchObject({ distanceM: 20, reps: 4, effortPct: 95, weightKg: null, rpe: null });
    expect(cmj.sets[0]).toMatchObject({ reps: 5, effortPct: 100, rpe: null }); // athletic work takes effort, not RPE
    expect(hop.sets.map((x) => [x.reps, x.side])).toEqual([[3, 'L'], [3, 'R']]);
    expect(pass.sets[0]).toMatchObject({ weightKg: 4, reps: 6, effortPct: 100 });
    expect(sled.sets[0]).toMatchObject({ weightKg: 120, distanceM: 20, reps: null });
  });

  it('keeps RPE for lifts and drops effort', async () => {
    const s = await finishDraft(db, draft([['squat', [{ reps: '5', weight: '140', rpe: 8, effort: 90 }]]]));
    expect(s!.exercises[0].sets[0]).toMatchObject({ rpe: 8, effortPct: null });
  });

  it('upgrades a Phase 0 in-progress workout on first read', async () => {
    await saveDraftRaw({
      unit: 'kg', date: '2026-10-31', startedAt: '2026-10-31T10:00:00.000Z', templateId: null, notes: 'n',
      exercises: [
        { id: 'a', name: 'Hack Squat', sets: [{ id: 's1', type: 'working', weight: '100', reps: '8' }] },
        { id: 'b', name: '', sets: [{ id: 's2', type: 'working', weight: '', reps: '' }] }
      ]
    });
    const d = await getDraft(db);
    expect(d).toMatchObject({ v: 2, notes: 'n', rest: null });
    expect(d!.exercises).toHaveLength(1);
    expect(d!.exercises[0]).toMatchObject({ exerciseId: 'hack-squat', supersetGroup: null });
    expect(d!.exercises[0].sets[0]).toMatchObject({ weight: '100', reps: '8', done: false });
    expect((await db.exercises.get('hack-squat'))?.name).toBe('Hack Squat');
    expect((await db.meta.get('draft'))?.value).toMatchObject({ v: 2 });
  });

  it('adds the athletic exercises, keeping any the lifter already made', async () => {
    expect((await db.exercises.get('10-m-sprint'))).toMatchObject({ tracking: 'sprint', defaultDistanceM: 10 });
    expect((await db.exercises.get('single-leg-hop'))).toMatchObject({ tracking: 'jump', unilateral: true });
    await createExercise(db, { name: 'Sled Push', tracking: 'carry', unilateral: false });
    const other = new TrackerDB(`test-${++dbCount}`);
    await startup(other, storageWith({ ...legacy, workouts: [{ id: 'b', date: '2026-10-01', exercises: [{ name: 'Box Jump', sets: [{ reps: 5, weight: 0 }] }] }] }));
    expect((await other.exercises.get('box-jump'))?.tracking).toBe('strength'); // their own, untouched
  });

  it('creates custom exercises, returning the existing one for a duplicate name', async () => {
    const ex = await createExercise(db, { name: 'Banded Jump', tracking: 'jump', unilateral: false });
    expect(ex).toMatchObject({ id: 'banded-jump', tracking: 'jump', isCustom: true });
    const again = await createExercise(db, { name: 'banded jump', tracking: 'strength', unilateral: false });
    expect(again.tracking).toBe('jump');
  });

  it('remembers rest times per exercise', async () => {
    await updateExercise(db, 'squat', { restSec: 240 });
    expect((await db.exercises.get('squat'))?.restSec).toBe(240);
  });

  it('hides deleted sessions everywhere', async () => {
    await deleteSession(db, 'w2');
    expect((await listSessions(db)).map((s) => s.id)).toEqual(['w1']);
    expect((await lastPerformance(db, 'squat'))?.date).toBe('2026-10-17');
  });

  it('charts the heaviest set per day', async () => {
    expect(bestByDate(await listSessions(db), 'squat', metricFor('strength', 'kg'))).toEqual([
      { date: '2026-10-17', value: 130 },
      { date: '2026-10-24', value: 140 }
    ]);
  });

  it('fills in default settings for older saved settings', async () => {
    await db.meta.put({ key: 'settings', value: { unit: 'lb' } });
    expect(await getSettings(db)).toMatchObject({ unit: 'lb', restSound: true, equipment: { kg: { bar: 20 }, lb: { bar: 45 } } });
  });

  it('edits templates', async () => {
    const [t] = await listTemplates(db);
    await saveTemplate(db, { id: t.id, name: 'Legs A', exerciseNames: ['Squat', 'Leg Curl'] });
    const [t2] = await listTemplates(db);
    expect(t2).toMatchObject({ id: t.id, name: 'Legs A', exercises: [{ exerciseId: 'squat' }, { exerciseId: 'leg-curl' }] });
  });

  it('adds new templates at the end of the list', async () => {
    await saveTemplate(db, { name: 'Upper', exerciseNames: ['Bench Press'] });
    expect((await listTemplates(db)).map((t) => t.name)).toEqual(['Legs', 'Upper']);
  });
});

describe('backup', () => {
  beforeEach(() => startup(db, storageWith(legacy)));

  it('round-trips through export and import', async () => {
    await setUnit(db, 'lb');
    const file = JSON.stringify(await exportAll(db));
    const other = new TrackerDB(`test-${++dbCount}`);
    await startup(other, storageWith(null));
    expect(await importAll(other, file)).toEqual({ sessions: 2 });
    expect(await listSessions(other)).toEqual(await listSessions(db));
    expect((await getSettings(other)).unit).toBe('lb');
  });

  it('imports an old-format backup file', async () => {
    const other = new TrackerDB(`test-${++dbCount}`);
    await startup(other, storageWith(null));
    await importAll(other, JSON.stringify(legacy));
    expect((await listSessions(other)).map((s) => s.id)).toEqual(['w2', 'w1']);
  });

  it('rejects files that are not backups', async () => {
    await expect(importAll(db, '{"a":1}')).rejects.toThrow();
    await expect(importAll(db, JSON.stringify({ app: 'workout-tracker', format: 99, sessions: [], exercises: [] }))).rejects.toThrow(/newer/);
    expect(await listSessions(db)).toHaveLength(2);
  });
});
