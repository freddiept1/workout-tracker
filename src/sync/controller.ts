// Runs sync in the app: on open, shortly after any change, when the phone comes back online or the
// app comes back to the screen, every few minutes, and on "Sync now". Screens read its status.
import { useSyncExternalStore } from 'react';
import { db } from '../db/db';
import { LEGACY_KEY } from '../db/migrateLegacy';
import { cloudConfigured } from './config';
import { getSyncState, isApplyingRemote, syncOnce, AccountMismatchError } from './engine';

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
        await syncOnce(db, supabaseRemote, status.user!.id);
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
  set({ user: null, state: 'signed-out', error: null });
  if (removeData) {
    db.close();
    await db.delete();
    location.reload();
  }
}
