// Live data hooks: components re-render automatically when the database changes.
import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useMemo } from 'react';
import { db } from './db/db';
import { checkinSkippedOn, DEFAULT_SETTINGS, getSettings, listExercises, listMetrics, listSessions, listTemplates } from './db/repo';
import type { CloudProfile, CoachLink, Exercise, Metric, Session } from './db/types';
import { findPRs, type PR } from './lib/prs';
import { ME } from './db/types';
import { currentAthlete } from './db/repo';
import { overlayExercises } from './sync/athleteData';

export const useSettings = () => useLiveQuery(() => getSettings(db), []) ?? DEFAULT_SETTINGS;
export const useSessions = () => useLiveQuery(() => listSessions(db), []);
export const useTemplates = () => useLiveQuery(() => listTemplates(db), []);
export const useMetrics = (): Metric[] | undefined => useLiveQuery(() => listMetrics(db), []);
export const useCheckinSkipped = () => useLiveQuery(() => checkinSkippedOn(db), []);

/**
 * All exercises by id. Includes deleted ones so old sessions still show their names. When a coach
 * is looking at a client, the client's own exercises are layered on top.
 */
export function useExerciseMap(): Map<string, Exercise> {
  const all = useLiveQuery(async () => {
    const athlete = currentAthlete();
    const mine = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    return athlete === ME ? mine : overlayExercises(mine, await db.athleteCache.where('athleteId').equals(athlete).toArray());
  }, []);
  return useMemo(() => all ?? new Map(), [all]);
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

// ---------- Whose training is on screen (coach mode switcher) ----------

export interface AthleteView {
  /** 'me', or a client's account id. */
  id: string;
  /** The client's name (null for you). */
  name: string | null;
}

export const AthleteContext = createContext<AthleteView>({ id: ME, name: null });
export const useAthlete = () => useContext(AthleteContext);
export const useIsClientView = () => useContext(AthleteContext).id !== ME;

/** Active clients (for the switcher), from the coach's links. */
export function useClientList(): { id: string; name: string }[] {
  const profile = useProfile();
  const links = useLinks();
  if (profile?.role !== 'coach') return [];
  return links
    .filter((l) => l.coachId === profile.id && l.status === 'active' && l.clientId)
    .map((l) => ({ id: l.clientId!, name: l.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
