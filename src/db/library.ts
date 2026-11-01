// The built-in exercise library. Installed (and topped up when LIBRARY_VERSION goes up) by
// applyLibrary() in repo.ts. Ids are slugs of the names, so NEVER rename an entry here: that would
// orphan it from the lifter's history. Add new entries and bump LIBRARY_VERSION instead.
// Muscle percentages are the share of the work and must add up to 100 (checked by tests).
import type { Equipment, Muscle, Pattern } from '../lib/muscles';
import type { TrackingMode } from './types';

export const LIBRARY_VERSION = 1;

type Split = Partial<Record<Muscle, number>>;

export interface LibraryEntry {
  name: string;
  parent?: string; // name of the lift this is a variation of
  tracking?: TrackingMode; // default strength
  unilateral?: boolean;
  pattern: Pattern;
  equipment: Equipment;
  mechanic: 'compound' | 'isolation';
  muscles: Split;
  aliases?: string[]; // extra search words
  defaultTempo?: string;
  defaultDistanceM?: number;
}

// ---------- Muscle splits ----------

const SQ: Split = { quads: 45, glutes: 25, adductors: 15, lower_back: 10, abs: 5 };
const FSQ: Split = { quads: 55, glutes: 20, upper_back: 10, abs: 10, adductors: 5 };
const LEG_PRESS: Split = { quads: 60, glutes: 25, adductors: 10, hamstrings: 5 };
const HACK: Split = { quads: 65, glutes: 25, adductors: 10 };
const GOBLET: Split = { quads: 50, glutes: 25, adductors: 10, abs: 10, upper_back: 5 };
const LUNGE: Split = { quads: 40, glutes: 35, adductors: 10, hamstrings: 10, calves: 5 };
const BENCH: Split = { chest: 50, triceps: 25, front_delts: 25 };
const LOCKOUT: Split = { triceps: 45, chest: 35, front_delts: 20 };
const WIDE_BENCH: Split = { chest: 60, front_delts: 25, triceps: 15 };
const INCLINE: Split = { chest: 45, front_delts: 35, triceps: 20 };
const DECLINE: Split = { chest: 60, triceps: 25, front_delts: 15 };
const FLY: Split = { chest: 80, front_delts: 20 };
const PUSH_UP: Split = { chest: 45, triceps: 25, front_delts: 20, abs: 10 };
const DIP: Split = { chest: 40, triceps: 40, front_delts: 20 };
const DL: Split = { hamstrings: 25, glutes: 25, lower_back: 20, quads: 10, traps: 10, forearms: 5, lats: 5 };
const SUMO: Split = { glutes: 30, quads: 20, adductors: 15, hamstrings: 15, lower_back: 10, traps: 5, forearms: 5 };
const RACK: Split = { lower_back: 25, glutes: 25, traps: 20, hamstrings: 15, forearms: 10, lats: 5 };
const TRAP_BAR: Split = { quads: 30, glutes: 25, hamstrings: 15, lower_back: 15, traps: 10, forearms: 5 };
const RDL: Split = { hamstrings: 45, glutes: 30, lower_back: 15, forearms: 5, traps: 5 };
const GOOD_MORNING: Split = { hamstrings: 40, lower_back: 30, glutes: 30 };
const BACK_EXT: Split = { lower_back: 40, glutes: 35, hamstrings: 25 };
const HIP_THRUST: Split = { glutes: 70, hamstrings: 20, quads: 10 };
const SWING: Split = { glutes: 40, hamstrings: 30, lower_back: 15, abs: 10, forearms: 5 };
const OHP: Split = { front_delts: 45, triceps: 25, side_delts: 15, upper_back: 5, abs: 10 };
const PUSH_PRESS: Split = { front_delts: 35, triceps: 25, quads: 15, side_delts: 10, glutes: 5, abs: 10 };
const DB_PRESS: Split = { front_delts: 50, triceps: 25, side_delts: 20, abs: 5 };
const ROW: Split = { lats: 35, upper_back: 35, rear_delts: 10, biceps: 15, forearms: 5 };
const PULL_UP: Split = { lats: 50, biceps: 20, upper_back: 15, rear_delts: 5, forearms: 10 };
const CHIN_UP: Split = { lats: 45, biceps: 30, upper_back: 15, forearms: 10 };
const CURL: Split = { biceps: 85, forearms: 15 };
const CLEAN: Split = { quads: 25, glutes: 20, hamstrings: 15, traps: 15, lower_back: 10, upper_back: 10, calves: 5 };
const POWER_CLEAN: Split = { glutes: 20, hamstrings: 20, quads: 20, traps: 20, lower_back: 10, upper_back: 5, calves: 5 };
const OLY_PULL: Split = { traps: 25, hamstrings: 20, glutes: 20, lower_back: 15, quads: 10, forearms: 5, calves: 5 };
const SNATCH: Split = { quads: 20, glutes: 20, hamstrings: 15, traps: 15, upper_back: 10, lower_back: 10, front_delts: 5, side_delts: 5 };
const JERK: Split = { front_delts: 30, triceps: 25, quads: 25, glutes: 10, abs: 10 };
const CLEAN_JERK: Split = { quads: 25, glutes: 20, front_delts: 15, hamstrings: 10, traps: 10, triceps: 10, lower_back: 5, upper_back: 5 };
const OHS: Split = { quads: 40, glutes: 20, upper_back: 15, front_delts: 10, abs: 10, adductors: 5 };
const SPRINT: Split = { hamstrings: 30, glutes: 30, quads: 20, calves: 15, abs: 5 };
const AGILITY: Split = { quads: 30, glutes: 25, adductors: 15, hamstrings: 15, calves: 15 };
const JUMP: Split = { quads: 35, glutes: 30, calves: 20, hamstrings: 15 };
const BROAD: Split = { glutes: 35, quads: 30, hamstrings: 20, calves: 15 };
const HOP: Split = { calves: 30, quads: 30, glutes: 25, hamstrings: 15 };
const LATERAL: Split = { glutes: 30, calves: 25, quads: 25, adductors: 20 };
const BOUND: Split = { glutes: 35, hamstrings: 25, quads: 20, calves: 20 };

// ---------- Helpers ----------

const lift = (name: string, pattern: Pattern, equipment: Equipment, muscles: Split, extra: Partial<LibraryEntry> = {}): LibraryEntry =>
  ({ name, pattern, equipment, mechanic: 'compound', muscles, ...extra });
const iso = (name: string, equipment: Equipment, muscles: Split, extra: Partial<LibraryEntry> = {}): LibraryEntry =>
  ({ name, pattern: 'isolation', equipment, mechanic: 'isolation', muscles, ...extra });
/** A variation inherits its parent's tags unless overridden. */
const variation = (parent: LibraryEntry, name: string, extra: Partial<LibraryEntry> = {}): LibraryEntry =>
  ({ ...parent, aliases: undefined, defaultTempo: undefined, ...extra, name, parent: parent.name });

// ---------- Squat ----------

const squat = lift('Squat', 'squat', 'barbell', SQ, { aliases: ['back squat', 'competition squat'] });
const frontSquat = variation(squat, 'Front Squat', { muscles: FSQ });

// ---------- Bench ----------

const bench = lift('Bench Press', 'push_h', 'barbell', BENCH, { aliases: ['bench', 'flat bench'] });
const incline = variation(bench, 'Incline Bench Press', { muscles: INCLINE });
const dbBench = variation(bench, 'Dumbbell Bench Press', { equipment: 'dumbbell' });

// ---------- Deadlift ----------

const deadlift = lift('Deadlift', 'hinge', 'barbell', DL, { aliases: ['conventional deadlift', 'dl'] });
const sumo = variation(deadlift, 'Sumo Deadlift', { muscles: SUMO });
const rdl = variation(deadlift, 'Romanian Deadlift', { muscles: RDL, aliases: ['rdl'] });

// ---------- Overhead press ----------

const ohp = lift('Overhead Press', 'push_v', 'barbell', OHP, { aliases: ['ohp', 'military press', 'strict press', 'press'] });

// ---------- Pulls ----------

const row = lift('Barbell Row', 'pull_h', 'barbell', ROW, { aliases: ['bent over row'] });
const pullUp = lift('Pull-up', 'pull_v', 'bodyweight', PULL_UP, { aliases: ['pullup', 'pull up', 'weighted pull-up'] });

// ---------- Olympic ----------

const clean = lift('Clean', 'olympic', 'barbell', CLEAN, { aliases: ['squat clean', 'full clean'] });
const powerClean = variation(clean, 'Power Clean', { muscles: POWER_CLEAN });
const jerk = lift('Split Jerk', 'olympic', 'barbell', JERK, { aliases: ['jerk'] });
const snatch = lift('Snatch', 'olympic', 'barbell', SNATCH, { aliases: ['squat snatch', 'full snatch'] });
const powerSnatch = variation(snatch, 'Power Snatch');

// ---------- Athletic ----------

const sprint = (name: string, extra: Partial<LibraryEntry> = {}) =>
  lift(name, 'sprint', 'none', SPRINT, { tracking: 'sprint', ...extra });
const accel = sprint('Acceleration Sprint');
const jump = (name: string, muscles: Split, extra: Partial<LibraryEntry> = {}) =>
  lift(name, 'jump', 'none', muscles, { tracking: 'jump', ...extra });
const boxJump = jump('Box Jump', JUMP, { equipment: 'box' });
const broadJump = jump('Broad Jump', BROAD);
const hurdleJump = jump('Hurdle Jump', JUMP, { equipment: 'box' });
const slHop = jump('Single-Leg Hop', HOP, { unilateral: true });
const throwEx = (name: string, muscles: Split, extra: Partial<LibraryEntry> = {}) =>
  lift(name, 'throw', 'medicine_ball', muscles, { tracking: 'throw', ...extra });
const carry = (name: string, equipment: Equipment, muscles: Split) => lift(name, 'carry', equipment, muscles, { tracking: 'carry' });

export const LIBRARY: LibraryEntry[] = [
  // Squat family
  squat,
  variation(squat, 'Paused Squat', { aliases: ['pause squat'] }),
  variation(squat, 'Pin Squat'),
  variation(squat, 'Box Squat', { muscles: { glutes: 35, quads: 35, adductors: 15, lower_back: 10, hamstrings: 5 } }),
  variation(squat, 'Tempo Squat', { defaultTempo: '3-1-X-0' }),
  variation(squat, '1¼ Squat', { aliases: ['one and a quarter squat'] }),
  variation(squat, 'Anderson Squat', { aliases: ['squat from pins'] }),
  variation(squat, 'High-Bar Squat', { muscles: { quads: 50, glutes: 25, adductors: 15, lower_back: 5, abs: 5 } }),
  variation(squat, 'Low-Bar Squat', { muscles: { quads: 40, glutes: 30, adductors: 15, lower_back: 10, abs: 5 } }),
  variation(squat, 'Safety Bar Squat', { equipment: 'safety_bar', aliases: ['ssb squat'] }),
  variation(squat, 'Beltless Squat'),
  variation(squat, 'Pause Box Squat'),
  frontSquat,
  variation(frontSquat, 'Paused Front Squat'),
  variation(squat, 'Zercher Squat', { muscles: { quads: 45, glutes: 20, upper_back: 15, abs: 10, biceps: 5, adductors: 5 } }),
  variation(squat, 'Belt Squat', { equipment: 'machine', muscles: LEG_PRESS }),
  lift('Hack Squat', 'squat', 'machine', HACK),
  lift('Leg Press', 'squat', 'machine', LEG_PRESS),
  lift('Goblet Squat', 'squat', 'dumbbell', GOBLET),
  lift('Bulgarian Split Squat', 'lunge', 'dumbbell', LUNGE, { unilateral: true, aliases: ['rear foot elevated split squat', 'rfess'] }),
  lift('Split Squat', 'lunge', 'dumbbell', LUNGE, { unilateral: true }),
  lift('Walking Lunge', 'lunge', 'dumbbell', LUNGE),
  lift('Reverse Lunge', 'lunge', 'dumbbell', LUNGE, { unilateral: true }),
  lift('Step-Up', 'lunge', 'dumbbell', LUNGE, { unilateral: true }),
  iso('Leg Extension', 'machine', { quads: 100 }),

  // Bench family
  bench,
  variation(bench, 'Paused Bench Press', { aliases: ['competition bench', 'pause bench'] }),
  variation(bench, 'Long-Pause Bench Press', { aliases: ['3 second pause bench'] }),
  variation(bench, 'Touch-and-Go Bench Press', { aliases: ['tng bench'] }),
  variation(bench, 'Close-Grip Bench Press', { muscles: LOCKOUT, aliases: ['cgbp', 'close grip'] }),
  variation(bench, 'Wide-Grip Bench Press', { muscles: WIDE_BENCH }),
  variation(bench, 'Larsen Press', { aliases: ['legs up bench'] }),
  variation(bench, 'Spoto Press', { aliases: ['pause above chest'] }),
  variation(bench, 'Pin Press', { muscles: LOCKOUT }),
  variation(bench, 'Board Press', { muscles: LOCKOUT }),
  variation(bench, 'Floor Press', { muscles: LOCKOUT }),
  variation(bench, 'Tempo Bench Press', { defaultTempo: '3-1-X-0' }),
  variation(bench, 'Feet-Up Bench Press'),
  variation(bench, 'Slingshot Bench Press'),
  incline,
  variation(incline, 'Incline Dumbbell Press', { equipment: 'dumbbell' }),
  variation(bench, 'Decline Bench Press', { muscles: DECLINE }),
  dbBench,
  lift('Machine Chest Press', 'push_h', 'machine', BENCH),
  lift('Dips', 'push_h', 'bodyweight', DIP, { aliases: ['weighted dips', 'dip'] }),
  lift('Push-up', 'push_h', 'bodyweight', PUSH_UP, { tracking: 'reps', aliases: ['press up', 'pushup'] }),
  iso('Dumbbell Fly', 'dumbbell', FLY),
  iso('Cable Fly', 'cable', FLY, { aliases: ['cable crossover'] }),
  iso('Pec Deck', 'machine', FLY),

  // Deadlift and hinge family
  deadlift,
  variation(deadlift, 'Deficit Deadlift'),
  variation(deadlift, 'Paused Deadlift', { aliases: ['pause deadlift'] }),
  variation(deadlift, 'Tempo Deadlift', { defaultTempo: '3-0-X-0' }),
  variation(deadlift, 'Block Pull', { muscles: RACK }),
  variation(deadlift, 'Rack Pull', { muscles: RACK }),
  variation(deadlift, 'Snatch-Grip Deadlift', { muscles: { hamstrings: 25, glutes: 20, upper_back: 15, lower_back: 15, traps: 10, quads: 10, forearms: 5 } }),
  variation(deadlift, 'Stiff-Leg Deadlift', { muscles: RDL }),
  variation(deadlift, 'Beltless Deadlift'),
  variation(deadlift, 'Trap Bar Deadlift', { equipment: 'trap_bar', muscles: TRAP_BAR, aliases: ['hex bar deadlift'] }),
  sumo,
  variation(sumo, 'Deficit Sumo Deadlift'),
  variation(sumo, 'Paused Sumo Deadlift'),
  variation(sumo, 'Sumo Block Pull', { muscles: RACK }),
  rdl,
  variation(rdl, 'Dumbbell Romanian Deadlift', { equipment: 'dumbbell' }),
  variation(rdl, 'Single-Leg Romanian Deadlift', { equipment: 'dumbbell', unilateral: true }),
  lift('Good Morning', 'hinge', 'barbell', GOOD_MORNING),
  lift('Back Extension', 'hinge', 'bodyweight', BACK_EXT, { aliases: ['hyperextension'] }),
  lift('Reverse Hyper', 'hinge', 'machine', BACK_EXT),
  lift('Hip Thrust', 'hinge', 'barbell', HIP_THRUST),
  lift('Glute Bridge', 'hinge', 'barbell', HIP_THRUST),
  lift('Kettlebell Swing', 'hinge', 'kettlebell', SWING),
  lift('Glute-Ham Raise', 'hinge', 'machine', { hamstrings: 70, glutes: 20, lower_back: 10 }, { tracking: 'reps', aliases: ['ghr'] }),
  iso('Nordic Curl', 'bodyweight', { hamstrings: 90, glutes: 10 }, { tracking: 'reps', aliases: ['nordic hamstring curl'] }),
  iso('Leg Curl', 'machine', { hamstrings: 90, calves: 10 }, { aliases: ['hamstring curl'] }),

  // Overhead press family
  ohp,
  variation(ohp, 'Push Press', { muscles: PUSH_PRESS }),
  variation(ohp, 'Seated Overhead Press'),
  variation(ohp, 'Z Press'),
  variation(ohp, 'Paused Overhead Press'),
  variation(ohp, 'Behind-the-Neck Press'),
  variation(ohp, 'Dumbbell Shoulder Press', { equipment: 'dumbbell', muscles: DB_PRESS }),
  lift('Landmine Press', 'push_v', 'barbell', { front_delts: 45, chest: 25, triceps: 20, abs: 10 }, { unilateral: true }),
  iso('Lateral Raise', 'dumbbell', { side_delts: 85, traps: 15 }),
  iso('Rear Delt Fly', 'dumbbell', { rear_delts: 75, upper_back: 25 }),
  iso('Face Pull', 'cable', { rear_delts: 50, upper_back: 30, traps: 20 }),
  lift('Upright Row', 'pull_v', 'barbell', { side_delts: 50, traps: 40, biceps: 10 }),

  // Pulls
  row,
  variation(row, 'Pendlay Row'),
  variation(row, 'Seal Row'),
  variation(row, 'Dumbbell Row', { equipment: 'dumbbell', unilateral: true }),
  variation(row, 'Chest-Supported Row', { equipment: 'dumbbell' }),
  variation(row, 'Cable Row', { equipment: 'cable', aliases: ['seated row'] }),
  variation(row, 'T-Bar Row'),
  pullUp,
  variation(pullUp, 'Chin-up', { muscles: CHIN_UP, aliases: ['chinup', 'chin up'] }),
  lift('Lat Pulldown', 'pull_v', 'cable', PULL_UP),
  iso('Straight-Arm Pulldown', 'cable', { lats: 80, triceps: 10, abs: 10 }),
  iso('Shrug', 'barbell', { traps: 85, forearms: 15 }),

  // Arms
  iso('Biceps Curl', 'dumbbell', CURL, { aliases: ['curl', 'bicep curl'] }),
  iso('Barbell Curl', 'barbell', CURL),
  iso('Hammer Curl', 'dumbbell', { biceps: 55, forearms: 45 }),
  iso('Preacher Curl', 'ez_bar', CURL),
  iso('Triceps Pushdown', 'cable', { triceps: 100 }, { aliases: ['tricep pushdown'] }),
  iso('Skull Crusher', 'ez_bar', { triceps: 100 }, { aliases: ['lying triceps extension'] }),
  iso('Overhead Triceps Extension', 'cable', { triceps: 100 }),
  lift('JM Press', 'push_h', 'barbell', { triceps: 75, chest: 15, front_delts: 10 }),

  // Calves and core
  iso('Calf Raise', 'machine', { calves: 100 }, { aliases: ['standing calf raise'] }),
  iso('Seated Calf Raise', 'machine', { calves: 100 }),
  lift('Hanging Leg Raise', 'core', 'bodyweight', { abs: 75, obliques: 15, forearms: 10 }, { tracking: 'reps', mechanic: 'isolation' }),
  lift('Ab Wheel Rollout', 'core', 'none', { abs: 75, lats: 15, obliques: 10 }, { tracking: 'reps', mechanic: 'isolation' }),
  lift('Cable Crunch', 'core', 'cable', { abs: 85, obliques: 15 }, { mechanic: 'isolation' }),
  lift('Pallof Press', 'core', 'cable', { obliques: 60, abs: 40 }, { mechanic: 'isolation', unilateral: true }),

  // Olympic lifts
  clean,
  powerClean,
  variation(clean, 'Hang Clean'),
  variation(powerClean, 'Hang Power Clean'),
  variation(clean, 'Block Clean'),
  variation(clean, 'Clean Pull', { muscles: OLY_PULL }),
  variation(clean, 'Clean High Pull', { muscles: OLY_PULL }),
  variation(clean, 'Muscle Clean', { muscles: POWER_CLEAN }),
  lift('Clean and Jerk', 'olympic', 'barbell', CLEAN_JERK, { aliases: ['c&j', 'clean & jerk'] }),
  jerk,
  variation(jerk, 'Push Jerk'),
  variation(jerk, 'Power Jerk'),
  variation(jerk, 'Behind-the-Neck Jerk'),
  snatch,
  powerSnatch,
  variation(snatch, 'Hang Snatch'),
  variation(powerSnatch, 'Hang Power Snatch'),
  variation(snatch, 'Block Snatch'),
  variation(snatch, 'Muscle Snatch'),
  variation(snatch, 'Snatch Pull', { muscles: OLY_PULL }),
  variation(snatch, 'Snatch High Pull', { muscles: OLY_PULL }),
  variation(snatch, 'Snatch Balance', { muscles: { quads: 35, front_delts: 20, triceps: 15, upper_back: 15, glutes: 10, abs: 5 } }),
  lift('Overhead Squat', 'squat', 'barbell', OHS, { parent: 'Squat' }),

  // Sprints: distance × reps @ effort
  accel,
  variation(accel, '10 m Sprint', { defaultDistanceM: 10 }),
  variation(accel, '20 m Sprint', { defaultDistanceM: 20 }),
  variation(accel, '30 m Sprint', { defaultDistanceM: 30 }),
  variation(accel, '40 m Sprint', { defaultDistanceM: 40 }),
  sprint('Flying 10 m Sprint', { defaultDistanceM: 10, aliases: ['max velocity'] }),
  sprint('Flying 20 m Sprint', { defaultDistanceM: 20, aliases: ['max velocity'] }),
  sprint('Hill Sprint'),
  sprint('5-0-5 Agility', { unilateral: true, defaultDistanceM: 10, muscles: AGILITY, aliases: ['change of direction'] }),
  sprint('Pro Agility (5-10-5)', { defaultDistanceM: 20, muscles: AGILITY, aliases: ['change of direction', 'shuttle'] }),

  // Jumps, hops and bounds: reps @ effort
  jump('Countermovement Jump', JUMP, { aliases: ['cmj', 'vertical jump'] }),
  jump('Squat Jump', JUMP),
  boxJump,
  variation(boxJump, 'Single-Leg Box Jump', { unilateral: true }),
  jump('Depth Jump', JUMP, { equipment: 'box', aliases: ['drop jump'] }),
  broadJump,
  variation(broadJump, 'Triple Broad Jump'),
  jump('Tuck Jump', JUMP),
  hurdleJump,
  variation(hurdleJump, 'Single-Leg Hurdle Hop', { unilateral: true, muscles: HOP }),
  slHop,
  variation(slHop, 'Triple Hop'),
  jump('Lateral Hop', LATERAL, { unilateral: true }),
  jump('Crossover Hop', LATERAL, { unilateral: true }),
  jump('Pogo Hops', { calves: 80, quads: 20 }, { aliases: ['pogos'] }),
  jump('Bounds', BOUND, { aliases: ['bounding'] }),
  jump('Lateral Bounds', LATERAL, { aliases: ['skater jumps'] }),

  // Throws: ball weight × reps @ effort
  throwEx('Medicine Ball Chest Pass', { chest: 40, triceps: 30, front_delts: 30 }),
  throwEx('Overhead Medicine Ball Throw', { lats: 30, abs: 30, triceps: 20, front_delts: 20 }),
  throwEx('Rotational Medicine Ball Throw', { obliques: 45, abs: 20, glutes: 20, front_delts: 15 }, { unilateral: true, aliases: ['rotational throw'] }),
  throwEx('Medicine Ball Scoop Toss', { glutes: 35, hamstrings: 25, quads: 20, lower_back: 10, front_delts: 10 }),
  throwEx('Medicine Ball Slam', { lats: 35, abs: 35, triceps: 15, front_delts: 15 }),

  // Carries and sleds: load × distance @ effort
  carry("Farmer's Carry", 'dumbbell', { forearms: 35, traps: 30, abs: 15, glutes: 10, quads: 10 }),
  carry('Sled Push', 'sled', { quads: 45, glutes: 30, calves: 15, abs: 10 }),
  carry('Sled Drag', 'sled', { glutes: 30, hamstrings: 30, quads: 25, calves: 15 }),
  carry('Resisted Sled Sprint', 'sled', { glutes: 30, hamstrings: 25, quads: 25, calves: 20 })
];
