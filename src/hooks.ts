// Live data hooks: components re-render automatically when the database changes.
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from './db/db';
import { DEFAULT_SETTINGS, getSettings, listExercises, listSessions, listTemplates } from './db/repo';
import type { Exercise } from './db/types';

export const useSettings = () => useLiveQuery(() => getSettings(db), []) ?? DEFAULT_SETTINGS;
export const useSessions = () => useLiveQuery(() => listSessions(db), []);
export const useTemplates = () => useLiveQuery(() => listTemplates(db), []);

/** All exercises by id. Includes deleted ones so old sessions still show their names. */
export function useExerciseMap(): Map<string, Exercise> {
  const all = useLiveQuery(() => db.exercises.toArray(), []);
  return useMemo(() => new Map((all ?? []).map((e) => [e.id, e])), [all]);
}

export function useExerciseNames(): string[] {
  return useLiveQuery(() => listExercises(db), [])?.map((e) => e.name) ?? [];
}
