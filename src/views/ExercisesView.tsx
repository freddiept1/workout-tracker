import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { ExerciseFilters, ExerciseRows } from '../components/ExerciseList';
import { db } from '../db/db';
import { restoreExercise, toggleFavourite } from '../db/repo';
import type { Exercise } from '../db/types';
import { useSessions } from '../hooks';
import { familyOrder, filterExercises, usageCounts, type Filters } from '../lib/exerciseList';
import { ExerciseEditor } from './library/ExerciseEditor';

/** The exercise library: browse, search, star, edit, add, remove and merge exercises. */
export function ExercisesView({ onMerged }: { onMerged: () => void }) {
  const all = useLiveQuery(() => db.exercises.toArray(), []) ?? [];
  const sessions = useSessions() ?? [];
  const [filters, setFilters] = useState<Filters>({});
  const [editing, setEditing] = useState<Exercise | null | 'new'>(null);

  const visible = useMemo(() => all.filter((e) => !e.deletedAt), [all]);
  const removed = useMemo(() => all.filter((e) => e.deletedAt && !e.mergedInto).sort((a, b) => a.name.localeCompare(b.name)), [all]);
  const rows = useMemo(() => familyOrder(filterExercises(visible, filters)), [visible, filters]);
  const usage = useMemo(() => usageCounts(sessions), [sessions]);
  const current = editing && editing !== 'new' ? all.find((e) => e.id === editing.id) ?? null : null;

  return (
    <>
      <ExerciseFilters value={filters} onChange={setFilters} detailed />
      <div className="row list-bar">
        <span className="hint grow">{rows.length} exercise{rows.length === 1 ? '' : 's'}</span>
        <button type="button" className="small" onClick={() => setEditing('new')}>+ New exercise</button>
      </div>

      <ExerciseRows
        rows={rows}
        detail
        onTap={setEditing}
        right={(e) => (
          <span
            role="button" tabIndex={0} aria-label={e.favourite ? 'Unstar' : 'Star'} className={'star' + (e.favourite ? ' on' : '')}
            onClick={(ev) => { ev.stopPropagation(); void toggleFavourite(db, e.id); }}
          >{e.favourite ? '★' : '☆'}</span>
        )}
      />
      {!rows.length && <p className="empty">No exercises match. Try another search, or add your own.</p>}

      {removed.length > 0 && (
        <details className="card removed">
          <summary>Removed exercises ({removed.length})</summary>
          <ul className="pick-list">
            {removed.map((e) => (
              <li key={e.id} className="removed-row">
                <span className="grow">{e.name}</span>
                <button type="button" className="ghost small" onClick={() => restoreExercise(db, e.id)}>Restore</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <ExerciseEditor
        open={editing !== null}
        exercise={current}
        usage={current ? usage.get(current.id) ?? 0 : 0}
        onClose={() => setEditing(null)}
        onMerged={onMerged}
      />
    </>
  );
}
