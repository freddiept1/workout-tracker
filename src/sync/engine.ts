// The sync engine: pull what changed in the cloud, merge it in, then push what changed here.
// The phone's database stays the source of truth; nothing local is ever hard-deleted by a sync.
import type { TrackerDB } from '../db/db';
import { applyLibrary } from '../db/seed';
import type { CachedRecord, MigrationInfo, Settings } from '../db/types';
import { ME } from '../db/types';
import { nowIso } from '../lib/ids';
import { fromRow, resolve, SYNC_TABLES, toRow, type CloudRow, type LocalRecord, type SyncKind, type SyncTable } from './merge';

/** The cloud side (Supabase in the app, an in-memory fake in tests). */
export interface Remote {
  /** Save rows; the server keeps whichever copy has the newer `updated_at`. */
  push(rows: CloudRow[]): Promise<void>;
  /** One athlete's rows changed after `since` (server time), oldest first; all of them when `since` is null. */
  pull(since: string | null, athleteId: string): Promise<CloudRow[]>;
}

export interface SyncState {
  uid: string;
  /** Local edits at or after this time still need pushing (null: push everything). */
  pushedAt: string | null;
  /** The server's `synced_at` of the newest row pulled. */
  pulledAt: string | null;
  lastSyncAt: string | null;
  /** Coach mode: per-client `synced_at` cursors for the read-only client copies. */
  athletes?: Record<string, string | null>;
}

export class AccountMismatchError extends Error {
  constructor() {
    super('This phone has training data from a different account. Sign in with that account, or remove the data from this phone first.');
  }
}

// Writes made by a sync shouldn't schedule another sync.
let applyingRemote = false;
export const isApplyingRemote = () => applyingRemote;

export async function getSyncState(db: TrackerDB): Promise<SyncState | null> {
  return ((await db.meta.get('sync'))?.value as SyncState | undefined) ?? null;
}

/** After a backup import: push everything again next time (the cloud keeps whichever is newer). */
export async function resetPushCursor(db: TrackerDB) {
  const state = await getSyncState(db);
  // The import replaced this phone's tables, clients' copies included: fetch those again too.
  if (state) await db.meta.put({ key: 'sync', value: { ...state, pushedAt: null, athletes: {} } });
}

/** Forget the link to a cloud account (used when local data is removed on sign-out). */
export async function forgetSync(db: TrackerDB) {
  await db.meta.delete('sync');
}

const OVERLAP_MS = 2 * 60_000; // re-read the last 2 minutes each time, in case of late commits

/**
 * `clients`: the coach's currently linked clients. Only their sessions/programs written on this
 * phone are sent; copies belonging to anyone else (e.g. a client who just left) never are, so a
 * departed client can't make the whole sync fail.
 */
export async function syncOnce(db: TrackerDB, remote: Remote, uid: string, clock: () => string = nowIso, clients: string[] = []): Promise<{ pulled: number; pushed: number }> {
  const state = await getSyncState(db);
  if (state && state.uid !== uid) throw new AccountMismatchError();
  const first = !state;
  const started = clock();

  // 1. Pull.
  const since = state?.pulledAt ? new Date(Date.parse(state.pulledAt) - OVERLAP_MS).toISOString() : null;
  const rows = (await remote.pull(since, uid)).filter((r) => r.athlete_id === uid);
  if (first && rows.length && (await isFreshDevice(db))) await dropStarterTemplates(db);
  const { applied, changed } = await applyRows(db, rows, uid, clock);

  // 2. Push.
  if (first) await stampSettings(db, new Date(Date.parse(started) - 1).toISOString()); // just before this sync's cut-off
  const out = await localChanges(db, uid, state?.pushedAt ?? null, applied, new Set(clients));
  if (out.length) await remote.push(out);

  const pulledAt = rows.reduce<string | null>((max, r) => (r.synced_at && (!max || r.synced_at > max) ? r.synced_at : max), state?.pulledAt ?? null);
  await db.meta.put({ key: 'sync', value: { ...state, uid, pushedAt: started, pulledAt, lastSyncAt: clock() } satisfies SyncState });
  return { pulled: changed, pushed: out.length };
}

/** A device that has only what a fresh install creates: no training logged, starter templates untouched. */
async function isFreshDevice(db: TrackerDB): Promise<boolean> {
  const info = (await db.meta.get('migration'))?.value as MigrationInfo | undefined;
  if (info?.from !== 'fresh') return false;
  const mine = (t: typeof db.sessions | typeof db.programs | typeof db.metrics) => t.where('athleteId').equals(ME).count();
  const [sessions, programs, metrics] = await Promise.all([mine(db.sessions), mine(db.programs), mine(db.metrics)]);
  return sessions + programs + metrics === 0;
}

/** On a fresh device joining an account that has data, its starter templates would only be duplicates. */
async function dropStarterTemplates(db: TrackerDB) {
  const info = (await db.meta.get('migration'))?.value as MigrationInfo;
  const starters = await db.templates.filter((t) => t.createdAt === info.at && t.updatedAt === info.at).primaryKeys();
  await db.templates.bulkDelete(starters); // never synced, so nothing to tell the cloud
}

async function applyRows(db: TrackerDB, rows: CloudRow[], uid: string, clock: () => string) {
  const applied = new Set<string>(); // taken as-is from the cloud, so no need to push back
  let changed = 0;
  const byKind = new Map<SyncKind, CloudRow[]>();
  for (const r of rows) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);

  applyingRemote = true;
  try {
    for (const table of SYNC_TABLES) {
      const list = byKind.get(table);
      if (!list?.length) continue;
      const t = db.table(table);
      await db.transaction('rw', t, async () => {
        const locals = (await t.bulkGet(list.map((r) => r.id))) as (LocalRecord | undefined)[];
        const puts: LocalRecord[] = [];
        list.forEach((row, i) => {
          const remote = fromRow(row, uid);
          // Never let one athlete's record replace another's (ids are random, but be sure).
          if (locals[i] && (locals[i]!.athleteId ?? null) !== (remote.athleteId ?? null)) return;
          const keep = resolve(table, locals[i], remote, clock());
          if (!keep) return;
          puts.push(keep);
          if (keep === remote) applied.add(`${table}:${row.id}`);
        });
        if (puts.length) await t.bulkPut(puts);
        changed += puts.length;
      });
      // An exercise from an older app version may lack tags this version's library fills in.
      if (table === 'exercises') await applyLibrary(db, true);
    }

    const settingsRow = byKind.get('settings')?.at(-1);
    if (settingsRow) {
      const local = await db.meta.get('settings');
      const remote = fromRow(settingsRow, uid);
      if (Date.parse(remote.updatedAt) > (Date.parse(local?.updatedAt ?? '') || 0)) {
        const { id: _id, updatedAt, deletedAt: _d, ...value } = remote;
        await db.meta.put({ key: 'settings', value: value as unknown as Settings, updatedAt });
        applied.add('settings:settings');
        changed++;
      }
    }
  } finally {
    applyingRemote = false;
  }
  return { applied, changed };
}

/** Settings saved before sync existed have no timestamp; give them one so they can sync. */
async function stampSettings(db: TrackerDB, now: string) {
  const row = await db.meta.get('settings');
  if (row && !row.updatedAt) await db.meta.put({ ...row, updatedAt: now });
}

async function localChanges(db: TrackerDB, uid: string, since: string | null, skip: Set<string>, clients: Set<string>): Promise<CloudRow[]> {
  const out: CloudRow[] = [];
  for (const table of SYNC_TABLES) {
    const t = db.table(table);
    const records = (since ? await t.where('updatedAt').aboveOrEqual(since).toArray() : await t.toArray()) as LocalRecord[];
    for (const r of records) {
      if (skip.has(`${table}:${r.id}`)) continue;
      // A coach's phone holds copies of clients' records; only the kinds a coach writes go back up.
      if (r.athleteId && r.athleteId !== ME && (!COACH_WRITES.has(table) || !clients.has(r.athleteId))) continue;
      out.push(toRow(table as SyncTable, r, uid));
    }
  }
  const settings = await db.meta.get('settings');
  if (settings?.updatedAt && (!since || settings.updatedAt >= since) && !skip.has('settings:settings')) {
    out.push(toRow('settings', { ...(settings.value as object), id: 'settings', updatedAt: settings.updatedAt, deletedAt: null }, uid));
  }
  return out;
}

/** The kinds of a client's records their coach may write (the cloud rules say the same). */
export const COACH_WRITES = new Set<string>(['sessions', 'programs', 'exercises', 'comments']);
/** A client's records kept in the normal tables (athleteId = their account id), so every screen works for them. */
const CLIENT_TABLES = new Set<string>(['sessions', 'programs', 'metrics', 'templates', 'comments']);

/**
 * Coach mode: send what the coach wrote for these clients, then fetch what changed in their
 * accounts. Sessions, programs and metrics go into the normal tables under the client's id;
 * their exercises and settings go into `athleteCache`. A client no longer in the list is
 * removed from this phone. Each client has their own cursor, so a new client arrives in full.
 */
export async function syncAthletes(db: TrackerDB, remote: Remote, athleteIds: string[], clock: () => string = nowIso): Promise<number> {
  const state = await getSyncState(db);
  if (!state) return 0;
  const uid = state.uid;
  const cursors = { ...state.athletes };
  let changed = 0;

  // Exercises copied to a client with an assigned program.
  const dirty = (await db.athleteCache.toArray()).filter((r) => r.dirty && athleteIds.includes(r.athleteId));
  if (dirty.length) {
    await remote.push(dirty.map((r) => toRow(r.kind as SyncKind, { ...(r.data as LocalRecord) }, r.athleteId)));
    await db.athleteCache.bulkPut(dirty.map(({ dirty: _d, ...r }) => r));
  }

  for (const id of athleteIds) {
    const since = cursors[id] ? new Date(Date.parse(cursors[id]!) - OVERLAP_MS).toISOString() : null;
    const rows = (await remote.pull(since, id)).filter((r) => r.athlete_id === id);
    const tableRows = rows.filter((r) => CLIENT_TABLES.has(r.kind));
    const cacheRows = rows.filter((r) => !CLIENT_TABLES.has(r.kind));
    if (tableRows.length) changed += (await applyRows(db, tableRows, uid, clock)).changed;
    if (cacheRows.length) {
      await db.transaction('rw', db.athleteCache, async () => {
        const keys = cacheRows.map((r) => `${id}/${r.kind}/${r.id}`);
        const existing = await db.athleteCache.bulkGet(keys);
        const puts: CachedRecord[] = [];
        cacheRows.forEach((r, i) => {
          const data = r.data as { updatedAt?: string };
          const updatedAt = data.updatedAt ?? r.updated_at;
          if (existing[i] && Date.parse(existing[i]!.updatedAt) >= Date.parse(updatedAt)) return;
          puts.push({ key: keys[i], athleteId: id, kind: r.kind, id: r.id, updatedAt, data: r.data });
        });
        if (puts.length) await db.athleteCache.bulkPut(puts);
        changed += puts.length;
      });
    }
    if (rows.length) cursors[id] = rows.reduce((max, r) => (r.synced_at && (!max || r.synced_at > max) ? r.synced_at : max), cursors[id] ?? null);
    else if (!(id in cursors)) cursors[id] = null;
  }
  for (const id of Object.keys(cursors)) {
    if (athleteIds.includes(id)) continue;
    await removeAthlete(db, id); // no longer your client
    delete cursors[id];
  }
  await db.meta.put({ key: 'sync', value: { ...(await getSyncState(db))!, athletes: cursors } });
  return changed;
}

/** Deletes one client's copies from this phone (never from the cloud: they're theirs). */
export async function removeAthlete(db: TrackerDB, athleteId: string) {
  if (athleteId === ME) return;
  applyingRemote = true;
  try {
    await db.transaction('rw', [db.sessions, db.programs, db.metrics, db.templates, db.comments, db.athleteCache], async () => {
      for (const t of [db.sessions, db.programs, db.metrics, db.templates, db.comments]) await (t as unknown as typeof db.sessions).where('athleteId').equals(athleteId).delete();
      await db.athleteCache.where('athleteId').equals(athleteId).delete();
    });
  } finally {
    applyingRemote = false;
  }
}

/** All clients' copies (on sign-out). */
export async function removeAllAthletes(db: TrackerDB) {
  const ids = new Set<string>();
  for (const t of [db.sessions, db.programs, db.metrics, db.templates, db.comments] as unknown as (typeof db.sessions)[]) {
    for (const id of (await (t as typeof db.sessions).orderBy('athleteId').uniqueKeys()) as string[]) if (id !== ME) ids.add(id);
  }
  for (const r of await db.athleteCache.toArray()) ids.add(r.athleteId);
  for (const id of ids) await removeAthlete(db, id);
}
