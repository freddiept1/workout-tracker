// The app's data model. See docs/DATA_MODEL.md for the full plan, including tables for later phases.
// Weights are always stored in kilograms; the kg/lb setting only affects display and input.
import { DEFAULT_EQUIPMENT } from '../lib/plates';

export type Unit = 'kg' | 'lb';

export type SetType = 'warmup' | 'working' | 'top' | 'backoff' | 'amrap' | 'drop' | 'failure';

/**
 * How an exercise is logged, which decides the fields its sets show. See src/lib/tracking.ts.
 * Athletic work records what was done and the effort put in (% of max), not measured results:
 * no times, jump heights or throw distances. Distances are in metres.
 */
export type TrackingMode =
  | 'strength' // weight × reps @ RPE
  | 'reps' // reps @ RPE (bodyweight)
  | 'sprint' // distance × reps @ effort
  | 'jump' // reps @ effort (jumps, hops, bounds)
  | 'throw' // ball weight × reps @ effort
  | 'carry' // load × distance @ effort (carries, sleds)
  | 'drill'; // warm-up drill: just ticked off against a target ("2 × 20 m"), never counted as training

export type Side = 'L' | 'R';

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
  tracking?: TrackingMode; // missing = 'strength' (everything created before Phase 1)
  unilateral?: boolean; // sets record a side (L/R)
  restSec?: number | null; // default rest after a set; missing = default for the tracking mode
  defaultDistanceM?: number | null; // pre-filled distance, e.g. 10 for "10 m Sprint"
  defaultTempo?: string | null; // e.g. "3-1-X-0", pre-filled when the exercise is added to a workout
  defaultTarget?: string | null; // warm-up drills: what to do, e.g. "2 × 20 m" or "10 each side"
  // Library tags (src/lib/muscles.ts has the vocabularies).
  parentId?: string | null; // the lift this is a variation of
  muscles?: MuscleShare[];
  pattern?: string | null;
  equipment?: string | null;
  mechanic?: 'compound' | 'isolation' | null;
  aliases?: string[]; // extra search words
  favourite?: boolean;
  mergedInto?: string | null; // set when merged into another exercise (and hidden)
}

export interface SetEntry {
  id: string;
  type: SetType;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null; // 6-10 in 0.5 steps
  tempo?: string;
  notes?: string;
  distanceM?: number | null;
  effortPct?: number | null; // athletic work: % of max effort
  side?: Side | null;
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

/** Bar and plates for one unit; weights in that unit. */
export interface PlateSetup {
  bar: number;
  collar: number; // per side
  plates: number[]; // available plate sizes (unlimited pairs)
}

// ---------- Body metrics ----------

/** 1–5 each. Sleep/energy: higher is better. Soreness/stress: higher is worse. */
export interface Checkin {
  sleep: number | null;
  energy: number | null;
  soreness: number | null;
  stress: number | null;
}

/** One record per kind per day (logging again the same day updates it). */
export interface Metric extends Owned {
  date: string; // YYYY-MM-DD
  kind: 'bodyweight' | 'checkin';
  bodyweightKg?: number | null;
  checkin?: Checkin | null;
}

export type BodyweightReminder = 'off' | 'daily' | 'weekly';

// ---------- Programs (Phase 4) ----------

/**
 * How a planned lift's load is worked out each time:
 * linear: start weight, +increment when every set hits its reps
 * double: rep range; add weight once every set reaches the top of the range
 * rpe: load from the latest e1RM and a target RPE (RPE chart)
 * pct: a percentage of 1RM, per week (waves)
 * fixed: the same load every time
 */
export type Method = 'linear' | 'double' | 'rpe' | 'pct' | 'fixed';

export interface PlannedExercise {
  id: string;
  exerciseId: string;
  sets: number;
  reps: string; // "5" or a range "8-12"
  method: Method;
  startKg: number | null; // linear/double/fixed: first-time (or fixed) load
  pcts: number[]; // pct: one value, or one per week
  rpe: number | null; // rpe: target RPE
  incrementKg: number; // linear/double
  effort: number | null; // athletic work: planned effort %
  distanceM: number | null; // sprints/carries
  notes: string;
}

export interface ProgramDay {
  id: string;
  name: string;
  exercises: PlannedExercise[];
}

export interface ProgramSlotLog {
  sessionId: string | null;
  date: string;
  skipped: boolean;
}

export interface Program extends Owned {
  name: string;
  weeks: number;
  deloadEvery: number | null; // e.g. 4 = weeks 4, 8, 12 are deloads
  days: ProgramDay[];
  maxes: { [exerciseId: string]: number }; // 1RMs entered for % work (kg); otherwise best recent e1RM
  status: 'active' | 'completed' | 'archived';
  startedAt: string | null;
  log: { [slotKey: string]: ProgramSlotLog }; // "w1d1" -> what happened
}

export interface Settings {
  unit: Unit;
  restSound: boolean;
  equipment: { kg: PlateSetup; lb: PlateSetup };
  /** For DOTS/Wilks. Bodyweight moves to a proper log in Phase 5; this stays as the fallback. */
  sex: 'male' | 'female' | null;
  bodyweightKg: number | null;
  theme: 'dark' | 'light' | 'system';
  bodyweightReminder: BodyweightReminder; // when the Log tab asks for a weigh-in
}

export const DEFAULT_SETTINGS: Settings = {
  unit: 'kg', restSound: true, equipment: DEFAULT_EQUIPMENT, sex: null, bodyweightKg: null, theme: 'dark', bodyweightReminder: 'weekly'
};

/**
 * The workout being logged, kept exactly as typed so nothing is lost if the app closes.
 * v2 (Phase 1) references exercises by id; Phase 0 drafts (no `v`) are upgraded by getDraft().
 */
export interface Draft {
  v: 2;
  unit: Unit; // unit the weight text was typed in
  date: string;
  startedAt: string;
  templateId: string | null;
  notes: string;
  exercises: DraftExercise[];
  rest: RestTimer | null;
  program?: DraftProgramRef | null; // set when the workout comes from a program (Phase 4)
}

export interface DraftProgramRef {
  programId: string;
  slot: string; // "w2d1"
  label: string; // "Strength Block · Week 2 · Day A"
}

export interface RestTimer {
  endsAt: string; // ISO; stored so the timer survives the app closing
  durationSec: number;
  draftExerciseId: string;
}

export interface DraftExercise {
  id: string;
  exerciseId: string;
  supersetGroup: string | null;
  restSec: number | null; // override for this session; null = exercise default
  notes: string;
  tempo?: string; // applies to every set without its own tempo (added in Phase 2)
  plan?: { summary: string; why: string } | null; // program prescription and its reasoning (Phase 4)
  target?: string; // warm-up drills: what to do this time
  sets: DraftSet[];
}

/** Field values are kept as typed (weight in the draft's unit). */
export interface DraftSet {
  id: string;
  type: SetType;
  weight: string;
  reps: string;
  distance: string;
  rpe: number | null;
  effort: number | null;
  tempo: string;
  notes: string;
  side: Side | null;
  done: boolean;
  completedAt: string | null;
}

/** Phase 0 draft shape, still possibly stored on a phone mid-workout. */
export interface DraftV1 {
  unit: Unit;
  date: string;
  startedAt: string;
  templateId: string | null;
  notes: string;
  exercises: { id: string; name: string; sets: { id: string; type: SetType; weight: string; reps: string }[] }[];
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
  key: 'settings' | 'draft' | 'migration' | 'library' | 'checkinSkipped' | 'sync'; // checkinSkipped: date the check-in card was dismissed
  updatedAt?: string; // settings: when they last changed (for sync)
  value: unknown;
}
