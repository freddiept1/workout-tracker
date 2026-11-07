import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { TrackerDB } from './db';
import { LEGACY_KEY } from './migrateLegacy';
import {
  checkinSkippedOn, deleteMetric, exportAll, getSettings, importAll, listMetrics, listSessions, saveBodyweight, saveCheckin,
  skipCheckin, startup
} from './repo';

const legacy = {
  version: 2, settings: { unit: 'kg' }, draft: null, templates: [],
  workouts: [{ id: 'w1', date: '2026-10-19', exercises: [{ name: 'Squat', sets: [{ reps: 5, weight: 140 }] }] }]
};
const storage = (data: unknown) => ({ getItem: (k: string) => (k === LEGACY_KEY && data ? JSON.stringify(data) : null) });

let db: TrackerDB;
let n = 0;
beforeEach(async () => {
  db = new TrackerDB(`metrics-${++n}`);
  await startup(db, storage(legacy));
});

describe('bodyweight', () => {
  it('keeps one weigh-in per day: logging again updates it', async () => {
    const first = await saveBodyweight(db, '2026-11-02', 93.4);
    const again = await saveBodyweight(db, '2026-11-02', 93.1);
    await saveBodyweight(db, '2026-11-03', 92.9);
    expect(again.id).toBe(first.id);
    expect(again.createdAt).toBe(first.createdAt);
    expect((await listMetrics(db, 'bodyweight')).map((m) => [m.date, m.bodyweightKg])).toEqual([['2026-11-02', 93.1], ['2026-11-03', 92.9]]);
  });

  it('rejects silly numbers', async () => {
    await expect(saveBodyweight(db, '2026-11-02', 0)).rejects.toThrow();
    await expect(saveBodyweight(db, '2026-11-02', 900)).rejects.toThrow();
    await expect(saveBodyweight(db, '2026-11-02', NaN)).rejects.toThrow();
  });

  it('soft-deletes, and a new weigh-in that day comes back', async () => {
    const m = await saveBodyweight(db, '2026-11-02', 93);
    await deleteMetric(db, m.id);
    expect(await listMetrics(db, 'bodyweight')).toEqual([]);
    await saveBodyweight(db, '2026-11-02', 92.5);
    expect((await listMetrics(db, 'bodyweight')).map((x) => x.bodyweightKg)).toEqual([92.5]);
  });
});

describe('check-ins', () => {
  it('merges answers given at different times of the same day', async () => {
    await saveCheckin(db, '2026-11-02', { sleep: 4 });
    await saveCheckin(db, '2026-11-02', { energy: 2, soreness: 3 });
    await saveCheckin(db, '2026-11-02', { sleep: 5 });
    const list = await listMetrics(db, 'checkin');
    expect(list).toHaveLength(1);
    expect(list[0].checkin).toEqual({ sleep: 5, energy: 2, soreness: 3, stress: null });
  });

  it('remembers the day it was skipped', async () => {
    expect(await checkinSkippedOn(db)).toBeNull();
    await skipCheckin(db, '2026-11-02');
    expect(await checkinSkippedOn(db)).toBe('2026-11-02');
  });

  it('defaults the bodyweight reminder to weekly', async () => {
    expect((await getSettings(db)).bodyweightReminder).toBe('weekly');
  });
});

describe('backup', () => {
  it('exports and imports metrics', async () => {
    await saveBodyweight(db, '2026-11-02', 93.4);
    await saveCheckin(db, '2026-11-02', { sleep: 3, energy: 4, soreness: 2, stress: 1 });
    const file = await exportAll(db);
    expect(file.format).toBe(6);
    const other = new TrackerDB(`metrics-${++n}`);
    await startup(other, storage(null));
    await importAll(other, JSON.stringify(file));
    expect(await listMetrics(other)).toEqual(await listMetrics(db));
  });

  it('imports an older backup with no metrics', async () => {
    const file = await exportAll(db);
    delete (file as { metrics?: unknown }).metrics;
    const other = new TrackerDB(`metrics-${++n}`);
    await startup(other, storage(null));
    await importAll(other, JSON.stringify({ ...file, format: 5 }));
    expect(await listMetrics(other)).toEqual([]);
    expect(await listSessions(other)).toHaveLength(1);
  });
});

describe('database upgrade', () => {
  it('adds the metrics table to a version 2 database without touching its data', async () => {
    const name = `metrics-upgrade-${++n}`;
    const v2 = new Dexie(name);
    v2.version(1).stores({ exercises: 'id, name, parentId, updatedAt', sessions: 'id, date, athleteId, *exerciseIds, updatedAt', templates: 'id, athleteId, order, updatedAt', meta: 'key' });
    v2.version(2).stores({ programs: 'id, athleteId, status, updatedAt' });
    await v2.table('sessions').put({ id: 'old', athleteId: 'me', date: '2026-10-01', exerciseIds: [], exercises: [], deletedAt: null, createdAt: '', updatedAt: '' });
    await v2.table('programs').put({ id: 'p1', athleteId: 'me', status: 'active', updatedAt: '' });
    await v2.table('meta').put({ key: 'settings', value: { unit: 'lb', restSound: true } });
    v2.close();

    const upgraded = new TrackerDB(name);
    expect(await upgraded.sessions.get('old')).toBeTruthy();
    expect(await upgraded.programs.get('p1')).toBeTruthy();
    expect(await upgraded.metrics.count()).toBe(0);
    expect(upgraded.verno).toBe(3);
    const settings = await getSettings(upgraded);
    expect(settings.unit).toBe('lb');
    expect(settings.bodyweightReminder).toBe('weekly'); // missing in old settings, filled from defaults
  });
});
