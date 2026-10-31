// The app's data model. See docs/DATA_MODEL.md for the full plan, including tables for later phases.
// Weights are always stored in kilograms; the kg/lb setting only affects display and input.

export type Unit = 'kg' | 'lb';

export type SetType = 'warmup' | 'working' | 'top' | 'backoff' | 'amrap' | 'drop' | 'failure';

/** Fields every stored record carries, so cloud sync (Phase 7) can merge changes later. */
export interface BaseRecord {
  id: string;
  createdAt: string; // ISO timestamp
  updatedAt: string;
  deletedAt: string | null; // soft delete: hidden from the app but kept for sync
}

/** Records that belong to one lifter. Always ME for now; coach mode will add client athletes. */
export interface Owned extends BaseRecord {
  athleteId: string;
}

export const ME = 'me';

export interface MuscleShare {
  muscle: string;
  pct: number; // share of the work, 0-100
}

export interface Exercise extends BaseRecord {
  name: string;
  isCustom: boolean;
  // Filled in by the exercise library (Phase 2).
  parentId?: string | null;
  muscles?: MuscleShare[];
  pattern?: string | null;
  equipment?: string | null;
  mechanic?: 'compound' | 'isolation' | null;
  favourite?: boolean;
}

export interface SetEntry {
  id: string;
  type: SetType;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null; // 6-10 in 0.5 steps
  tempo?: string;
  notes?: string;
  completedAt: string | null; // when the set was ticked off live; null for migrated/imported history
}

export interface SessionExercise {
  id: string;
  exerciseId: string;
  supersetGroup?: string | null;
  restSec?: number | null;
  notes?: string;
  sets: SetEntry[];
}

export interface Session extends Owned {
  date: string; // YYYY-MM-DD, the training day
  startedAt: string | null;
  endedAt: string | null;
  templateId: string | null;
  programDayId?: string | null;
  notes: string;
  sessionRpe?: number | null;
  source: 'live' | 'migrated' | 'imported';
  exercises: SessionExercise[];
  exerciseIds: string[]; // copy of exercises[].exerciseId, indexed for "last time" lookups
}

export interface TemplateExercise {
  exerciseId: string;
}

export interface Template extends Owned {
  name: string;
  order: number; // position in the list
  exercises: TemplateExercise[];
}

export interface Settings {
  unit: Unit;
}

/** The workout being logged, kept exactly as typed so nothing is lost if the app closes. */
export interface Draft {
  unit: Unit; // unit the weight text was typed in
  date: string;
  startedAt: string;
  templateId: string | null;
  notes: string;
  exercises: DraftExercise[];
}

export interface DraftExercise {
  id: string;
  name: string;
  sets: DraftSet[];
}

export interface DraftSet {
  id: string;
  type: SetType;
  weight: string;
  reps: string;
}

export interface MigrationInfo {
  from: 'localStorage' | 'fresh';
  at: string;
  sourceVersion: number | null;
  sessions: number;
  sets: number;
  exercises: number;
  templates: number;
}

export interface MetaRow {
  key: 'settings' | 'draft' | 'migration';
  value: unknown;
}
