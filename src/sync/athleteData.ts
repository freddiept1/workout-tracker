// A client's data on the coach's phone: sessions, programs and metrics live in the normal tables
// under the client's account id; their own exercises and settings live in `athleteCache`.
import type { TrackerDB } from '../db/db';
import type { CachedRecord, Exercise, Metric, Program, Session, Settings } from '../db/types';

export interface AthleteData {
  sessions: Session[]; // newest first, deleted ones left out
  programs: Program[];
  metrics: Metric[]; // oldest first
  /** Your exercises with the client's own (custom or edited) ones layered on top. */
  exercises: Map<string, Exercise>;
  settings: Partial<Settings> | null;
}

const alive = <T extends { deletedAt?: string | null }>(x: T) => !x.deletedAt;

/** The client's exercises over yours, so their history shows the right names and types. */
export function overlayExercises(base: Map<string, Exercise>, cache: CachedRecord[]): Map<string, Exercise> {
  const out = new Map(base);
  for (const r of cache) if (r.kind === 'exercises') out.set(r.id, r.data as unknown as Exercise);
  return out;
}

export function clientSettings(cache: CachedRecord[]): Partial<Settings> | null {
  return (cache.find((r) => r.kind === 'settings')?.data as Partial<Settings> | undefined) ?? null;
}

/** Several clients at once (the roster), keyed by account id. */
export async function loadAthletes(db: TrackerDB, ids: string[], base: Map<string, Exercise>): Promise<Map<string, AthleteData>> {
  const [sessions, programs, metrics, cache] = await Promise.all([
    db.sessions.where('athleteId').anyOf(ids).filter(alive).toArray(),
    db.programs.where('athleteId').anyOf(ids).filter(alive).toArray(),
    db.metrics.where('athleteId').anyOf(ids).filter(alive).toArray(),
    db.athleteCache.where('athleteId').anyOf(ids).toArray()
  ]);
  const out = new Map<string, AthleteData>();
  for (const id of ids) {
    const mine = cache.filter((r) => r.athleteId === id);
    out.set(id, {
      sessions: sessions.filter((s) => s.athleteId === id).sort((a, b) =>
        a.date !== b.date ? (a.date < b.date ? 1 : -1) : (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt)),
      programs: programs.filter((p) => p.athleteId === id),
      metrics: metrics.filter((m) => m.athleteId === id).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
      exercises: overlayExercises(base, mine),
      settings: clientSettings(mine)
    });
  }
  return out;
}
