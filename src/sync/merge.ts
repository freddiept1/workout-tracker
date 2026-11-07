// Pure sync rules: how local records map to cloud rows, and which copy wins when both changed.
import type { Program } from '../db/types';
import { ME } from '../db/types';

/** The local tables that sync, plus settings (stored in `meta`). Kinds are stored in the cloud. */
export const SYNC_TABLES = ['exercises', 'sessions', 'templates', 'programs', 'metrics'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];
export type SyncKind = SyncTable | 'settings';

/** One row of the cloud `records` table. */
export interface CloudRow {
  athlete_id: string;
  kind: SyncKind;
  id: string;
  data: Record<string, unknown>;
  updated_at: string;
  deleted_at: string | null;
  synced_at?: string;
}

export interface LocalRecord {
  id: string;
  updatedAt: string;
  deletedAt?: string | null;
  athleteId?: string;
  [key: string]: unknown;
}

/**
 * Local data keeps `athleteId: 'me'` for the signed-in lifter (so nothing on the phone has to be
 * rewritten when you sign in or out). In the cloud it's your account id.
 */
export function toRow(kind: SyncKind, record: LocalRecord, uid: string): CloudRow {
  const athlete = !record.athleteId || record.athleteId === ME ? uid : record.athleteId;
  const data = record.athleteId === undefined ? { ...record } : { ...record, athleteId: athlete };
  return { athlete_id: athlete, kind, id: record.id, data, updated_at: record.updatedAt, deleted_at: record.deletedAt ?? null };
}

export function fromRow(row: CloudRow, uid: string): LocalRecord {
  const data = { ...row.data } as LocalRecord;
  if (data.athleteId !== undefined && data.athleteId === uid) data.athleteId = ME;
  return data;
}

const ms = (iso: string | undefined | null) => (iso ? Date.parse(iso) || 0 : 0);

/**
 * Which copy to keep when a record arrives from the cloud: the newer edit wins (last write wins).
 * Programs are special: their `log` (which days were done or skipped) is merged slot by slot, so a
 * workout ticked on one device is never lost to a program edit made on another.
 * Returns null when the local copy should stay as it is.
 */
export function resolve(kind: SyncKind, local: LocalRecord | undefined, remote: LocalRecord, now: string): LocalRecord | null {
  if (!local) return remote;
  const remoteNewer = ms(remote.updatedAt) > ms(local.updatedAt);
  if (kind !== 'programs') return remoteNewer ? remote : null;

  const winner = (remoteNewer ? remote : local) as unknown as Program;
  const loser = (remoteNewer ? local : remote) as unknown as Program;
  // After a "Restart", the old run's ticks don't come back.
  if ((winner.restartedAt ?? null) !== (loser.restartedAt ?? null)) return remoteNewer ? remote : null;
  const missing = Object.keys(loser.log ?? {}).filter((k) => !(k in (winner.log ?? {})));
  if (!missing.length) return remoteNewer ? remote : null;
  // Both sides added something: keep everything, and mark it as a new edit so it syncs back.
  const log = { ...loser.log, ...winner.log };
  return { ...(winner as unknown as LocalRecord), log, updatedAt: now };
}
