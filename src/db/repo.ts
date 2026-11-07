// All reads and writes go through here; UI code never touches Dexie tables directly.
import { shortDate } from '../lib/dates';
import { blankSet, commonTempo, finishPlan, newDrill, toSetEntry, upgradeDraftV1 } from '../lib/draft';
import { isDrill } from '../lib/tracking';
import { isValidComment } from '../lib/comments';
import { exerciseIdFor, newId, nowIso } from '../lib/ids';
import { isDeloadWeek, loadRounder, nextSlot, prescribe, type HistoryEntry, type PrescribeInput, type Slot } from '../lib/programs';
import { setE1RM } from '../lib/strength';
import { formatWeight, round } from '../lib/units';
import { addDays } from '../lib/weekly';
import type { TrackerDB } from './db';
import { LEGACY_KEY, isLegacyData, migrateLegacy, type MigrationResult } from './migrateLegacy';
import { applyLibrary } from './seed';
import type { Checkin, Draft, DraftExercise, DraftV1, Exercise, Metric, MigrationInfo, Program, Session, SessionComment, SessionExercise, SetEntry, Settings, Template, TrackingMode } from './types';
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
  return db.transaction('rw', [db.exercises, db.sessions, db.templates, db.programs, db.metrics, db.comments, db.meta], async () => {
    if (opts.onlyIfNotMigrated && (await db.meta.get('migration'))) return false;
    await Promise.all([db.exercises.clear(), db.sessions.clear(), db.templates.clear(), db.programs.clear(), db.metrics.clear(), db.comments.clear()]);
    await db.exercises.bulkPut(data.exercises);
    await db.sessions.bulkPut(data.sessions);
    await db.templates.bulkPut(data.templates);
    await db.programs.bulkPut(data.programs ?? []);
    await db.metrics.bulkPut(data.metrics ?? []);
    await db.comments.bulkPut(data.comments ?? []);
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

// ---------- Whose training is on screen ----------
// Coach mode: a coach's phone also holds copies of their clients' sessions, programs and metrics
// (athleteId = the client's account id). Reads use the athlete picked in the top-bar switcher;
// 'me' is always your own. Screens remount when it changes, so live queries re-run.

let current: string = ME;
export const currentAthlete = () => current;
export function setCurrentAthlete(id: string) {
  current = id;
}

/** The signed-in coach (from their profile), stamped on programs they write for clients. */
let coachIdentity: { id: string; name: string | null } | null = null;
export function setCoachIdentity(who: { id: string; name: string | null } | null) {
  coachIdentity = who;
}

/** Sessions for the current lifter, newest first. */
export async function listSessions(db: TrackerDB, athleteId = current): Promise<Session[]> {
  const all = await db.sessions.where('athleteId').equals(athleteId).filter(alive).toArray();
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
export async function lastPerformance(db: TrackerDB, exerciseId: string, athleteId = current): Promise<LastPerformance | null> {
  const sessions = await db.sessions.where('exerciseIds').equals(exerciseId).filter(alive).toArray();
  const latest = sessions.filter((s) => s.athleteId === athleteId).sort(newestFirst)[0];
  if (!latest) return null;
  const sets = latest.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets);
  return sets.length ? { date: latest.date, sets } : null;
}

// ---------- Writes ----------

export async function updateSettings(db: TrackerDB, patch: Partial<Settings>) {
  const settings = await getSettings(db);
  await db.meta.put({ key: 'settings', value: { ...settings, ...patch }, updatedAt: nowIso() });
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
  defaultTarget?: string | null; // warm-up drills
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
      defaultTarget: input.defaultTarget?.trim() || null,
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

    // Only your own history: clients' sessions belong to their accounts.
    const sessions = (await db.sessions.where('exerciseIds').equals(fromId).toArray()).filter((s) => s.athleteId === ME);
    await db.sessions.bulkPut(sessions.map((s) => {
      const exercises = s.exercises.map((e) => ({ ...e, exerciseId: swap(e.exerciseId) }));
      return { ...s, exercises, exerciseIds: [...new Set(exercises.map((e) => e.exerciseId))], updatedAt: now };
    }));

    const templates = (await db.templates.toArray()).filter((t) => t.athleteId === ME && t.exercises.some((e) => e.exerciseId === fromId));
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
        sets: ex.sets.filter((s) => plan.include(ex, s)).map((s) => toSetEntry(s, exercises.get(ex.exerciseId), draft.unit, now, ex.tempo, ex.target))
      }))
      .filter((ex) => ex.sets.length);
    if (!kept.length) return null;
    const session: Session = {
      id: newId(),
      athleteId: draft.athleteId ?? ME, // a coach logging a client's session in person
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

// ---------- Body metrics ----------

/** Metrics for the current lifter, oldest first (optionally one kind). */
export async function listMetrics(db: TrackerDB, kind?: Metric['kind'], athleteId = current): Promise<Metric[]> {
  const all = await db.metrics.where('athleteId').equals(athleteId).filter(alive).toArray();
  return all.filter((m) => !kind || m.kind === kind).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.updatedAt.localeCompare(b.updatedAt)));
}

/** The one record of a kind for a day (creating it if needed), so logging again updates it. */
async function upsertMetric(db: TrackerDB, kind: Metric['kind'], date: string, patch: Partial<Metric>): Promise<Metric> {
  return db.transaction('rw', db.metrics, async () => {
    const now = nowIso();
    const existing = (await db.metrics.where('[athleteId+kind+date]').equals([ME, kind, date]).toArray())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const metric: Metric = {
      ...(existing ?? { id: newId(), athleteId: ME, date, kind, createdAt: now }),
      ...patch,
      updatedAt: now,
      deletedAt: null
    };
    await db.metrics.put(metric);
    return metric;
  });
}

export async function saveBodyweight(db: TrackerDB, date: string, kg: number): Promise<Metric> {
  if (!(kg > 20 && kg < 400)) throw new Error('That bodyweight doesn’t look right.');
  return upsertMetric(db, 'bodyweight', date, { bodyweightKg: round(kg, 3) });
}

/** Saves some or all of a day's check-in answers (each 1–5); earlier answers that day are kept. */
export async function saveCheckin(db: TrackerDB, date: string, answers: Partial<Checkin>): Promise<Metric> {
  const existing = (await db.metrics.where('[athleteId+kind+date]').equals([ME, 'checkin', date]).filter(alive).first())?.checkin;
  const checkin: Checkin = { sleep: null, energy: null, soreness: null, stress: null, ...existing, ...answers };
  return upsertMetric(db, 'checkin', date, { checkin });
}

export async function deleteMetric(db: TrackerDB, id: string) {
  const now = nowIso();
  await db.metrics.update(id, { deletedAt: now, updatedAt: now });
}

/** "Skip today" on the check-in card. */
export async function skipCheckin(db: TrackerDB, date: string) {
  await db.meta.put({ key: 'checkinSkipped', value: date });
}

export async function checkinSkippedOn(db: TrackerDB): Promise<string | null> {
  return ((await db.meta.get('checkinSkipped'))?.value as string | undefined) ?? null;
}

// ---------- Comments on sessions (coach mode) ----------

/** Comments on the current athlete's sessions, oldest first. */
export async function listComments(db: TrackerDB, athleteId = current): Promise<SessionComment[]> {
  return (await db.comments.where('athleteId').equals(athleteId).filter((c) => alive(c) && isValidComment(c)).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Adds a comment to a session. It belongs to the session's athlete, so their coach and they both see it. */
export async function addComment(db: TrackerDB, session: Pick<Session, 'id' | 'athleteId'>, body: string, author: { id: string; name: string | null }): Promise<SessionComment> {
  const text = body.trim();
  if (!text) throw new Error('Write something first.');
  if (text.length > 2000) throw new Error('That comment is too long (2,000 characters at most).');
  const now = nowIso();
  const comment: SessionComment = {
    id: newId(), athleteId: session.athleteId, sessionId: session.id, authorId: author.id, authorName: author.name, body: text,
    createdAt: now, updatedAt: now, deletedAt: null
  };
  await db.comments.put(comment);
  await markCommentsSeen(db, session.id, now); // your own comment isn't "new" to you
  return comment;
}

export async function deleteComment(db: TrackerDB, id: string) {
  const now = nowIso();
  await db.comments.update(id, { deletedAt: now, updatedAt: now });
}

/** When you last looked at each session's comments (this phone only). */
export async function commentsSeen(db: TrackerDB): Promise<Record<string, string>> {
  return ((await db.meta.get('commentsSeen'))?.value as Record<string, string> | undefined) ?? {};
}

export async function markCommentsSeen(db: TrackerDB, sessionId: string, at = nowIso()) {
  await db.transaction('rw', db.meta, async () => {
    const seen = await commentsSeen(db);
    if ((seen[sessionId] ?? '') >= at) return;
    await db.meta.put({ key: 'commentsSeen', value: { ...seen, [sessionId]: at } });
  });
}

// ---------- Programs ----------

export async function listPrograms(db: TrackerDB, athleteId = current): Promise<Program[]> {
  return (await db.programs.where('athleteId').equals(athleteId).filter(alive).toArray()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type ProgramInput = Pick<Program, 'name' | 'weeks' | 'deloadEvery' | 'days' | 'maxes'> & {
  id?: string;
  /** New programs: whose program it is (defaults to whoever is on screen). */
  athleteId?: string;
  assignedBy?: string | null;
  coachName?: string | null;
};

/** Creates or edits a program. Editing keeps its progress (log); a new one starts active. */
export async function saveProgram(db: TrackerDB, input: ProgramInput): Promise<Program> {
  if (!input.name.trim()) throw new Error('Give the program a name.');
  if (!input.days.length) throw new Error('Add at least one day.');
  const now = nowIso();
  const existing = input.id ? await db.programs.get(input.id) : undefined;
  const athleteId = existing?.athleteId ?? input.athleteId ?? current;
  const forClient = athleteId !== ME; // a coach writing a client's program
  const program: Program = {
    status: 'active', startedAt: null, log: {}, createdAt: now,
    ...existing,
    id: existing?.id ?? newId(),
    athleteId,
    assignedBy: existing?.assignedBy ?? input.assignedBy ?? (forClient ? coachIdentity?.id ?? null : null),
    coachName: input.coachName ?? (forClient ? coachIdentity?.name : null) ?? existing?.coachName ?? null,
    name: input.name.trim(),
    weeks: Math.max(1, Math.min(52, Math.round(input.weeks))),
    deloadEvery: input.deloadEvery && input.deloadEvery > 1 ? input.deloadEvery : null,
    days: input.days,
    maxes: input.maxes,
    updatedAt: now,
    deletedAt: null
  };
  await db.programs.put(program);
  if (forClient) await copyCustomExercises(db, program);
  return program;
}

/**
 * Your custom exercises in a client's program, copied to the client (they have the built-in library
 * already). Kept in `athleteCache` marked `dirty` until the next sync sends them.
 */
async function copyCustomExercises(db: TrackerDB, program: Program) {
  const ids = [...new Set(program.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
  const mine = (await db.exercises.bulkGet(ids)).filter((e): e is Exercise => !!e && e.isCustom && !e.deletedAt);
  const theirs = await db.athleteCache.bulkGet(mine.map((e) => `${program.athleteId}/exercises/${e.id}`));
  const now = nowIso();
  const copies = mine.filter((_, i) => !theirs[i]).map((e) => ({
    key: `${program.athleteId}/exercises/${e.id}`, athleteId: program.athleteId, kind: 'exercises', id: e.id, updatedAt: now, dirty: true,
    data: { ...e, favourite: false, createdAt: now, updatedAt: now } as unknown as Record<string, unknown>
  }));
  if (copies.length) await db.athleteCache.bulkPut(copies);
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
  await db.programs.update(id, { log: {}, status: 'active', startedAt: null, restartedAt: now, updatedAt: now });
}

/**
 * Coach mode: gives a client their own copy of one of your programs (fresh progress, no 1RMs:
 * % work uses the client's own best e1RMs unless you enter theirs). Edit it per client afterwards.
 */
export async function assignProgram(db: TrackerDB, programId: string, client: { athleteId: string; coachId: string; coachName: string | null }): Promise<Program> {
  const source = await db.programs.get(programId);
  if (!source) throw new Error('Program not found.');
  const now = nowIso();
  const copy: Program = {
    ...source,
    id: newId(),
    athleteId: client.athleteId,
    assignedBy: client.coachId,
    coachName: client.coachName,
    maxes: {},
    status: 'active',
    startedAt: null,
    log: {},
    restartedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };
  await db.programs.put(copy);
  await copyCustomExercises(db, copy);
  return copy;
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
async function recentHistory(db: TrackerDB, exerciseId: string, athleteId: string, limit = 3): Promise<HistoryEntry[]> {
  const sessions = (await db.sessions.where('exerciseIds').equals(exerciseId).filter(alive).toArray()).filter((s) => s.athleteId === athleteId).sort(newestFirst);
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
    if (s.date < since || s.athleteId !== program.athleteId) continue;
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
    const history = await recentHistory(db, plan.exerciseId, program.athleteId);
    const rx = prescribe({
      plan, exercise, week: slot.week, deload, history, unit,
      ref1RM: plan.method === 'pct' ? await referenceMax(db, program, plan.exerciseId, date) : null,
      roundKg: loadRounder(exercise, settings)
    });
    if (exercise && isDrill(exercise)) {
      exercises.push(newDrill(exercise, rx.summary === 'Warm-up' ? '' : rx.summary));
      continue;
    }
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
    program: { programId: program.id, slot: slot.key, label: `${program.name} · Week ${slot.week}${deload ? ' (deload)' : ''} · ${day.name}` },
    ...(program.athleteId !== ME ? { athleteId: program.athleteId } : {})
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

/** Ready-made warm-ups using the library's drills. Edit them like any template. */
export const EXAMPLE_WARMUPS: [string, string[]][] = [
  ['Lower Body Warm-up', ['Easy Bike', 'Leg Swings', 'Lateral Leg Swings', '90/90 Hip Switches', "World's Greatest Stretch",
    'Knee-to-Wall Ankle Mobility', 'Bodyweight Glute Bridge', 'Banded Lateral Walks', 'Bodyweight Squats']],
  ['Upper Body Warm-up', ['Easy Row', 'Arm Circles', 'Band Pass-Throughs', 'Thoracic Open Books', 'Band Pull-Aparts',
    'Band Face Pull', 'Band External Rotations', 'Scapular Push-ups']],
  ['Sprint Warm-up', ['Walking Knee Hugs', 'Walking Quad Stretch', 'Frankensteins', 'Leg Swings', 'Lateral Leg Swings',
    'A-Skips', 'B-Skips', 'High Knees', 'Butt Kicks', 'Carioca', 'Lateral Shuffle', 'Ankle Hops', 'Wall Drill', 'Strides']]
];

/** Adds the example warm-up templates that aren't already there (by name). Returns how many were added. */
export async function addExampleWarmups(db: TrackerDB): Promise<number> {
  const existing = new Set((await listTemplates(db)).map((t) => t.name.toLowerCase()));
  let added = 0;
  for (const [name, exerciseNames] of EXAMPLE_WARMUPS) {
    if (existing.has(name.toLowerCase())) continue;
    await saveTemplate(db, { name, exerciseNames });
    added++;
  }
  return added;
}

export async function deleteTemplate(db: TrackerDB, id: string) {
  const now = nowIso();
  await db.templates.update(id, { deletedAt: now, updatedAt: now });
}

// ---------- Backup ----------

/** 3 = Phase 0; 4 = Phase 1 (athletic set fields, v2 draft); 5 = Phase 4 (programs); 6 = body metrics. Older formats still import. */
export const EXPORT_FORMAT = 7;

export interface ExportFile {
  app: 'workout-tracker';
  format: number;
  exportedAt: string;
  settings: Settings;
  exercises: Exercise[];
  sessions: Session[];
  templates: Template[];
  programs?: Program[]; // format 5+
  metrics?: Metric[]; // format 6+
  comments?: SessionComment[]; // format 7+
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
    // Your own training only: clients' copies belong to their accounts.
    sessions: await db.sessions.where('athleteId').equals(ME).toArray(),
    templates: await db.templates.where('athleteId').equals(ME).toArray(),
    programs: await db.programs.where('athleteId').equals(ME).toArray(),
    metrics: await db.metrics.where('athleteId').equals(ME).toArray(),
    comments: await db.comments.where('athleteId').equals(ME).toArray(),
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
      metrics: f.metrics ?? [],
      comments: f.comments ?? [],
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
