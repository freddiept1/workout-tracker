import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { TrackerDB } from '../db/db';
import { LEGACY_KEY } from '../db/migrateLegacy';
import {
  deleteSession, exportAll, getSettings, importAll, listExercises, listMetrics, listPrograms, listSessions, listTemplates,
  saveBodyweight, saveProgram, startup, updateExercise, updateSettings
} from '../db/repo';
import type { Program } from '../db/types';
import { athleteData } from './athleteData';
import { AccountMismatchError, resetPushCursor, syncAthletes, syncOnce, type Remote } from './engine';
import { fromRow, resolve, toRow, type CloudRow } from './merge';

/** An in-memory stand-in for the Supabase `records` table, with the same last-write-wins trigger. */
class FakeCloud implements Remote {
  rows = new Map<string, CloudRow>();
  tick = 0;
  pushes = 0;
  async push(rows: CloudRow[]) {
    this.pushes++;
    for (const r of rows) {
      const key = `${r.athlete_id}/${r.kind}/${r.id}`;
      const old = this.rows.get(key);
      if (old && Date.parse(r.updated_at) <= Date.parse(old.updated_at)) continue;
      this.rows.set(key, structuredClone({ ...r, synced_at: new Date(Date.UTC(2026, 0, 1, 0, 0, ++this.tick)).toISOString() }));
    }
  }
  async pull(since: string | null, athleteId: string) {
    return [...this.rows.values()].filter((r) => r.athlete_id === athleteId && (!since || r.synced_at! > since)).sort((a, b) => (a.synced_at! < b.synced_at! ? -1 : 1)).map((r) => structuredClone(r));
  }
}

const legacy = {
  version: 2, settings: { unit: 'kg' }, draft: null, templates: [{ id: 't1', name: 'Day A', exercises: ['Squat', 'Bench Press'] }],
  workouts: [
    { id: 'w1', date: '2026-10-26', exercises: [{ name: 'Squat', sets: [{ reps: 3, weight: 180 }] }] },
    { id: 'w2', date: '2026-11-02', exercises: [{ name: 'Bench Press', sets: [{ reps: 5, weight: 110 }] }] }
  ]
};
const storage = (data: unknown) => ({ getItem: (k: string) => (k === LEGACY_KEY && data ? JSON.stringify(data) : null) });

const UID = '11111111-1111-1111-1111-111111111111';
let n = 0;
let cloud: FakeCloud;
let phone: TrackerDB;
let laptop: TrackerDB;
beforeEach(async () => {
  cloud = new FakeCloud();
  phone = new TrackerDB(`sync-phone-${++n}`);
  laptop = new TrackerDB(`sync-laptop-${n}`);
  await startup(phone, storage(legacy));
  await startup(laptop, storage(null)); // a fresh install with starter templates
});

const sync = (db: TrackerDB) => syncOnce(db, cloud, UID);
const pause = () => new Promise((r) => setTimeout(r, 5)); // so edits get later timestamps

describe('merge rules', () => {
  it('maps "me" to the account id and back', () => {
    const row = toRow('sessions', { id: 's1', athleteId: 'me', updatedAt: '2026-11-01T00:00:00Z', deletedAt: null }, UID);
    expect(row).toMatchObject({ athlete_id: UID, kind: 'sessions', id: 's1', data: { athleteId: UID } });
    expect(fromRow(row, UID).athleteId).toBe('me');
    expect(toRow('exercises', { id: 'squat', updatedAt: '2026-11-01T00:00:00Z' }, UID).data).not.toHaveProperty('athleteId');
  });

  it('keeps the newer copy', () => {
    const older = { id: 'x', updatedAt: '2026-11-01T00:00:00Z', name: 'old' };
    const newer = { id: 'x', updatedAt: '2026-11-02T00:00:00Z', name: 'new' };
    expect(resolve('sessions', older, newer, 'now')).toBe(newer);
    expect(resolve('sessions', newer, older, 'now')).toBeNull();
    expect(resolve('sessions', undefined, older, 'now')).toBe(older);
  });

  it('merges program logs slot by slot', () => {
    const base = { id: 'p', name: 'Block', updatedAt: '2026-11-01T00:00:00Z' };
    const ticked = { ...base, log: { w1d1: { sessionId: 's1', date: '2026-11-01', skipped: false } } };
    const edited = { ...base, name: 'Block v2', updatedAt: '2026-11-02T00:00:00Z', log: {} };
    const merged = resolve('programs', ticked, edited, '2026-11-03T00:00:00.000Z')!;
    expect(merged).toMatchObject({ name: 'Block v2', updatedAt: '2026-11-03T00:00:00.000Z' });
    expect(Object.keys(merged.log as object)).toEqual(['w1d1']);
  });
});

describe('two devices', () => {
  it('copies the phone’s training to a new device without duplicating anything', async () => {
    await sync(phone);
    await sync(laptop);
    expect((await listSessions(laptop)).map((s) => s.id)).toEqual(['w2', 'w1']);
    expect((await listTemplates(laptop)).map((t) => t.name)).toEqual(['Day A']); // starter templates dropped
    expect((await listExercises(laptop)).length).toBe((await listExercises(phone)).length);
    await sync(phone);
    expect((await listTemplates(phone)).map((t) => t.name)).toEqual(['Day A']);
  });

  it('keeps your exercise edits when a fresh device joins', async () => {
    await pause();
    await updateExercise(phone, 'squat', { restSec: 240 });
    await sync(phone);
    await sync(laptop);
    await sync(phone);
    expect((await phone.exercises.get('squat'))!.restSec).toBe(240);
    expect((await laptop.exercises.get('squat'))!.restSec).toBe(240);
  });

  it('syncs new work and deletions both ways', async () => {
    await sync(phone);
    await sync(laptop);
    await pause();
    await saveBodyweight(laptop, '2026-11-07', 93.4);
    await deleteSession(laptop, 'w1');
    await sync(laptop);
    await sync(phone);
    expect((await listSessions(phone)).map((s) => s.id)).toEqual(['w2']);
    expect((await phone.sessions.get('w1'))!.deletedAt).toBeTruthy(); // soft-deleted, still recoverable
    expect((await listMetrics(phone)).map((m) => m.bodyweightKg)).toEqual([93.4]);
  });

  it('the newer edit wins when both devices change the same thing', async () => {
    await sync(phone);
    await sync(laptop);
    await pause();
    await updateSettings(phone, { unit: 'lb' });
    await pause();
    await updateSettings(laptop, { unit: 'kg', bodyweightReminder: 'daily' });
    await sync(phone);
    await sync(laptop);
    await sync(phone);
    expect(await getSettings(phone)).toMatchObject({ unit: 'kg', bodyweightReminder: 'daily' });
    expect(await getSettings(laptop)).toMatchObject({ unit: 'kg', bodyweightReminder: 'daily' });
  });

  it('a fresh device takes the account’s settings', async () => {
    await updateSettings(phone, { unit: 'lb' });
    await sync(phone);
    await sync(laptop);
    expect((await getSettings(laptop)).unit).toBe('lb');
  });

  it('never loses a ticked program day to an edit made elsewhere', async () => {
    const p = await saveProgram(phone, { name: 'Block', weeks: 4, deloadEvery: 0, maxes: {}, days: [{ id: 'a', name: 'Day A', exercises: [] }] });
    await sync(phone);
    await sync(laptop);
    await pause();
    await phone.programs.update(p.id, { log: { w1d1: { sessionId: 'w2', date: '2026-11-02', skipped: false } }, updatedAt: new Date().toISOString() });
    await pause();
    await laptop.programs.update(p.id, { name: 'Block (edited)', updatedAt: new Date().toISOString() });
    await sync(laptop);
    await sync(phone);
    await sync(laptop);
    for (const db of [phone, laptop]) {
      const prog = (await listPrograms(db))[0] as Program;
      expect(prog.name).toBe('Block (edited)');
      expect(Object.keys(prog.log)).toEqual(['w1d1']);
    }
  });

  it('only sends what changed since last time', async () => {
    await sync(phone);
    const before = cloud.rows.size;
    const second = await sync(phone);
    expect(second.pushed).toBe(0);
    expect(cloud.rows.size).toBe(before);
  });

  it('refuses to mix another account into this phone’s data', async () => {
    await sync(phone);
    await expect(syncOnce(phone, cloud, '22222222-2222-2222-2222-222222222222')).rejects.toBeInstanceOf(AccountMismatchError);
  });

  it('gives a coach a read-only copy of a client’s training, and drops it when they leave', async () => {
    const CLIENT = '33333333-3333-3333-3333-333333333333';
    const client = new TrackerDB(`sync-client-${n}`);
    await startup(client, storage(legacy));
    await syncOnce(client, cloud, CLIENT); // the client's own sync
    await sync(phone); // the coach's own sync
    expect(await syncAthletes(phone, cloud, [CLIENT])).toBeGreaterThan(0);
    const data = athleteData(await phone.athleteCache.where('athleteId').equals(CLIENT).toArray(), new Map());
    expect(data.sessions.map((s) => s.id)).toEqual(['w2', 'w1']);
    expect(data.sessions[0].athleteId).toBe(CLIENT); // never 'me' on the coach's phone
    expect(await listSessions(phone)).toHaveLength(2); // the coach's own sessions are separate
    const pushedBefore = cloud.rows.size;
    await sync(phone);
    expect(cloud.rows.size).toBe(pushedBefore); // client copies are never pushed as the coach's

    await pause();
    await deleteSession(client, 'w1');
    await syncOnce(client, cloud, CLIENT);
    await syncAthletes(phone, cloud, [CLIENT]);
    const after = athleteData(await phone.athleteCache.where('athleteId').equals(CLIENT).toArray(), new Map());
    expect(after.sessions.map((s) => s.id)).toEqual(['w2']);

    await syncAthletes(phone, cloud, []);
    expect(await phone.athleteCache.count()).toBe(0);
  });

  it('re-sends everything after a backup import, without overwriting newer cloud copies', async () => {
    await sync(phone);
    const backup = JSON.stringify(await exportAll(phone));
    await pause();
    await updateSettings(phone, { unit: 'lb' });
    await sync(phone);
    await importAll(phone, backup);
    await resetPushCursor(phone);
    await sync(phone);
    expect(cloud.rows.size).toBeGreaterThan(0);
    expect([...cloud.rows.values()].find((r) => r.kind === 'settings')!.data.unit).toBe('lb');
  });
});
