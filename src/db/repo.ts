// All reads and writes go through here; UI code never touches Dexie tables directly.
import { finishPlan, toSetEntry, upgradeDraftV1 } from '../lib/draft';
import { exerciseIdFor, newId, nowIso } from '../lib/ids';
import type { TrackerDB } from './db';
import { LEGACY_KEY, isLegacyData, migrateLegacy, type MigrationResult } from './migrateLegacy';
import { ensureSeedExercises } from './seed';
import type { Draft, DraftV1, Exercise, MigrationInfo, Session, SessionExercise, SetEntry, Settings, Template, TrackingMode } from './types';
import { DEFAULT_SETTINGS, ME } from './types';

export { DEFAULT_SETTINGS };

const STARTER_TEMPLATES: [string, string[]][] = [
  ['Push', ['Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Triceps Pushdown']],
  ['Pull', ['Deadlift', 'Pull-up', 'Barbell Row', 'Biceps Curl']],
  ['Legs', ['Squat', 'Romanian Deadlift', 'Leg Press', 'Calf Raise']]
];

export type StartupResult =
  | { status: 'ready'; migrated: MigrationInfo | null }
  | { status: 'error'; message: string; legacyRaw: string | null };

/**
 * Runs on every launch. Once per device it copies the old localStorage data into IndexedDB (leaving
 * the original untouched as a fallback), or seeds starter templates on a fresh install. Every launch
 * adds any built-in exercises that are missing.
 */
export async function startup(db: TrackerDB, storage: Pick<Storage, 'getItem'> | null): Promise<StartupResult> {
  let legacyRaw: string | null = null;
  try {
    let migrated: MigrationInfo | null = null;
    if (!(await db.meta.get('migration'))) {
      legacyRaw = storage?.getItem(LEGACY_KEY) ?? null;
      const now = nowIso();
      const result: MigrationResult = legacyRaw ? migrateLegacy(JSON.parse(legacyRaw), now, newId) : starterData(now);
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
      if (wrote && legacyRaw) migrated = info;
    }
    await ensureSeedExercises(db);
    return { status: 'ready', migrated };
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

/** Stored settings over the defaults, so settings added in later versions always have a value. */
export async function getSettings(db: TrackerDB): Promise<Settings> {
  const stored = ((await db.meta.get('settings'))?.value ?? {}) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    equipment: { ...DEFAULT_SETTINGS.equipment, ...stored.equipment }
  };
}

/** The in-progress workout. A Phase 0 draft is upgraded (and its exercises created) on first read. */
export async function getDraft(db: TrackerDB): Promise<Draft | null> {
  const value = (await db.meta.get('draft'))?.value as Draft | DraftV1 | null | undefined;
  if (!value) return null;
  if ('v' in value && value.v === 2) return value;
  const { draft, names } = upgradeDraftV1(value as DraftV1);
  await db.transaction('rw', [db.exercises, db.meta], async () => {
    await ensureExercises(db, names);
    await db.meta.put({ key: 'draft', value: draft });
  });
  return draft;
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
  sets: SetEntry[]; // every set, warm-ups included, in order
}

/** Sets from the most recent session that included this exercise. */
export async function lastPerformance(db: TrackerDB, exerciseId: string): Promise<LastPerformance | null> {
  const sessions = await db.sessions.where('exerciseIds').equals(exerciseId).filter(alive).toArray();
  const latest = sessions.filter((s) => s.athleteId === ME).sort(newestFirst)[0];
  if (!latest) return null;
  const sets = latest.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets);
  return sets.length ? { date: latest.date, sets } : null;
}

// ---------- Writes ----------

export async function updateSettings(db: TrackerDB, patch: Partial<Settings>) {
  const settings = await getSettings(db);
  await db.meta.put({ key: 'settings', value: { ...settings, ...patch } });
}

export const setUnit = (db: TrackerDB, unit: Settings['unit']) => updateSettings(db, { unit });

export async function saveDraft(db: TrackerDB, draft: Draft | null) {
  await db.meta.put({ key: 'draft', value: draft });
}

/** Creates any exercises that don't exist yet (by name, as Strength) and returns their ids. */
async function ensureExercises(db: TrackerDB, names: string[]): Promise<string[]> {
  const now = nowIso();
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const id = exerciseIdFor(name);
    const existing = await db.exercises.get(id);
    if (!existing) await db.exercises.put({ id, name, isCustom: true, tracking: 'strength', createdAt: now, updatedAt: now, deletedAt: null });
    else if (existing.deletedAt) await db.exercises.put({ ...existing, deletedAt: null, updatedAt: now });
    ids.push(id);
  }
  return ids;
}

/**
 * Creates a custom exercise, or returns the existing one with that name (reviving it if deleted;
 * an existing exercise keeps its tracking type so its history still makes sense).
 */
export async function createExercise(db: TrackerDB, input: { name: string; tracking: TrackingMode; unilateral: boolean }): Promise<Exercise> {
  const name = input.name.trim();
  const id = exerciseIdFor(name);
  return db.transaction('rw', db.exercises, async () => {
    const now = nowIso();
    const existing = await db.exercises.get(id);
    if (existing) {
      if (existing.deletedAt) await db.exercises.update(id, { deletedAt: null, updatedAt: now });
      return { ...existing, deletedAt: null };
    }
    const ex: Exercise = { id, name, isCustom: true, tracking: input.tracking, unilateral: input.unilateral, createdAt: now, updatedAt: now, deletedAt: null };
    await db.exercises.put(ex);
    return ex;
  });
}

export async function updateExercise(db: TrackerDB, id: string, patch: Partial<Pick<Exercise, 'restSec' | 'tracking' | 'unilateral' | 'defaultDistanceM'>>) {
  await db.exercises.update(id, { ...patch, updatedAt: nowIso() });
}

/**
 * Turns the draft into a saved session: ticked sets, plus filled-in unticked sets when
 * `includeUnticked`. Exercises left with no sets are dropped. Returns null if nothing would be saved.
 */
export async function finishDraft(db: TrackerDB, draft: Draft, includeUnticked = true): Promise<Session | null> {
  const now = nowIso();
  return db.transaction('rw', [db.exercises, db.sessions, db.meta], async () => {
    const exercises = new Map((await db.exercises.bulkGet(draft.exercises.map((e) => e.exerciseId))).filter(Boolean).map((e) => [e!.id, e!]));
    const plan = finishPlan(draft, exercises, includeUnticked);
    const kept: SessionExercise[] = draft.exercises
      .map((ex) => ({
        id: ex.id,
        exerciseId: ex.exerciseId,
        supersetGroup: ex.supersetGroup,
        restSec: ex.restSec,
        notes: ex.notes.trim() || undefined,
        sets: ex.sets.filter((s) => plan.include(ex, s)).map((s) => toSetEntry(s, exercises.get(ex.exerciseId), draft.unit, now))
      }))
      .filter((ex) => ex.sets.length);
    if (!kept.length) return null;
    const session: Session = {
      id: newId(),
      athleteId: ME,
      date: draft.date,
      startedAt: draft.startedAt,
      endedAt: now,
      templateId: draft.templateId,
      notes: draft.notes.trim(),
      source: 'live',
      exercises: kept,
      exerciseIds: [...new Set(kept.map((e) => e.exerciseId))],
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

/** 3 = Phase 0; 4 = Phase 1 (athletic set fields, v2 draft). Older formats still import. */
export const EXPORT_FORMAT = 4;

export interface ExportFile {
  app: 'workout-tracker';
  format: number;
  exportedAt: string;
  settings: Settings;
  exercises: Exercise[];
  sessions: Session[];
  templates: Template[];
  draft: Draft | DraftV1 | null;
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
      settings: { ...DEFAULT_SETTINGS, ...f.settings },
      exercises: f.exercises,
      sessions: f.sessions,
      templates: f.templates ?? [],
      draft: (f.draft ?? null) as Draft | null, // a Phase 0 draft is upgraded by getDraft()
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
  await ensureSeedExercises(db);
  return { sessions: data.sessions.filter((s) => !s.deletedAt).length };
}
