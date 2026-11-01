import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { ExerciseFilters, ExerciseRows } from '../../components/ExerciseList';
import { Sheet } from '../../components/Sheet';
import { db } from '../../db/db';
import { createExercise, listExercises, listSessions } from '../../db/repo';
import type { Exercise, TrackingMode } from '../../db/types';
import { familyOf, familyOrder, filterExercises, type Filters } from '../../lib/exerciseList';
import { MODE_ORDER, MODES } from '../../lib/tracking';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (ex: Exercise) => void;
  /** Swap mode: only show this exercise's family (its lift and all variations). */
  familyOfId?: string | null;
}

export function ExercisePicker({ open, onClose, onPick, familyOfId }: Props) {
  const all = useLiveQuery(() => listExercises(db), []) ?? [];
  const sessions = useLiveQuery(() => listSessions(db), []) ?? [];
  const [filters, setFilters] = useState<Filters>({});
  const [creating, setCreating] = useState<{ tracking: TrackingMode; unilateral: boolean } | null>(null);

  const byId = useMemo(() => new Map(all.map((e) => [e.id, e])), [all]);
  const pool = useMemo(() => (familyOfId ? familyOf(familyOfId, byId).filter((e) => e.id !== familyOfId) : all), [familyOfId, byId, all]);
  const shown = useMemo(() => familyOrder(filterExercises(pool, filters)), [pool, filters]);
  const q = (filters.query ?? '').trim();
  const browsing = !q && !filters.category && !familyOfId;

  // Favourites and the last few exercises you did, for one-tap adding.
  const favourites = useMemo(() => all.filter((e) => e.favourite), [all]);
  const recent = useMemo(() => {
    const ids = [...new Set(sessions.slice(0, 8).flatMap((s) => s.exerciseIds))];
    return ids.map((id) => byId.get(id)).filter((e): e is Exercise => !!e && !e.favourite).slice(0, 10);
  }, [sessions, byId]);
  const exact = all.some((e) => e.name.toLowerCase() === q.toLowerCase());

  function close() {
    setFilters({});
    setCreating(null);
    onClose();
  }

  function pick(ex: Exercise) {
    onPick(ex);
    close();
  }

  async function create() {
    if (!creating || !q) return;
    pick(await createExercise(db, { name: q, ...creating }));
  }

  const flat = (list: Exercise[]) => list.map((exercise) => ({ exercise, depth: 0 }));

  return (
    <Sheet open={open} title={familyOfId ? 'Swap for a variation' : 'Add exercise'} onClose={close}>
      <ExerciseFilters value={filters} onChange={(f) => { setFilters(f); setCreating(null); }} placeholder="Search, or type a new exercise" />

      {q && !exact && !familyOfId && (
        creating ? (
          <div className="card stack create-box">
            <div className="card-title">New: {q}</div>
            <div>
              <label>How is it logged?</label>
              <div className="chips">
                {MODE_ORDER.map((m) => (
                  <button
                    type="button" key={m} className={'chip-btn' + (creating.tracking === m ? ' on' : '')}
                    onClick={() => setCreating({ ...creating, tracking: m })}
                  >{MODES[m].label}</button>
                ))}
              </div>
              <p className="hint">{MODES[creating.tracking].hint}. Add muscles and other details later in the Exercises tab.</p>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={creating.unilateral} onChange={(e) => setCreating({ ...creating, unilateral: e.target.checked })} />
              Single-leg / single-arm (log left and right)
            </label>
            <button type="button" className="full" onClick={create}>Create and add</button>
          </div>
        ) : (
          <button type="button" className="ghost full" onClick={() => setCreating({ tracking: 'strength', unilateral: false })}>
            + Create “{q}”
          </button>
        )
      )}

      {browsing && favourites.length > 0 && (<><h3 className="list-head">★ Favourites</h3><ExerciseRows rows={flat(favourites)} onTap={pick} /></>)}
      {browsing && recent.length > 0 && (<><h3 className="list-head">Recent</h3><ExerciseRows rows={flat(recent)} onTap={pick} /></>)}
      {browsing && <h3 className="list-head">All exercises</h3>}
      <ExerciseRows rows={shown} onTap={pick} />
      {!shown.length && <p className="hint">{familyOfId ? 'No other variations of this lift yet. Add one in the Exercises tab.' : 'No matches.'}</p>}
    </Sheet>
  );
}
