// Turns a client's cached cloud records back into the shapes the rest of the app works with.
import type { CachedRecord, Exercise, Metric, Program, Session, Settings, Template } from '../db/types';

export interface AthleteData {
  sessions: Session[]; // newest first, deleted ones left out
  programs: Program[];
  metrics: Metric[];
  templates: Template[];
  /** Your exercises with the client's own (custom or edited) ones layered on top. */
  exercises: Map<string, Exercise>;
  settings: Partial<Settings> | null;
}

export function athleteData(rows: CachedRecord[], baseExercises: Map<string, Exercise>): AthleteData {
  const of = <T>(kind: string) => rows.filter((r) => r.kind === kind).map((r) => r.data as unknown as T);
  const alive = <T extends { deletedAt?: string | null }>(list: T[]) => list.filter((x) => !x.deletedAt);
  const exercises = new Map(baseExercises);
  for (const e of of<Exercise>('exercises')) exercises.set(e.id, e); // includes hidden ones so names still show
  const sessions = alive(of<Session>('sessions')).sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt)
  );
  return {
    sessions,
    programs: alive(of<Program>('programs')),
    metrics: alive(of<Metric>('metrics')).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    templates: alive(of<Template>('templates')),
    exercises,
    settings: (of<Settings>('settings')[0] as Partial<Settings> | undefined) ?? null
  };
}
