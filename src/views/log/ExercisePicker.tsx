import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { db } from '../../db/db';
import { createExercise, listExercises } from '../../db/repo';
import type { Exercise, TrackingMode } from '../../db/types';
import { MODE_ORDER, MODES, modeOf } from '../../lib/tracking';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (ex: Exercise) => void;
}

export function ExercisePicker({ open, onClose, onPick }: Props) {
  const all = useLiveQuery(() => listExercises(db), []) ?? [];
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TrackingMode | null>(null);
  const [creating, setCreating] = useState<{ tracking: TrackingMode; unilateral: boolean } | null>(null);

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => all.filter((e) => (!filter || modeOf(e) === filter) && (!q || e.name.toLowerCase().includes(q))),
    [all, filter, q]
  );
  const exact = all.some((e) => e.name.toLowerCase() === q);

  function close() {
    setQuery('');
    setCreating(null);
    onClose();
  }

  function pick(ex: Exercise) {
    onPick(ex);
    close();
  }

  async function create() {
    if (!creating || !query.trim()) return;
    pick(await createExercise(db, { name: query, ...creating }));
  }

  return (
    <Sheet open={open} title="Add exercise" onClose={close}>
      <input
        type="search" placeholder="Search or type a new exercise" autoCapitalize="words" value={query}
        onChange={(e) => { setQuery(e.target.value); setCreating(null); }}
      />
      <div className="chips scroll-x">
        <button type="button" className={'chip-btn' + (!filter ? ' on' : '')} onClick={() => setFilter(null)}>All</button>
        {MODE_ORDER.map((m) => (
          <button type="button" key={m} className={'chip-btn' + (filter === m ? ' on' : '')} onClick={() => setFilter(m)}>{MODES[m].label}</button>
        ))}
      </div>

      {q && !exact && (
        creating ? (
          <div className="card stack create-box">
            <div className="card-title">New: {query.trim()}</div>
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
              <p className="hint">{MODES[creating.tracking].hint}</p>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={creating.unilateral} onChange={(e) => setCreating({ ...creating, unilateral: e.target.checked })} />
              Single-leg / single-arm (log left and right)
            </label>
            <button type="button" className="full" onClick={create}>Create and add</button>
          </div>
        ) : (
          <button type="button" className="ghost full" onClick={() => setCreating({ tracking: filter ?? 'strength', unilateral: false })}>
            + Create “{query.trim()}”
          </button>
        )
      )}

      <ul className="pick-list">
        {shown.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => pick(e)}>
              <span>{e.name}</span>
              {modeOf(e) !== 'strength' && <span className="tag">{MODES[modeOf(e)].label}</span>}
            </button>
          </li>
        ))}
        {!shown.length && !q && <li className="hint">No exercises of this type yet.</li>}
      </ul>
    </Sheet>
  );
}
