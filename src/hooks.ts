// Live data hooks: components re-render automatically when the database changes.
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from './db/db';
import { checkinSkippedOn, DEFAULT_SETTINGS, getSettings, listExercises, listMetrics, listSessions, listTemplates } from './db/repo';
import type { CloudProfile, CoachLink, Exercise, Metric, Session } from './db/types';
import { findPRs, type PR } from './lib/prs';

export const useSettings = () => useLiveQuery(() => getSettings(db), []) ?? DEFAULT_SETTINGS;
export const useSessions = () => useLiveQuery(() => listSessions(db), []);
export const useTemplates = () => useLiveQuery(() => listTemplates(db), []);
export const useMetrics = (): Metric[] | undefined => useLiveQuery(() => listMetrics(db), []);
export const useCheckinSkipped = () => useLiveQuery(() => checkinSkippedOn(db), []);

/** All exercises by id. Includes deleted ones so old sessions still show their names. */
export function useExerciseMap(): Map<string, Exercise> {
  const all = useLiveQuery(() => db.exercises.toArray(), []);
  return useMemo(() => new Map((all ?? []).map((e) => [e.id, e])), [all]);
}

/** PRs for every session (oldest-first maths), recomputed when history changes. */
export function usePRs(sessions: Session[] | undefined, exercises: Map<string, Exercise>): Map<string, PR[]> {
  return useMemo(() => (sessions ? findPRs(sessions, exercises) : new Map()), [sessions, exercises]);
}

export function useExerciseNames(): string[] {
  return useLiveQuery(() => listExercises(db), [])?.map((e) => e.name) ?? [];
}

// ---------- Coach mode ----------

/** Your cloud profile (role, name), as of the last sync. Null when signed out or not synced yet. */
export const useProfile = (): CloudProfile | null | undefined =>
  useLiveQuery(async () => ((await db.meta.get('profile'))?.value as CloudProfile | null | undefined) ?? null, []);

export const useLinks = (): CoachLink[] =>
  useLiveQuery(async () => ((await db.meta.get('links'))?.value as CoachLink[] | undefined) ?? [], []) ?? [];

/** As a client: your active link to your coach (their name, the weigh-in reminder they set). */
export function useMyCoach(): CoachLink | null {
  const profile = useProfile();
  const links = useLinks();
  return (profile && links.find((l) => l.clientId === profile.id && l.status === 'active')) || null;
}

export const useAthleteCache = () => useLiveQuery(() => db.athleteCache.toArray(), []);
