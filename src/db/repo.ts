// All reads and writes go through here; UI code never touches Dexie tables directly.
import { exerciseIdFor, newId, nowIso } from '../lib/ids';
import { parseNumber, toKg } from '../lib/units';
import type { TrackerDB } from './db';
import { LEGACY_KEY, isLegacyData, migrateLegacy, type MigrationResult } from './migrateLegacy';
import type { Draft, Exercise, MigrationInfo, Session, SessionExercise, SetEntry, Settings, Template, Unit } from './types';
import { ME } from './types';

export const DEFAULT_SETTINGS: Settings = { unit: 'kg' };

const STARTER_TEMPLATES: [string, string[]][] = [
  ['Push', ['Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Triceps Pushdown']],
  ['Pull', ['Deadlift', 'Pull-up', 'Barbell Row', 'Biceps Curl']],
  ['Legs', ['Squat', 'Romanian Deadlift', 'Leg Press', 'Calf Raise']]
];

export type StartupResult =
  | { status: 'ready'; migrated: MigrationInfo | null }
  | { status: 'error'; message: string; legacyRaw: string | null };

/**
 * Runs once per device: copies the old localStorage data into IndexedDB (leaving the original
 * untouched as a fallback), or seeds starter templates on a fresh install.
 */
export async function startup(db: TrackerDB, storage: Pick<Storage, 'getItem'> | null): Promise<StartupResult> {
  let legacyRaw: string | null = null;
  try {
    if (await db.meta.get('migration')) return { status: 'ready', migrated: null };
    legacyRaw = storage?.getItem(LEGACY_KEY) ?? null;
    const now = nowIso();
    const result: MigrationResult = legacyRaw
      ? migrateLegacy(JSON.parse(legacyRaw), now, newId)
      : starterData(now);
    const info: MigrationInfo = {
      from: legacyRaw ? 'localStorage' : 'fresh',
      at: now,
      sourceVersion: result.sourceVersion,
      sessions: result.sessions.length,
      sets: result.setCount,
      exercises: result.exercises.length,
      templates: result.templates.length
    };
    const wrote = await writeAll(db, result, info, { onlyIfNotMigrated: true });
    return { status: 'ready', migrated: wrote && legacyRaw ? info : null };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err), legacyRaw };
  }
}

function starterData(now: string): MigrationResult {
  return migrateLegacy(
    { version: 2, workouts: [], templates: STARTER_TEMPLATES.map(([name, exercises]) => ({ name, exercises })) },
    now,
    newId
  );
}

/**
 * Replaces everything in the database with `data`, in one transaction. With `onlyIfNotMigrated`,
 * does nothing (and returns false) if a migration already ran, so two app tabs can't both migrate.
 */
async function writeAll(db: TrackerDB, data: MigrationResult, info: MigrationInfo, opts = { onlyIfNotMigrated: false }) {
  return db.transaction('rw', [db.exercises, db.sessions, db.templates, db.meta], async () => {
    if (opts.onlyIfNotMigrated && (await db.meta.get('migration'))) return false;
    await Promise.all([db.exercises.clear(), db.sessions.clear(), db.templates.clear()]);
    await db.exercises.bulkPut(data.exercises);
    await db.sessions.bulkPut(data.sessions);
    await db.templates.bulkPut(data.templates);
    await db.meta.bulkPut([
      { key: 'settings', value: data.settings },
      { key: 'draft', value: data.draft },
      { key: 'migration', value: info }
    ]);
    return true;
  });
}

// ---------- Reads ----------

const alive = <T extends { deletedAt: string | null }>(x: T) => !x.deletedAt;

export async function getSettings(db: TrackerDB): Promise<Settings> {
  return ((await db.meta.get('settings'))?.value as Settings) ?? DEFAULT_SETTINGS;
}

export async function getDraft(db: TrackerDB): Promise<Draft | null> {
  return ((await db.meta.get('draft'))?.value as Draft | null) ?? null;
}

/** Sessions for the current lifter, newest first. */
export async function listSessions(db: TrackerDB): Promise<Session[]> {
  const all = await db.sessions.where('athleteId').equals(ME).filter(alive).toArray();
  return all.sort(newestFirst);
}

function newestFirst(a: Session, b: Session) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt);
}

export async function listExercises(db: TrackerDB): Promise<Exercise[]> {
  return (await db.exercises.filter(alive).toArray()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listTemplates(db: TrackerDB): Promise<Template[]> {
  return db.templates.where('athleteId').equals(ME).filter(alive).sortBy('order');
}

export interface LastPerformance {
  date: string;
  sets: SetEntry[];
}

/** Sets from the most recent session that included this exercise (warm-ups left out). */
export async function lastPerformance(db: TrackerDB, exerciseId: string): Promise<LastPerformance | null> {
  const sessions = await db.sessions.where('exerciseIds').equals(exerciseId).filter(alive).toArray();
  const latest = sessions.filter((s) => s.athleteId === ME).sort(newestFirst)[0];
  if (!latest) return null;
  const sets = latest.exercises
    .filter((e) => e.exerciseId === exerciseId)
    .flatMap((e) => e.sets)
    .filter((s) => s.type !== 'warmup' && s.reps !== null);
  return sets.length ? { date: latest.date, sets } : null;
}

// ---------- Writes ----------

export async function setUnit(db: TrackerDB, unit: Unit) {
  const settings = await getSettings(db);
  await db.meta.put({ key: 'settings', value: { ...settings, unit } });
}

export async function saveDraft(db: TrackerDB, draft: Draft | null) {
  await db.meta.put({ key: 'draft', value: draft });
}

/** Creates any exercises that don't exist yet (by name) and returns their ids. */
async function ensureExercises(db: TrackerDB, names: string[]): Promise<string[]> {
  const now = nowIso();
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const id = exerciseIdFor(name);
    const existing = await db.exercises.get(id);
    if (!existing) await db.exercises.put({ id, name, isCustom: true, createdAt: now, updatedAt: now, deletedAt: null });
    else if (existing.deletedAt) await db.exercises.put({ ...existing, deletedAt: null, updatedAt: now });
    ids.push(id);
  }
  return ids;
}

/**
 * Turns the draft into a saved session. Sets without reps and exercises without a name or sets are
 * left out. Returns null (and saves nothing) if there is nothing to save.
 */
export async function finishDraft(db: TrackerDB, draft: Draft): Promise<Session | null> {
  const now = nowIso();
  const kept = draft.exercises
    .map((ex) => ({
      name: ex.name.trim(),
      sets: ex.sets
        .map((s) => ({ s, reps: parseNumber(s.reps), weight: parseNumber(s.weight) }))
        .filter(({ reps }) => reps !== null && reps > 0)
    }))
    .filter((ex) => ex.name && ex.sets.length);
  if (!kept.length) return null;

  return db.transaction('rw', [db.exercises, db.sessions, db.meta], async () => {
    const ids = await ensureExercises(db, kept.map((e) => e.name));
    const exercises: SessionExercise[] = kept.map((ex, i) => ({
      id: newId(),
      exerciseId: ids[i],
      sets: ex.sets.map(({ s, reps, weight }) => ({
        id: s.id,
        type: s.type,
        weightKg: weight === null ? 0 : toKg(weight, draft.unit),
        reps,
        rpe: null,
        completedAt: now
      }))
    }));
    const session: Session = {
      id: newId(),
      athleteId: ME,
      date: draft.date,
      startedAt: draft.startedAt,
      endedAt: now,
      templateId: draft.templateId,
      notes: draft.notes.trim(),
      source: 'live',
      exercises,
      exerciseIds: [...new Set(ids)],
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    await db.sessions.put(session);
    await db.meta.put({ key: 'draft', value: null });
    return session;
  });
}

export async function deleteSession(db: TrackerDB, id: string) {
  const now = nowIso();
  await db.sessions.update(id, { deletedAt: now, updatedAt: now });
}

export async function saveTemplate(db: TrackerDB, input: { id?: string; name: string; exerciseNames: string[] }) {
  await db.transaction('rw', [db.exercises, db.templates], async () => {
    const now = nowIso();
    const ids = await ensureExercises(db, input.exerciseNames);
    const existing = input.id ? await db.templates.get(input.id) : undefined;
    const last = await db.templates.orderBy('order').last();
    await db.templates.put({
      id: existing?.id ?? newId(),
      athleteId: ME,
      name: input.name.trim(),
      order: existing?.order ?? (last ? last.order + 1 : 0),
      exercises: ids.map((exerciseId) => ({ exerciseId })),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null
    });
  });
}

export async function deleteTemplate(db: TrackerDB, id: string) {
  const now = nowIso();
  await db.templates.update(id, { deletedAt: now, updatedAt: now });
}

// ---------- Backup ----------

export const EXPORT_FORMAT = 3;

export interface ExportFile {
  app: 'workout-tracker';
  format: number;
  exportedAt: string;
  settings: Settings;
  exercises: Exercise[];
  sessions: Session[];
  templates: Template[];
  draft: Draft | null;
}

/** Everything, including soft-deleted records, so a restore is exact. */
export async function exportAll(db: TrackerDB): Promise<ExportFile> {
  return {
    app: 'workout-tracker',
    format: EXPORT_FORMAT,
    exportedAt: nowIso(),
    settings: await getSettings(db),
    exercises: await db.exercises.toArray(),
    sessions: await db.sessions.toArray(),
    templates: await db.templates.toArray(),
    draft: await getDraft(db)
  };
}

/** Replaces all data with a backup file: either this format or an old (localStorage-era) export. */
export async function importAll(db: TrackerDB, text: string): Promise<{ sessions: number }> {
  const raw: unknown = JSON.parse(text);
  const now = nowIso();
  let data: MigrationResult;
  if (raw && typeof raw === 'object' && (raw as ExportFile).app === 'workout-tracker') {
    const f = raw as ExportFile;
    if (f.format > EXPORT_FORMAT) throw new Error('This backup is from a newer version of the app. Update the app first.');
    if (!Array.isArray(f.sessions) || !Array.isArray(f.exercises)) throw new Error('This backup file is incomplete.');
    data = {
      settings: f.settings ?? DEFAULT_SETTINGS,
      exercises: f.exercises,
      sessions: f.sessions,
      templates: f.templates ?? [],
      draft: f.draft ?? null,
      sourceVersion: f.format,
      setCount: f.sessions.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.sets.length, 0), 0)
    };
  } else if (isLegacyData(raw)) {
    data = migrateLegacy(raw, now, newId);
  } else {
    throw new Error('This file is not a workout tracker backup.');
  }
  const previous = (await db.meta.get('migration'))?.value as MigrationInfo | undefined;
  await writeAll(db, data, previous ?? {
    from: 'fresh', at: now, sourceVersion: data.sourceVersion, sessions: data.sessions.length,
    sets: data.setCount, exercises: data.exercises.length, templates: data.templates.length
  });
  return { sessions: data.sessions.filter((s) => !s.deletedAt).length };
}
