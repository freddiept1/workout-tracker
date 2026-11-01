// Installs the built-in exercise library (src/db/library.ts) and tops it up when LIBRARY_VERSION goes up.
import { exerciseIdFor, nowIso } from '../lib/ids';
import type { TrackerDB } from './db';
import { LIBRARY, LIBRARY_VERSION, type LibraryEntry } from './library';
import type { Exercise } from './types';

export function libraryExercise(entry: LibraryEntry, now: string): Exercise {
  return {
    id: exerciseIdFor(entry.name),
    name: entry.name,
    isCustom: false,
    tracking: entry.tracking ?? 'strength',
    unilateral: entry.unilateral ?? false,
    defaultDistanceM: entry.defaultDistanceM ?? null,
    defaultTempo: entry.defaultTempo ?? null,
    defaultTarget: entry.defaultTarget ?? null,
    parentId: entry.parent ? exerciseIdFor(entry.parent) : null,
    muscles: Object.entries(entry.muscles).map(([muscle, pct]) => ({ muscle, pct: pct! })),
    pattern: entry.pattern,
    equipment: entry.equipment,
    mechanic: entry.mechanic,
    aliases: entry.aliases ?? [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };
}

const TAGS = ['parentId', 'muscles', 'pattern', 'equipment', 'mechanic', 'aliases', 'defaultTempo', 'defaultDistanceM', 'defaultTarget', 'unilateral'] as const;
const isEmpty = (v: unknown) => v === undefined || v === null || (Array.isArray(v) && v.length === 0);

/**
 * Adds library exercises that are missing, and fills in empty tags on exercises that already exist
 * with the same id (e.g. "Squat" logged before the library existed). Never overwrites anything the
 * lifter set, never changes an existing exercise's tracking type (its history depends on it), and
 * never brings back an exercise the lifter hid. Runs once per LIBRARY_VERSION.
 */
export async function applyLibrary(db: TrackerDB, force = false): Promise<{ added: number; updated: number }> {
  return db.transaction('rw', [db.exercises, db.meta], async () => {
    const done = (await db.meta.get('library'))?.value as { version: number } | undefined;
    if (!force && done && done.version >= LIBRARY_VERSION) return { added: 0, updated: 0 };
    const now = nowIso();
    const wanted = LIBRARY.map((e) => libraryExercise(e, now));
    const existing = await db.exercises.bulkGet(wanted.map((e) => e.id));
    const puts: Exercise[] = [];
    let added = 0;
    let updated = 0;
    wanted.forEach((lib, i) => {
      const ex = existing[i];
      if (!ex) {
        puts.push(lib);
        added++;
      } else if (!ex.deletedAt) {
        const filled: Exercise = { ...ex };
        let changed = false;
        for (const key of TAGS) {
          if (isEmpty(ex[key]) && !isEmpty(lib[key])) {
            (filled as unknown as Record<string, unknown>)[key] = lib[key];
            changed = true;
          }
        }
        if (ex.isCustom) { filled.isCustom = false; changed = true; }
        if (changed) { puts.push({ ...filled, updatedAt: now }); updated++; }
      }
    });
    if (puts.length) await db.exercises.bulkPut(puts);
    await db.meta.put({ key: 'library', value: { version: LIBRARY_VERSION, at: now } });
    return { added, updated };
  });
}
