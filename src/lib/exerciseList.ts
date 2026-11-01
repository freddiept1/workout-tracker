// Searching, filtering and ordering exercises for the picker and the Exercises tab.
import type { Exercise } from '../db/types';
import { modeOf } from './tracking';

export interface Category {
  id: string;
  label: string;
  test: (e: Exercise) => boolean;
}

const byPattern = (...patterns: string[]) => (e: Exercise) => !!e.pattern && patterns.includes(e.pattern);

export const CATEGORIES: Category[] = [
  { id: 'fav', label: '★ Favourites', test: (e) => !!e.favourite },
  { id: 'warmup', label: 'Warm-ups', test: (e) => modeOf(e) === 'drill' },
  { id: 'squat', label: 'Squat', test: byPattern('squat') },
  { id: 'hinge', label: 'Hinge', test: byPattern('hinge') },
  { id: 'push', label: 'Push', test: byPattern('push_h', 'push_v') },
  { id: 'pull', label: 'Pull', test: byPattern('pull_h', 'pull_v') },
  { id: 'legs', label: 'Single-leg', test: byPattern('lunge') },
  { id: 'olympic', label: 'Olympic', test: byPattern('olympic') },
  { id: 'arms', label: 'Arms & isolation', test: byPattern('isolation') },
  { id: 'core', label: 'Core', test: byPattern('core') },
  { id: 'sprint', label: 'Sprint', test: (e) => modeOf(e) === 'sprint' },
  { id: 'jump', label: 'Jump / hop', test: (e) => modeOf(e) === 'jump' },
  { id: 'throw', label: 'Throw', test: (e) => modeOf(e) === 'throw' },
  { id: 'carry', label: 'Carry / sled', test: (e) => modeOf(e) === 'carry' },
  { id: 'mine', label: 'My exercises', test: (e) => e.isCustom }
];

export interface Filters {
  query?: string;
  category?: string | null;
  muscle?: string | null;
  equipment?: string | null;
}

/**
 * Every word of the query must appear in the name, aliases or the names of the lifts it's a
 * variation of ("close grip" finds "Close-Grip Bench Press"; "bench" finds "Spoto Press").
 */
export function matchesQuery(e: Exercise, query: string, parentNames: string[] = []): boolean {
  const words = query.toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [e.name, ...(e.aliases ?? []), ...parentNames].join(' ').toLowerCase().replace(/-/g, ' ');
  return words.every((w) => hay.includes(w));
}

/** Names of an exercise's parent, grandparent, and so on. */
function ancestorNames(e: Exercise, byId: Map<string, Exercise>): string[] {
  const names: string[] = [];
  const seen = new Set([e.id]);
  for (let p = e.parentId; p && !seen.has(p); p = byId.get(p)?.parentId) {
    seen.add(p);
    const parent = byId.get(p);
    if (parent) names.push(parent.name);
  }
  return names;
}

export function filterExercises(list: Exercise[], f: Filters, everything: Exercise[] = list): Exercise[] {
  const cat = CATEGORIES.find((c) => c.id === f.category);
  const byId = new Map(everything.map((e) => [e.id, e]));
  return list.filter((e) =>
    (!cat || cat.test(e)) &&
    (!f.muscle || (e.muscles ?? []).some((m) => m.muscle === f.muscle)) &&
    (!f.equipment || e.equipment === f.equipment) &&
    (!f.query || matchesQuery(e, f.query, ancestorNames(e, byId)))
  );
}

export interface Row {
  exercise: Exercise;
  depth: number; // 0 = parent lift, 1+ = variation
}

/**
 * Alphabetical, with each lift's variations listed under it. A variation whose parent isn't in the
 * list (filtered out or hidden) appears at the top level.
 */
export function familyOrder(list: Exercise[]): Row[] {
  const ids = new Set(list.map((e) => e.id));
  const children = new Map<string, Exercise[]>();
  const roots: Exercise[] = [];
  for (const e of list) {
    if (e.parentId && ids.has(e.parentId) && e.parentId !== e.id) {
      children.set(e.parentId, [...(children.get(e.parentId) ?? []), e]);
    } else roots.push(e);
  }
  const rows: Row[] = [];
  const seen = new Set<string>();
  const walk = (e: Exercise, depth: number) => {
    if (seen.has(e.id)) return; // guards against parent loops in bad data
    seen.add(e.id);
    rows.push({ exercise: e, depth });
    for (const c of (children.get(e.id) ?? []).sort(byName)) walk(c, depth + 1);
  };
  for (const r of roots.sort(byName)) walk(r, 0);
  return rows;
}

const byName = (a: Exercise, b: Exercise) => a.name.localeCompare(b.name);

/** The top of an exercise's family tree. */
export function rootOf(id: string, all: Map<string, Exercise>): string {
  const seen = new Set<string>();
  let cur = id;
  while (all.get(cur)?.parentId && !seen.has(cur)) {
    seen.add(cur);
    cur = all.get(cur)!.parentId!;
  }
  return cur;
}

/** Every exercise in the same family (same root lift), e.g. all squat variations. */
export function familyOf(id: string, all: Map<string, Exercise>): Exercise[] {
  const root = rootOf(id, all);
  return [...all.values()].filter((e) => !e.deletedAt && rootOf(e.id, all) === root);
}

/** An exercise and all its variations (and their variations), for rolling up strength trends. */
export function withVariations(id: string, all: Map<string, Exercise>): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of all.values()) {
      if (e.parentId && ids.has(e.parentId) && !ids.has(e.id)) { ids.add(e.id); grew = true; }
    }
  }
  return ids;
}

/** How many saved sessions each exercise appears in. */
export function usageCounts(sessions: { exerciseIds: string[] }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sessions) for (const id of s.exerciseIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}
