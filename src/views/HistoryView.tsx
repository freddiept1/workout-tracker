import { db } from '../db/db';
import { deleteSession } from '../db/repo';
import type { Unit } from '../db/types';
import { useExerciseMap, useSessions, useTemplates } from '../hooks';
import { longDate } from '../lib/dates';
import { formatWeight } from '../lib/units';

export function HistoryView({ unit }: { unit: Unit }) {
  const sessions = useSessions();
  const templates = useTemplates();
  const exercises = useExerciseMap();
  if (!sessions) return null;

  if (!sessions.length) {
    return <p className="empty">No workouts yet.<br />Log one from the Log tab.</p>;
  }

  return (
    <>
      <h2>{sessions.length} workout{sessions.length === 1 ? '' : 's'}</h2>
      {sessions.map((s) => {
        const template = templates?.find((t) => t.id === s.templateId);
        const setCount = s.exercises.reduce((n, ex) => n + ex.sets.length, 0);
        return (
          <details className="card" key={s.id}>
            <summary>
              <span>
                <span className="card-title">{longDate(s.date)}</span>
                <br />
                <span className="card-sub">
                  {template ? template.name + ' · ' : ''}
                  {s.exercises.length} exercise{s.exercises.length === 1 ? '' : 's'} · {setCount} sets
                </span>
              </span>
              <svg className="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </summary>
            <div className="workout-detail">
              {s.exercises.map((ex) => (
                <div key={ex.id}>
                  <div className="card-title">{exercises.get(ex.exerciseId)?.name ?? ex.exerciseId}</div>
                  <div className="set-chips">
                    {ex.sets.map((set) => (
                      <span className="chip" key={set.id}>{set.reps} × {formatWeight(set.weightKg, unit) || 0} {unit}</span>
                    ))}
                  </div>
                </div>
              ))}
              {s.notes && <p className="muted">{s.notes}</p>}
              <button
                type="button" className="danger small"
                onClick={() => confirm('Delete this workout? This cannot be undone.') && deleteSession(db, s.id)}
              >Delete workout</button>
            </div>
          </details>
        );
      })}
    </>
  );
}
