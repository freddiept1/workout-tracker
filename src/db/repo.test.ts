import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { topSetsByDate } from '../lib/progress';
import { TrackerDB } from './db';
import { LEGACY_KEY } from './migrateLegacy';
import {
  deleteSession, exportAll, finishDraft, getDraft, getSettings, importAll, lastPerformance,
  listSessions, listTemplates, saveTemplate, setUnit, startup
} from './repo';
import type { Draft } from './types';

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

  const draft = (sets: [string, string][], name = 'squat'): Draft => ({
    unit: 'kg', date: '2026-10-31', startedAt: '2026-10-31T10:00:00.000Z', templateId: null, notes: ' ',
    exercises: [
      { id: 'e1', name, sets: sets.map(([reps, weight], i) => ({ id: `s${i}`, type: 'working', reps, weight })) },
      { id: 'e2', name: '', sets: [{ id: 'x', type: 'working', reps: '5', weight: '50' }] }
    ]
  });

  it('shows the most recent session as "last time"', async () => {
    const last = await lastPerformance(db, 'squat');
    expect(last?.date).toBe('2026-10-24');
    expect(last?.sets.map((s) => s.weightKg)).toEqual([135, 140]);
  });

  it('saves a finished workout, dropping empty sets and unnamed exercises', async () => {
    const s = await finishDraft(db, draft([['5', '142,5'], ['', '100'], ['3', '']]));
    expect(s?.exercises).toHaveLength(1);
    expect(s?.exercises[0].exerciseId).toBe('squat');
    expect(s?.exercises[0].sets.map((x) => [x.reps, x.weightKg])).toEqual([[5, 142.5], [3, 0]]);
    expect(s?.source).toBe('live');
    expect(await getDraft(db)).toBeNull();
    expect((await lastPerformance(db, 'squat'))?.date).toBe('2026-10-31');
  });

  it('creates new exercises on the fly', async () => {
    await finishDraft(db, draft([['10', '60']], 'Hack Squat'));
    expect((await db.exercises.get('hack-squat'))?.name).toBe('Hack Squat');
  });

  it('saves nothing when no set has reps', async () => {
    expect(await finishDraft(db, draft([['', '100']]))).toBeNull();
    expect(await listSessions(db)).toHaveLength(2);
  });

  it('stores pounds as kg', async () => {
    const s = await finishDraft(db, { ...draft([['5', '225']]), unit: 'lb' });
    expect(s?.exercises[0].sets[0].weightKg).toBeCloseTo(102.058, 3);
  });

  it('hides deleted sessions everywhere', async () => {
    await deleteSession(db, 'w2');
    expect((await listSessions(db)).map((s) => s.id)).toEqual(['w1']);
    expect((await lastPerformance(db, 'squat'))?.date).toBe('2026-10-17');
  });

  it('charts the heaviest set per day', async () => {
    expect(topSetsByDate(await listSessions(db), 'squat')).toEqual([
      { date: '2026-10-17', weightKg: 130 },
      { date: '2026-10-24', weightKg: 140 }
    ]);
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
