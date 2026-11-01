// All reads and writes go through here; UI code never touches Dexie tables directly.
import { shortDate } from '../lib/dates';
import { blankSet, commonTempo, finishPlan, toSetEntry, upgradeDraftV1 } from '../lib/draft';
import { exerciseIdFor, newId, nowIso } from '../lib/ids';
import { isDeloadWeek, loadRounder, nextSlot, prescribe, type HistoryEntry, type PrescribeInput, type Slot } from '../lib/programs';
import { setE1RM } from '../lib/strength';
import { formatWeight } from '../lib/units';
import { addDays } from '../lib/weekly';
import type { TrackerDB } from './db';
import { LEGACY_KEY, isLegacyData, migrateLegacy, type MigrationResult } from './migrateLegacy';
import { applyLibrary } from './seed';
import type { Draft, DraftExercise, DraftV1, Exercise, MigrationInfo, Program, Session, SessionExercise, SetEntry, Settings, Template, TrackingMode } from './types';
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
    await applyLibrary(db);
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
  return db.transaction('rw', [db.exercises, db.sessions, db.templates, db.programs, db.meta], async () => {
    if (opts.onlyIfNotMigrated && (await db.meta.get('migration'))) return false;
    await Promise.all([db.exercises.clear(), db.sessions.clear(), db.templates.clear(), db.programs.clear()]);
    await db.exercises.bulkPut(data.exercises);
    await db.sessions.bulkPut(data.sessions);
    await db.templates.bulkPut(data.templates);
    await db.programs.bulkPut(data.programs ?? []);
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

/** The exercise with this name (ignoring capitals), preferring visible ones; falls back to the slug id. */
export async function findExerciseByName(db: TrackerDB, name: string): Promise<Exercise | undefined> {
  const key = name.trim().toLowerCase();
  const matches = await db.exercises.filter((e) => e.name.trim().toLowerCase() === key).toArray();
  return matches.find((e) => !e.deletedAt) ?? matches[0] ?? (await db.exercises.get(exerciseIdFor(name)));
}

/**
 * Creates any exercises that don't exist yet (by name, as Strength) and returns their ids.
 * A hidden exercise is shown again; one merged into another resolves to that one.
 */
async function ensureExercises(db: TrackerDB, names: string[]): Promise<string[]> {
  const now = nowIso();
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    let existing = await findExerciseByName(db, name);
    if (existing?.mergedInto) existing = (await db.exercises.get(existing.mergedInto)) ?? existing;
    if (!existing) {
      const id = await freeId(db, name);
      await db.exercises.put({ id, name, isCustom: true, tracking: 'strength', createdAt: now, updatedAt: now, deletedAt: null });
      ids.push(id);
      continue;
    }
    if (existing.deletedAt) await db.exercises.put({ ...existing, deletedAt: null, updatedAt: now });
    ids.push(existing.id);
  }
  return ids;
}

/** A slug id for a new exercise that no other exercise (even a hidden one) uses. */
async function freeId(db: TrackerDB, name: string): Promise<string> {
  const base = exerciseIdFor(name);
  let id = base;
  for (let n = 2; await db.exercises.get(id); n++) id = `${base}-${n}`;
  return id;
}

export interface ExerciseInput {
  id?: string; // missing = new exercise
  name: string;
  tracking: TrackingMode;
  unilateral: boolean;
  parentId: string | null;
  muscles: Exercise['muscles'];
  pattern: string | null;
  equipment: string | null;
  mechanic: Exercise['mechanic'];
  restSec: number | null;
  defaultTempo: string | null;
  defaultDistanceM: number | null;
}

/** Creates or edits an exercise from the library screen. Throws a readable error if it isn't valid. */
export async function saveExercise(db: TrackerDB, input: ExerciseInput): Promise<Exercise> {
  const name = input.name.trim();
  if (!name) throw new Error('Give the exercise a name.');
  return db.transaction('rw', db.exercises, async () => {
    const clash = await findExerciseByName(db, name);
    if (clash && clash.id !== input.id && !clash.deletedAt) throw new Error(`There's already an exercise called “${clash.name}”.`);
    // A lift can't be a variation of itself or of one of its own variations.
    for (let p = input.parentId; p; p = (await db.exercises.get(p))?.parentId ?? null) {
      if (p === input.id) throw new Error('An exercise can’t be a variation of its own variation.');
    }
    const now = nowIso();
    const existing = input.id ? await db.exercises.get(input.id) : undefined;
    const muscles = (input.muscles ?? []).filter((m) => m.pct > 0);
    const ex: Exercise = {
      ...(existing ?? { isCustom: true, createdAt: now }),
      id: existing?.id ?? (await freeId(db, name)),
      name,
      tracking: input.tracking,
      unilateral: input.unilateral,
      parentId: input.parentId,
      muscles,
      pattern: input.pattern,
      equipment: input.equipment,
      mechanic: input.mechanic,
      restSec: input.restSec,
      defaultTempo: input.defaultTempo?.trim() || null,
      defaultDistanceM: input.defaultDistanceM,
      updatedAt: now,
      deletedAt: null
    };
    await db.exercises.put(ex);
    return ex;
  });
}

/** Hides an exercise from lists. Its history stays, and it can be shown again from the library. */
export async function hideExercise(db: TrackerDB, id: string) {
  const now = nowIso();
  await db.exercises.update(id, { deletedAt: now, updatedAt: now });
}

export async function restoreExercise(db: TrackerDB, id: string) {
  await db.exercises.update(id, { deletedAt: null, mergedInto: null, updatedAt: nowIso() });
}

export async function toggleFavourite(db: TrackerDB, id: string) {
  const ex = await db.exercises.get(id);
  if (ex) await db.exercises.update(id, { favourite: !ex.favourite, updatedAt: nowIso() });
}

/**
 * Moves all of one exercise's history, templates and variations onto another, then hides the first.
 * Used to tidy duplicates (e.g. "Bench" typed before the library had "Bench Press").
 */
export async function mergeExercise(db: TrackerDB, fromId: string, intoId: string): Promise<{ sessions: number }> {
  if (fromId === intoId) throw new Error('Pick a different exercise to merge into.');
  return db.transaction('rw', [db.exercises, db.sessions, db.templates, db.meta], async () => {
    const [from, into] = await db.exercises.bulkGet([fromId, intoId]);
    if (!from || !into) throw new Error('Exercise not found.');
    const now = nowIso();
    const swap = (id: string) => (id === fromId ? intoId : id);

    const sessions = await db.sessions.where('exerciseIds').equals(fromId).toArray();
    await db.sessions.bulkPut(sessions.map((s) => {
      const exercises = s.exercises.map((e) => ({ ...e, exerciseId: swap(e.exerciseId) }));
      return { ...s, exercises, exerciseIds: [...new Set(exercises.map((e) => e.exerciseId))], updatedAt: now };
    }));

    const templates = (await db.templates.toArray()).filter((t) => t.exercises.some((e) => e.exerciseId === fromId));
    await db.templates.bulkPut(templates.map((t) => ({ ...t, exercises: t.exercises.map((e) => ({ exerciseId: swap(e.exerciseId) })), updatedAt: now })));

    const children = await db.exercises.where('parentId').equals(fromId).toArray();
    await db.exercises.bulkPut(children.map((c) => ({ ...c, parentId: c.id === intoId ? from.parentId ?? null : intoId, updatedAt: now })));

    const draft = (await db.meta.get('draft'))?.value as Draft | null | undefined;
    if (draft && 'v' in draft) {
      await db.meta.put({ key: 'draft', value: { ...draft, exercises: draft.exercises.map((e) => ({ ...e, exerciseId: swap(e.exerciseId) })) } });
    }

    await db.exercises.update(fromId, { deletedAt: now, mergedInto: intoId, updatedAt: now });
    return { sessions: sessions.length };
  });
}

/**
 * Creates a custom exercise, or returns the existing one with that name (reviving it if deleted;
 * an existing exercise keeps its tracking type so its history still makes sense).
 */
export async function createExercise(db: TrackerDB, input: { name: string; tracking: TrackingMode; unilateral: boolean }): Promise<Exercise> {
  const name = input.name.trim();
  return db.transaction('rw', db.exercises, async () => {
    const now = nowIso();
    let existing = await findExerciseByName(db, name);
    if (existing?.mergedInto) existing = (await db.exercises.get(existing.mergedInto)) ?? existing;
    if (existing) {
      if (existing.deletedAt) await db.exercises.update(existing.id, { deletedAt: null, mergedInto: null, updatedAt: now });
      return { ...existing, deletedAt: null };
    }
    const ex: Exercise = { id: await freeId(db, name), name, isCustom: true, tracking: input.tracking, unilateral: input.unilateral, createdAt: now, updatedAt: now, deletedAt: null };
    await db.exercises.put(ex);
    return ex;
  });
}

export async function updateExercise(db: TrackerDB, id: string, patch: Partial<Pick<Exercise, 'restSec' | 'tracking' | 'unilateral' | 'defaultDistanceM' | 'defaultTempo'>>) {
  await db.exercises.update(id, { ...patch, updatedAt: nowIso() });
}

/**
 * Turns the draft into a saved session: ticked sets, plus filled-in unticked sets when
 * `includeUnticked`. Exercises left with no sets are dropped. Returns null if nothing would be saved.
 */
export async function finishDraft(db: TrackerDB, draft: Draft, includeUnticked = true): Promise<Session | null> {
  const now = nowIso();
  return db.transaction('rw', [db.exercises, db.sessions, db.meta, db.programs], async () => {
    const exercises = new Map((await db.exercises.bulkGet(draft.exercises.map((e) => e.exerciseId))).filter(Boolean).map((e) => [e!.id, e!]));
    const plan = finishPlan(draft, exercises, includeUnticked);
    const kept: SessionExercise[] = draft.exercises
      .map((ex) => ({
        id: ex.id,
        exerciseId: ex.exerciseId,
        supersetGroup: ex.supersetGroup,
        restSec: ex.restSec,
        notes: ex.notes.trim() || undefined,
        sets: ex.sets.filter((s) => plan.include(ex, s)).map((s) => toSetEntry(s, exercises.get(ex.exerciseId), draft.unit, now, ex.tempo))
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
      programDayId: draft.program ? `${draft.program.programId}:${draft.program.slot}` : null,
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
    // A program workout: tick it off, and finish the program after its last workout.
    const program = draft.program ? await db.programs.get(draft.program.programId) : undefined;
    if (program && draft.program) {
      const log = { ...program.log, [draft.program.slot]: { sessionId: session.id, date: session.date, skipped: false } };
      await db.programs.update(program.id, {
        log, startedAt: program.startedAt ?? session.date, status: nextSlot({ ...program, log }) ? program.status : 'completed', updatedAt: now
      });
    }
    return session;
  });
}

// ---------- Programs ----------

export async function listPrograms(db: TrackerDB): Promise<Program[]> {
  return (await db.programs.where('athleteId').equals(ME).filter(alive).toArray()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type ProgramInput = Pick<Program, 'name' | 'weeks' | 'deloadEvery' | 'days' | 'maxes'> & { id?: string };

/** Creates or edits a program. Editing keeps its progress (log); a new one starts active. */
export async function saveProgram(db: TrackerDB, input: ProgramInput): Promise<Program> {
  if (!input.name.trim()) throw new Error('Give the program a name.');
  if (!input.days.length) throw new Error('Add at least one day.');
  const now = nowIso();
  const existing = input.id ? await db.programs.get(input.id) : undefined;
  const program: Program = {
    status: 'active', startedAt: null, log: {}, createdAt: now,
    ...existing,
    id: existing?.id ?? newId(),
    athleteId: ME,
    name: input.name.trim(),
    weeks: Math.max(1, Math.min(52, Math.round(input.weeks))),
    deloadEvery: input.deloadEvery && input.deloadEvery > 1 ? input.deloadEvery : null,
    days: input.days,
    maxes: input.maxes,
    updatedAt: now,
    deletedAt: null
  };
  await db.programs.put(program);
  return program;
}

export async function deleteProgram(db: TrackerDB, id: string) {
  const now = nowIso();
  await db.programs.update(id, { deletedAt: now, updatedAt: now });
}

export async function setProgramStatus(db: TrackerDB, id: string, status: Program['status']) {
  await db.programs.update(id, { status, updatedAt: nowIso() });
}

/** Start again from week 1 (past sessions stay in History). */
export async function restartProgram(db: TrackerDB, id: string) {
  const now = nowIso();
  await db.programs.update(id, { log: {}, status: 'active', startedAt: null, updatedAt: now });
}

/** Mark a workout as skipped, so the program moves on to the next one. */
export async function skipProgramSlot(db: TrackerDB, id: string, slot: string, date: string) {
  const p = await db.programs.get(id);
  if (!p) return;
  const log = { ...p.log, [slot]: { sessionId: null, date, skipped: true } };
  const status = nextSlot({ ...p, log }) ? p.status : 'completed';
  await db.programs.update(id, { log, status, updatedAt: nowIso() });
}

/** This exercise's recent sessions (newest first), working sets only. */
async function recentHistory(db: TrackerDB, exerciseId: string, limit = 3): Promise<HistoryEntry[]> {
  const sessions = (await db.sessions.where('exerciseIds').equals(exerciseId).filter(alive).toArray()).filter((s) => s.athleteId === ME).sort(newestFirst);
  return sessions.slice(0, limit).map((s) => ({
    date: s.date,
    sets: s.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets).filter((x) => x.type !== 'warmup')
  }));
}

/** For % work: the 1RM entered in the program, otherwise the best e1RM of the last 12 weeks. */
async function referenceMax(db: TrackerDB, program: Program, exerciseId: string, today: string): Promise<PrescribeInput['ref1RM']> {
  if (program.maxes[exerciseId]) return { kg: program.maxes[exerciseId], source: '1RM you entered' };
  const since = addDays(today, -84);
  let best: { kg: number; date: string } | null = null;
  for (const s of await db.sessions.where('exerciseIds').equals(exerciseId).filter(alive).toArray()) {
    if (s.date < since) continue;
    for (const e of s.exercises) {
      if (e.exerciseId !== exerciseId) continue;
      for (const set of e.sets) {
        if (set.type === 'warmup') continue;
        const est = setE1RM(set)?.value ?? 0;
        if (est && (!best || est > best.kg)) best = { kg: est, date: s.date };
      }
    }
  }
  return best ? { kg: best.kg, source: `best e1RM, ${shortDate(best.date)}` } : null;
}

/**
 * The workout for one slot of a program: each planned exercise's sets pre-filled with the engine's
 * prescription, and the reasoning attached so the session screen can show it.
 */
export async function buildProgramDraft(db: TrackerDB, program: Program, slot: Slot, settings: Settings, date: string): Promise<Draft> {
  const day = program.days[slot.day];
  const deload = isDeloadWeek(program, slot.week);
  const unit = settings.unit;
  const exercises: DraftExercise[] = [];
  for (const plan of day.exercises) {
    const exercise = await db.exercises.get(plan.exerciseId);
    const history = await recentHistory(db, plan.exerciseId);
    const rx = prescribe({
      plan, exercise, week: slot.week, deload, history, unit,
      ref1RM: plan.method === 'pct' ? await referenceMax(db, program, plan.exerciseId, date) : null,
      roundKg: loadRounder(exercise, settings)
    });
    const tempo = commonTempo(history[0]?.sets ?? []) || exercise?.defaultTempo || '';
    exercises.push({
      id: newId(), exerciseId: plan.exerciseId, supersetGroup: null, restSec: null, tempo,
      notes: plan.notes, plan: { summary: rx.summary, why: rx.why },
      sets: rx.sets.map((s) => ({
        ...blankSet(exercise),
        weight: s.weightKg ? formatWeight(s.weightKg, unit) : '',
        reps: String(s.reps),
        effort: s.effort,
        distance: s.distanceM != null ? String(s.distanceM) : ''
      }))
    });
  }
  return {
    v: 2, unit, date, startedAt: nowIso(), templateId: null, notes: '', rest: null, exercises,
    program: { programId: program.id, slot: slot.key, label: `${program.name} · Week ${slot.week}${deload ? ' (deload)' : ''} · ${day.name}` }
  };
}

export async function deleteSession(db: TrackerDB, id: string) {
  const now = nowIso();
  await db.sessions.update(id, { deletedAt: now, updatedAt: now });
}

export async function saveTemplate(db: TrackerDB, input: { id?: string; name: string; exerciseNames?: string[]; exerciseIds?: string[] }) {
  await db.transaction('rw', [db.exercises, db.templates], async () => {
    const now = nowIso();
    const ids = input.exerciseIds ?? (await ensureExercises(db, input.exerciseNames ?? []));
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

/** 3 = Phase 0; 4 = Phase 1 (athletic set fields, v2 draft); 5 = Phase 4 (programs). Older formats still import. */
export const EXPORT_FORMAT = 5;

export interface ExportFile {
  app: 'workout-tracker';
  format: number;
  exportedAt: string;
  settings: Settings;
  exercises: Exercise[];
  sessions: Session[];
  templates: Template[];
  programs?: Program[]; // format 5+
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
    programs: await db.programs.toArray(),
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
      programs: f.programs ?? [],
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
  await applyLibrary(db, true); // the backup may predate the library, or this library version
  return { sessions: data.sessions.filter((s) => !s.deletedAt).length };
}
