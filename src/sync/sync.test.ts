import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { TrackerDB } from '../db/db';
import { LEGACY_KEY } from '../db/migrateLegacy';
import {
  addComment, assignProgram, commentsSeen, deleteSession, exportAll, finishDraft, getSettings, importAll, listComments, listExercises, listMetrics, listPrograms, listSessions, listTemplates,
  saveBodyweight, saveProgram, skipProgramSlot, startup, updateExercise, updateSettings
} from '../db/repo';
import type { Draft, Program } from '../db/types';
import { blankSet } from '../lib/draft';
import { unreadBySession } from '../lib/comments';
import { loadAthletes } from './athleteData';
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
  /** The cloud as one signed-in coach sees it: like the real security rules, it refuses records for non-clients. */
  as(uid: string, clients: () => string[]): Remote {
    return {
      push: async (rows) => {
        for (const r of rows) {
          const ok = r.athlete_id === uid || (clients().includes(r.athlete_id) && ['sessions', 'programs', 'exercises', 'comments'].includes(r.kind));
          if (!ok) throw new Error('new row violates row-level security policy for table "records"');
        }
        await this.push(rows);
      },
      pull: (since, athleteId) => this.pull(since, athleteId === uid || clients().includes(athleteId) ? athleteId : 'nobody')
    };
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

  describe('coach mode', () => {
    const CLIENT = '33333333-3333-3333-3333-333333333333';
    const clientLegacy = {
      version: 2, settings: { unit: 'kg' }, draft: null, templates: [],
      workouts: [
        { id: 'c1', date: '2026-10-27', exercises: [{ name: 'Squat', sets: [{ reps: 5, weight: 80 }] }] },
        { id: 'c2', date: '2026-11-03', exercises: [{ name: 'Squat', sets: [{ reps: 5, weight: 85 }] }] }
      ]
    };
    let client: TrackerDB;
    const clientSync = () => syncOnce(client, cloud, CLIENT);
    let linked: string[] = [CLIENT];
    const coach = () => cloud.as(UID, () => linked);
    // Same order as the app: own sync (sending only current clients' records), then the clients'.
    const coachSync = async () => { await syncOnce(phone, coach(), UID, undefined, linked); await syncAthletes(phone, coach(), linked); };
    beforeEach(async () => {
      client = new TrackerDB(`sync-client-${n}`);
      await startup(client, storage(clientLegacy));
      await saveBodyweight(client, '2026-11-03', 81.2);
      await clientSync();
      await coachSync();
    });

    it('keeps a client’s training apart from the coach’s own', async () => {
      expect((await listSessions(phone)).map((s) => s.id)).toEqual(['w2', 'w1']); // still just the coach's
      expect((await listSessions(phone, CLIENT)).map((s) => s.id)).toEqual(['c2', 'c1']);
      expect((await listMetrics(phone, undefined, CLIENT)).map((m) => m.bodyweightKg)).toEqual([81.2]);
      const data = (await loadAthletes(phone, [CLIENT], new Map())).get(CLIENT)!;
      expect(data.sessions.map((s) => s.athleteId)).toEqual([CLIENT, CLIENT]); // never 'me' on the coach's phone
      expect((await exportAll(phone)).sessions.map((s) => s.id).sort()).toEqual(['w1', 'w2']); // backups are yours only
      const before = cloud.rows.size;
      await coachSync();
      expect(cloud.rows.size).toBe(before); // nothing of the client's is sent back as the coach's
    });

    it('a session logged in person lands in the client’s account', async () => {
      const draft: Draft = {
        v: 2, unit: 'kg', date: '2026-11-07', startedAt: '2026-11-07T10:00:00Z', templateId: null, notes: '', rest: null, athleteId: CLIENT,
        exercises: [{ id: 'x', exerciseId: 'squat', supersetGroup: null, restSec: null, tempo: '', notes: '', sets: [{ ...blankSet(undefined), weight: '90', reps: '5', done: true }] }]
      };
      const s = await finishDraft(phone, draft);
      expect(s!.athleteId).toBe(CLIENT);
      expect(await listSessions(phone)).toHaveLength(2); // not in the coach's history
      await coachSync();
      expect([...cloud.rows.values()].find((r) => r.id === s!.id)?.athlete_id).toBe(CLIENT);
      await clientSync();
      expect((await listSessions(client))[0]).toMatchObject({ id: s!.id, athleteId: 'me' });
    });

    it('an assigned program reaches the client, and their ticks come back', async () => {
      const mine = await saveProgram(phone, { name: 'Block', weeks: 2, deloadEvery: 0, maxes: { squat: 200 }, days: [{ id: 'a', name: 'Day A', exercises: [] }] });
      const copy = await assignProgram(phone, mine.id, { athleteId: CLIENT, coachId: UID, coachName: 'Freddie' });
      expect(copy).toMatchObject({ athleteId: CLIENT, assignedBy: UID, maxes: {}, log: {} });
      expect((await listPrograms(phone)).map((p) => p.id)).toEqual([mine.id]); // the coach's own list is unchanged
      await coachSync();
      await clientSync();
      const theirs = (await listPrograms(client))[0];
      expect(theirs).toMatchObject({ id: copy.id, athleteId: 'me', coachName: 'Freddie' });

      await pause();
      await skipProgramSlot(client, copy.id, 'w1d1', '2026-11-07');
      await clientSync();
      await coachSync();
      expect(Object.keys((await listPrograms(phone, CLIENT))[0].log)).toEqual(['w1d1']);
    });

    it('comments on a client’s session go both ways', async () => {
      const session = (await listSessions(phone, CLIENT))[0];
      await addComment(phone, session, 'Great bar speed on the last set', { id: UID, name: 'Freddie' });
      await coachSync();
      await clientSync();
      const theirs = await listComments(client);
      expect(theirs).toMatchObject([{ sessionId: session.id, athleteId: 'me', authorId: UID, body: 'Great bar speed on the last set' }]);
      expect(unreadBySession(theirs, await commentsSeen(client), CLIENT).get(session.id)).toBe(1);

      await addComment(client, { id: session.id, athleteId: 'me' }, 'Felt easy, go up next week?', { id: CLIENT, name: 'Jess' });
      await clientSync();
      await coachSync();
      const onCoach = await listComments(phone, CLIENT);
      expect(onCoach.map((c) => c.body)).toEqual(['Great bar speed on the last set', 'Felt easy, go up next week?']);
      expect(unreadBySession(onCoach, await commentsSeen(phone), UID).get(session.id)).toBe(1); // the reply is new to the coach
      expect(await listComments(phone)).toEqual([]); // not mixed into the coach's own
    });

    it('keeps syncing when a client leaves while the coach’s phone still has their records to send', async () => {
      // The coach logs a session for the client and edits their program, then the client leaves before it's sent.
      const program = await assignProgram(phone, (await saveProgram(phone, { name: 'B', weeks: 1, deloadEvery: 0, maxes: {}, days: [{ id: 'a', name: 'A', exercises: [] }] })).id, { athleteId: CLIENT, coachId: UID, coachName: null });
      await coachSync();
      await pause();
      await phone.programs.update(program.id, { name: 'B2', updatedAt: new Date().toISOString() });
      linked = [];
      await expect(coachSync()).resolves.toBeUndefined(); // no "row-level security" failure
      expect(await listPrograms(phone, CLIENT)).toEqual([]); // and their copies are gone
      linked = [CLIENT];
    });

    it('drops a client’s copies when they stop being a client', async () => {
      await syncAthletes(phone, cloud, []);
      expect(await listSessions(phone, CLIENT)).toEqual([]);
      expect(await listMetrics(phone, undefined, CLIENT)).toEqual([]);
      expect(await phone.athleteCache.count()).toBe(0);
      expect(await listSessions(phone)).toHaveLength(2);
    });

    it('never lets a client record replace one of the coach’s with the same id', async () => {
      const other = new TrackerDB(`sync-client2-${n}`);
      const OTHER = '44444444-4444-4444-4444-444444444444';
      await startup(other, storage(legacy)); // same session ids (w1, w2) as the coach's
      await syncOnce(other, cloud, OTHER);
      await syncAthletes(phone, cloud, [CLIENT, OTHER]);
      expect((await phone.sessions.get('w1'))!.athleteId).toBe('me');
    });
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
