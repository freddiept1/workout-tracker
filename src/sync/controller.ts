// Runs sync in the app: on open, shortly after any change, when the phone comes back online or the
// app comes back to the screen, every few minutes, and on "Sync now". Screens read its status.
import { useSyncExternalStore } from 'react';
import { db } from '../db/db';
import { LEGACY_KEY } from '../db/migrateLegacy';
import { cloudConfigured } from './config';
import { forgetSync, getSyncState, isApplyingRemote, syncAthletes, syncOnce, AccountMismatchError } from './engine';

export interface SyncStatus {
  configured: boolean;
  user: { id: string; email: string } | null;
  state: 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error';
  lastSyncAt: string | null;
  error: string | null;
}

let status: SyncStatus = { configured: cloudConfigured(), user: null, state: 'signed-out', lastSyncAt: null, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<SyncStatus>) => {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
};

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => status);
}

const AFTER_CHANGE_MS = 5_000;
const EVERY_MS = 5 * 60_000;
let started = false;
let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Called once after the database is ready. Does nothing if the cloud isn't set up or nobody is signed in. */
export async function startSync() {
  if (started || !status.configured) return;
  started = true;
  const { currentUser } = await import('./cloud');
  const user = await currentUser().catch(() => null);
  const state = await getSyncState(db);
  set({ user, state: user ? 'idle' : 'signed-out', lastSyncAt: state?.lastSyncAt ?? null });

  // Any local change schedules a sync a few seconds later (changes made by sync itself don't).
  const changed = () => { if (!isApplyingRemote()) schedule(AFTER_CHANGE_MS); };
  for (const t of [db.exercises, db.sessions, db.templates, db.programs, db.metrics]) {
    t.hook('creating', changed);
    t.hook('updating', changed);
  }
  db.meta.hook('creating', (key) => { if (key === 'settings') changed(); });
  db.meta.hook('updating', (_mods, key) => { if (key === 'settings') changed(); });

  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow(); });
  setInterval(() => void syncNow(), EVERY_MS);
  if (user) void syncNow();
}

function schedule(ms: number) {
  if (!status.user) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

/** Syncs now (or straight after the sync already running). */
export function syncNow(): Promise<void> {
  if (!status.user) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    const { supabaseRemote } = await import('./cloud');
    do {
      again = false;
      set({ state: 'syncing', error: null });
      try {
        if (!navigator.onLine) throw new TypeError('offline');
        const uid = status.user!.id;
        await syncOnce(db, supabaseRemote, uid);
        await refreshCoaching(uid);
        set({ state: 'idle', lastSyncAt: (await getSyncState(db))?.lastSyncAt ?? null });
      } catch (err) {
        const offline = err instanceof TypeError || /connection|fetch|network|offline/i.test(String((err as Error).message));
        set({ state: offline ? 'offline' : 'error', error: offline ? null : (err as Error).message });
        if (err instanceof AccountMismatchError) break;
      }
    } while (again);
  })().finally(() => { running = null; });
  return running;
}

/**
 * Profile (are you a coach?), coach/client links, and, for a coach, fresh read-only copies of
 * each active client's training. Saved in `meta` so the app knows all this offline too.
 */
async function refreshCoaching(uid: string) {
  const { fetchProfile, fetchLinks, supabaseRemote } = await import('./cloud');
  const [profile, links] = await Promise.all([fetchProfile(uid), fetchLinks(uid)]);
  await db.meta.bulkPut([{ key: 'profile', value: profile }, { key: 'links', value: links }]);
  const clients = profile?.role === 'coach' ? links.filter((l) => l.coachId === uid && l.status === 'active' && l.clientId).map((l) => l.clientId!) : [];
  await syncAthletes(db, supabaseRemote, clients);
}

/** After a coach action (invite, remove…): reload links straight away. */
export async function refreshLinks() {
  if (!status.user) return;
  const { fetchLinks } = await import('./cloud');
  await db.meta.put({ key: 'links', value: await fetchLinks(status.user.id) });
  void syncNow();
}

/** After the emailed code is accepted. */
export async function signedIn(user: { id: string; email: string }) {
  const state = await getSyncState(db);
  if (state && state.uid !== user.id) {
    const { signOut } = await import('./cloud');
    await signOut();
    throw new AccountMismatchError();
  }
  set({ user, state: 'idle', error: null });
  await syncNow();
}

/** Signs out. With `removeData`, also wipes this phone's training data (the cloud copy stays). */
export async function signOutAndMaybeErase(removeData: boolean) {
  await running;
  if (removeData) {
    // Only ever erase straight after a successful sync, so the cloud has everything.
    await syncNow();
    if (status.state !== 'idle') throw new Error('Couldn’t sync first, so nothing was removed. Try again with signal.');
    localStorage.removeItem(LEGACY_KEY); // the pre-2026 data, now safely in the cloud
  }
  const { signOut } = await import('./cloud');
  await signOut().catch(() => {});
  await forgetCoaching();
  set({ user: null, state: 'signed-out', error: null });
  if (removeData) {
    db.close();
    await db.delete();
    location.reload();
  }
}

/** Clients' data and coach links never stay on a phone nobody is signed in to. */
async function forgetCoaching() {
  await db.athleteCache.clear();
  await db.meta.bulkDelete(['profile', 'links']);
}

/** Deletes the account and all its cloud data. Training on this phone stays, unlinked from any account. */
export async function deleteAccount() {
  await running;
  const { deleteMyAccount, signOut } = await import('./cloud');
  await deleteMyAccount();
  await signOut().catch(() => {});
  await forgetCoaching();
  await forgetSync(db);
  set({ user: null, state: 'signed-out', error: null, lastSyncAt: null });
}
