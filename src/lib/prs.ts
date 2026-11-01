// Personal records, worked out from history (nothing stored): editing or deleting a session updates
// PRs automatically. Only lifting counts. Athletic work is about effort, not results.
import type { Exercise, Session, SetEntry, Unit } from '../db/types';
import { isLiftSet, setE1RM, tonnageOf } from './strength';
import { formatWeight, fromKg, round } from './units';

export type PRKind = 'weight' | 'reps' | 'e1rm' | 'volume';

export interface PR {
  sessionId: string;
  date: string;
  exerciseId: string;
  setId: string | null; // null for session volume
  kind: PRKind;
  value: number; // kg (weight, e1rm, volume) for that kind
  reps: number | null; // rep PRs: the rep count it's a record for
  weightKg: number | null;
  previous: number | null;
}

export const PR_LABEL: Record<PRKind, string> = {
  weight: 'Heaviest weight',
  reps: 'Rep PR',
  e1rm: 'Estimated 1RM',
  volume: 'Session volume'
};

/** Oldest first; same day in the order they were done. */
export function chronological(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.startedAt ?? a.createdAt).localeCompare(b.startedAt ?? b.createdAt)
  );
}

interface Best {
  weight: number;
  e1rm: number;
  volume: number;
  repMax: Map<number, number>; // reps -> heaviest weight lifted for exactly that many reps
}

/** Heaviest weight lifted for at least `reps` reps. */
function heaviestFor(best: Best, reps: number): number {
  let w = 0;
  for (const [r, kg] of best.repMax) if (r >= reps && kg > w) w = kg;
  return w;
}

function absorb(best: Best, sets: SetEntry[], volume: number) {
  for (const s of sets) {
    const w = s.weightKg!;
    best.weight = Math.max(best.weight, w);
    best.e1rm = Math.max(best.e1rm, setE1RM(s)?.value ?? 0);
    best.repMax.set(s.reps!, Math.max(best.repMax.get(s.reps!) ?? 0, w));
  }
  best.volume = Math.max(best.volume, volume);
}

/**
 * PRs set in each session, keyed by session id. The first session of an exercise is its baseline
 * and sets no PRs. A heaviest-weight PR isn't also reported as a rep PR for the same set.
 */
export function findPRs(sessions: Session[], exercises: Map<string, Exercise>): Map<string, PR[]> {
  const bests = new Map<string, Best>();
  const out = new Map<string, PR[]>();
  for (const session of chronological(sessions)) {
    const prs: PR[] = [];
    // Group the session's lifting sets by exercise (an exercise can appear twice in a session).
    const byExercise = new Map<string, SetEntry[]>();
    for (const ex of session.exercises) {
      const sets = ex.sets.filter((s) => isLiftSet(s, exercises.get(ex.exerciseId)));
      if (sets.length) byExercise.set(ex.exerciseId, [...(byExercise.get(ex.exerciseId) ?? []), ...sets]);
    }
    for (const [exerciseId, sets] of byExercise) {
      const volume = sets.reduce((n, s) => n + tonnageOf(s), 0);
      const best = bests.get(exerciseId);
      if (!best) {
        const fresh: Best = { weight: 0, e1rm: 0, volume: 0, repMax: new Map() };
        absorb(fresh, sets, volume);
        bests.set(exerciseId, fresh);
        continue;
      }
      const base = { sessionId: session.id, date: session.date, exerciseId };
      const heaviest = sets.reduce((a, b) => (b.weightKg! > a.weightKg! ? b : a));
      if (heaviest.weightKg! > best.weight) {
        prs.push({ ...base, setId: heaviest.id, kind: 'weight', value: heaviest.weightKg!, reps: heaviest.reps, weightKg: heaviest.weightKg, previous: best.weight });
      }
      // Best rep PR per rep count (skipping the set already reported as heaviest weight).
      const repPRs = new Map<number, SetEntry>();
      for (const s of sets) {
        if (s === heaviest && heaviest.weightKg! > best.weight) continue;
        if (s.weightKg! > heaviestFor(best, s.reps!) && s.weightKg! > (repPRs.get(s.reps!)?.weightKg ?? 0)) repPRs.set(s.reps!, s);
      }
      for (const [reps, s] of repPRs) {
        prs.push({ ...base, setId: s.id, kind: 'reps', value: s.weightKg!, reps, weightKg: s.weightKg, previous: heaviestFor(best, reps) || null });
      }
      const top = sets.map((s) => ({ s, e: setE1RM(s)?.value ?? 0 })).reduce((a, b) => (b.e > a.e ? b : a));
      if (top.e > best.e1rm) {
        prs.push({ ...base, setId: top.s.id, kind: 'e1rm', value: top.e, reps: top.s.reps, weightKg: top.s.weightKg, previous: best.e1rm });
      }
      if (volume > best.volume) {
        prs.push({ ...base, setId: null, kind: 'volume', value: volume, reps: null, weightKg: null, previous: best.volume });
      }
      absorb(best, sets, volume);
    }
    if (prs.length) out.set(session.id, prs);
  }
  return out;
}

/** "e1RM 182.5 kg", "+2.5 kg" style text for a PR, in the lifter's unit. */
export function describePR(pr: PR, unit: Unit): { title: string; detail: string } {
  const w = (kg: number) => `${formatWeight(kg, unit)} ${unit}`;
  const w1 = (kg: number) => `${round(fromKg(kg, unit), 1)} ${unit}`; // estimates: 1 decimal is plenty
  const gain = pr.previous ? ` (+${pr.kind === 'e1rm' ? round(fromKg(pr.value - pr.previous, unit), 1) : formatWeight(pr.value - pr.previous, unit)})` : '';
  switch (pr.kind) {
    case 'weight': return { title: 'Heaviest weight', detail: `${w(pr.value)} × ${pr.reps}${gain}` };
    case 'reps': return { title: `${pr.reps}-rep max`, detail: `${w(pr.value)}${pr.previous ? gain : ' (first time)'}` };
    case 'e1rm': return { title: 'Estimated 1RM', detail: `${w1(pr.value)}${gain} from ${w(pr.weightKg!)} × ${pr.reps}` };
    case 'volume': return { title: 'Session volume', detail: `${Math.round(fromKg(pr.value, unit)).toLocaleString()} ${unit}${gain}` };
  }
}

export interface RepMaxRow {
  reps: number;
  weightKg: number;
  actualReps: number; // the set it came from may have had more reps
  date: string;
}

/** Best 1RM–12RM: heaviest weight lifted for at least N reps, with when. */
export function repMaxTable(sessions: Session[], exerciseIds: Set<string>, exercises: Map<string, Exercise>, maxReps = 12): RepMaxRow[] {
  const sets: { s: SetEntry; date: string }[] = [];
  for (const session of sessions) {
    for (const ex of session.exercises) {
      if (!exerciseIds.has(ex.exerciseId)) continue;
      for (const s of ex.sets) if (isLiftSet(s, exercises.get(ex.exerciseId))) sets.push({ s, date: session.date });
    }
  }
  const rows: RepMaxRow[] = [];
  for (let reps = 1; reps <= maxReps; reps++) {
    let best: { s: SetEntry; date: string } | null = null;
    for (const x of sets) {
      if (x.s.reps! < reps) continue;
      if (!best || x.s.weightKg! > best.s.weightKg! || (x.s.weightKg === best.s.weightKg && x.date < best.date)) best = x;
    }
    if (best) rows.push({ reps, weightKg: best.s.weightKg!, actualReps: best.s.reps!, date: best.date });
  }
  return rows;
}
