// Converts the old localStorage data (schema v1/v2, key `workoutTracker.v1`) into the IndexedDB model.
// Pure function: no storage access, so it can be tested directly. Nothing is dropped: unknown
// exercise names become custom exercises, and odd values are kept rather than discarded.
import { exerciseIdFor } from '../lib/ids';
import { parseNumber, toKg } from '../lib/units';
import type { Draft, Exercise, Session, SessionExercise, Settings, Template, Unit } from './types';
import { ME } from './types';

export const LEGACY_KEY = 'workoutTracker.v1';

interface LegacySet { reps?: unknown; weight?: unknown }
interface LegacyExercise { name?: unknown; sets?: LegacySet[] }
interface LegacyWorkout { id?: unknown; date?: unknown; templateId?: unknown; notes?: unknown; exercises?: LegacyExercise[] }
interface LegacyTemplate { id?: unknown; name?: unknown; exercises?: unknown[] }
interface LegacyDraft { date?: unknown; templateId?: unknown; notes?: unknown; exercises?: LegacyExercise[] }
export interface LegacyData {
  version?: number;
  settings?: { unit?: unknown };
  draft?: LegacyDraft | null;
  workouts: LegacyWorkout[];
  templates?: LegacyTemplate[];
}

export interface MigrationResult {
  settings: Settings;
  exercises: Exercise[];
  sessions: Session[];
  templates: Template[];
  draft: Draft | null;
  sourceVersion: number | null;
  setCount: number;
}

export function isLegacyData(raw: unknown): raw is LegacyData {
  return !!raw && typeof raw === 'object' && Array.isArray((raw as LegacyData).workouts);
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : v == null ? fallback : String(v));

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return parseNumber(v);
  return null;
}

export function migrateLegacy(raw: unknown, now: string, newId: () => string): MigrationResult {
  if (!isLegacyData(raw)) throw new Error('This is not workout tracker data.');

  const unit: Unit = raw.settings?.unit === 'lb' ? 'lb' : 'kg';
  const exercises = new Map<string, Exercise>();
  const base = () => ({ createdAt: now, updatedAt: now, deletedAt: null });

  // Returns the exercise id for a name, registering it on first sight (first spelling wins).
  function exerciseFor(nameRaw: unknown): string {
    const name = str(nameRaw).trim() || 'Unnamed exercise';
    const id = exerciseIdFor(name);
    if (!exercises.has(id)) exercises.set(id, { id, name, isCustom: true, ...base() });
    return id;
  }

  let setCount = 0;
  const usedIds = new Set<string>();
  const uniqueId = (v: unknown) => {
    const id = typeof v === 'string' && v && !usedIds.has(v) ? v : newId();
    usedIds.add(id);
    return id;
  };

  const sessions: Session[] = raw.workouts.map((w) => {
    const sessionExercises: SessionExercise[] = (w.exercises ?? []).map((ex) => ({
      id: newId(),
      exerciseId: exerciseFor(ex.name),
      sets: (ex.sets ?? []).map((s) => {
        setCount++;
        const weight = num(s.weight);
        return {
          id: newId(),
          type: 'working' as const,
          weightKg: weight === null ? null : toKg(weight, unit),
          reps: num(s.reps),
          rpe: null,
          completedAt: null
        };
      })
    }));
    return {
      id: uniqueId(w.id),
      athleteId: ME,
      date: str(w.date),
      startedAt: null,
      endedAt: null,
      templateId: typeof w.templateId === 'string' ? w.templateId : null,
      notes: str(w.notes),
      source: 'migrated' as const,
      exercises: sessionExercises,
      exerciseIds: [...new Set(sessionExercises.map((e) => e.exerciseId))],
      ...base()
    };
  });

  const templates: Template[] = (raw.templates ?? []).map((t, order) => ({
    id: uniqueId(t.id),
    athleteId: ME,
    name: str(t.name, 'Untitled'),
    order,
    exercises: (t.exercises ?? []).filter((n) => str(n).trim()).map((n) => ({ exerciseId: exerciseFor(n) })),
    ...base()
  }));

  let draft: Draft | null = null;
  if (raw.draft && typeof raw.draft === 'object') {
    const d = raw.draft;
    draft = {
      unit,
      date: str(d.date),
      startedAt: now,
      templateId: typeof d.templateId === 'string' ? d.templateId : null,
      notes: str(d.notes),
      exercises: (d.exercises ?? []).map((ex) => ({
        id: newId(),
        name: str(ex.name),
        sets: (ex.sets ?? []).map((s) => ({ id: newId(), type: 'working' as const, weight: str(s.weight), reps: str(s.reps) }))
      }))
    };
  }

  return {
    settings: { unit },
    exercises: [...exercises.values()],
    sessions,
    templates,
    draft,
    sourceVersion: typeof raw.version === 'number' ? raw.version : null,
    setCount
  };
}
