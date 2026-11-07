// The sync engine: pull what changed in the cloud, merge it in, then push what changed here.
// The phone's database stays the source of truth; nothing local is ever hard-deleted by a sync.
import type { TrackerDB } from '../db/db';
import { applyLibrary } from '../db/seed';
import type { MigrationInfo, Settings } from '../db/types';
import { nowIso } from '../lib/ids';
import { fromRow, resolve, SYNC_TABLES, toRow, type CloudRow, type LocalRecord, type SyncKind, type SyncTable } from './merge';

/** The cloud side (Supabase in the app, an in-memory fake in tests). */
export interface Remote {
  /** Save rows; the server keeps whichever copy has the newer `updated_at`. */
  push(rows: CloudRow[]): Promise<void>;
  /** Every row changed after `since` (server time), oldest first; all rows when `since` is null. */
  pull(since: string | null): Promise<CloudRow[]>;
}

export interface SyncState {
  uid: string;
  /** Local edits at or after this time still need pushing (null: push everything). */
  pushedAt: string | null;
  /** The server's `synced_at` of the newest row pulled. */
  pulledAt: string | null;
  lastSyncAt: string | null;
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
  if (state) await db.meta.put({ key: 'sync', value: { ...state, pushedAt: null } });
}

/** Forget the link to a cloud account (used when local data is removed on sign-out). */
export async function forgetSync(db: TrackerDB) {
  await db.meta.delete('sync');
}

const OVERLAP_MS = 2 * 60_000; // re-read the last 2 minutes each time, in case of late commits

export async function syncOnce(db: TrackerDB, remote: Remote, uid: string, clock: () => string = nowIso): Promise<{ pulled: number; pushed: number }> {
  const state = await getSyncState(db);
  if (state && state.uid !== uid) throw new AccountMismatchError();
  const first = !state;
  const started = clock();

  // 1. Pull.
  const since = state?.pulledAt ? new Date(Date.parse(state.pulledAt) - OVERLAP_MS).toISOString() : null;
  const rows = (await remote.pull(since)).filter((r) => r.athlete_id === uid);
  if (first && rows.length && (await isFreshDevice(db))) await dropStarterTemplates(db);
  const { applied, changed } = await applyRows(db, rows, uid, clock);

  // 2. Push.
  if (first) await stampSettings(db, new Date(Date.parse(started) - 1).toISOString()); // just before this sync's cut-off
  const out = await localChanges(db, uid, state?.pushedAt ?? null, applied);
  if (out.length) await remote.push(out);

  const pulledAt = rows.reduce<string | null>((max, r) => (r.synced_at && (!max || r.synced_at > max) ? r.synced_at : max), state?.pulledAt ?? null);
  await db.meta.put({ key: 'sync', value: { uid, pushedAt: started, pulledAt, lastSyncAt: clock() } satisfies SyncState });
  return { pulled: changed, pushed: out.length };
}

/** A device that has only what a fresh install creates: no training logged, starter templates untouched. */
async function isFreshDevice(db: TrackerDB): Promise<boolean> {
  const info = (await db.meta.get('migration'))?.value as MigrationInfo | undefined;
  if (info?.from !== 'fresh') return false;
  const [sessions, programs, metrics] = await Promise.all([db.sessions.count(), db.programs.count(), db.metrics.count()]);
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

async function localChanges(db: TrackerDB, uid: string, since: string | null, skip: Set<string>): Promise<CloudRow[]> {
  const out: CloudRow[] = [];
  for (const table of SYNC_TABLES) {
    const t = db.table(table);
    const records = (since ? await t.where('updatedAt').aboveOrEqual(since).toArray() : await t.toArray()) as LocalRecord[];
    for (const r of records) if (!skip.has(`${table}:${r.id}`)) out.push(toRow(table as SyncTable, r, uid));
  }
  const settings = await db.meta.get('settings');
  if (settings?.updatedAt && (!since || settings.updatedAt >= since) && !skip.has('settings:settings')) {
    out.push(toRow('settings', { ...(settings.value as object), id: 'settings', updatedAt: settings.updatedAt, deletedAt: null }, uid));
  }
  return out;
}
