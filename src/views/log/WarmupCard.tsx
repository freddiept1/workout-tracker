import type { DraftExercise, Exercise } from '../../db/types';

interface Props {
  entries: DraftExercise[]; // consecutive warm-up drills
  exercises: Map<string, Exercise>;
  onTick: (entry: DraftExercise) => void;
  onRemove: (entry: DraftExercise) => void;
}

/** Warm-up drills as a checklist: tap a row to tick it off. Nothing to type, nothing tracked. */
export function WarmupCard({ entries, exercises, onTick, onRemove }: Props) {
  const done = entries.filter((e) => e.sets[0]?.done).length;
  return (
    <div className="card warmup-card">
      <div className="warmup-head">
        <span className="card-title">Warm-up</span>
        <span className={'warmup-count' + (done === entries.length ? ' all' : '')}>{done}/{entries.length} done</span>
      </div>
      <ul className="warmup-list">
        {entries.map((e) => {
          const ticked = !!e.sets[0]?.done;
          return (
            <li key={e.id} className={ticked ? 'done' : ''}>
              <button type="button" className="warmup-row" aria-pressed={ticked} onClick={() => onTick(e)}>
                <span className={'warmup-check' + (ticked ? ' on' : '')} aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
                <span className="warmup-text">
                  <span className="warmup-name">{exercises.get(e.exerciseId)?.name ?? e.exerciseId}</span>
                  {e.target && <span className="warmup-target">{e.target}</span>}
                </span>
              </button>
              <button type="button" className="ghost icon warmup-remove" aria-label="Remove drill" onClick={() => onRemove(e)}>✕</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
