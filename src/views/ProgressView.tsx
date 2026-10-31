import { useMemo, useState } from 'react';
import { ProgressChart } from '../components/ProgressChart';
import type { Unit } from '../db/types';
import { useExerciseMap, useSessions } from '../hooks';
import { shortDate } from '../lib/dates';
import { topSetsByDate } from '../lib/progress';
import { fromKg, round } from '../lib/units';

export function ProgressView({ unit }: { unit: Unit }) {
  const sessions = useSessions();
  const exercises = useExerciseMap();
  const [picked, setPicked] = useState('');

  // Only offer exercises that have actually been logged.
  const logged = useMemo(() => {
    const ids = new Set(sessions?.flatMap((s) => s.exerciseIds));
    return [...ids]
      .map((id) => ({ id, name: exercises.get(id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions, exercises]);

  // Default to the first exercise of the latest workout (usually the main lift).
  const exerciseId = logged.some((e) => e.id === picked) ? picked : sessions?.[0]?.exerciseIds[0] ?? '';
  const points = useMemo(() => (sessions ? topSetsByDate(sessions, exerciseId) : []), [sessions, exerciseId]);
  const labels = useMemo(() => points.map((p) => shortDate(p.date)), [points]);
  const values = useMemo(() => points.map((p) => round(fromKg(p.weightKg, unit), 2)), [points, unit]);

  if (!sessions) return null;
  if (!logged.length || !points.length) {
    return <p className="empty">Log a few workouts and your progress charts will show up here.</p>;
  }

  const best = Math.max(...values);
  const change = round(best - values[0], 2);

  return (
    <>
      <div className="card">
        <label htmlFor="progressPick">Exercise</label>
        <select id="progressPick" value={exerciseId} onChange={(e) => setPicked(e.target.value)}>
          {logged.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <div className="stats">
        <div className="card"><span className="stat-label">Best</span><span className="stat-value">{best} <small>{unit}</small></span></div>
        <div className="card">
          <span className="stat-label">Change</span>
          <span className={'stat-value' + (change > 0 ? ' up' : '')}>{change > 0 ? '+' : ''}{change} <small>{unit}</small></span>
        </div>
        <div className="card"><span className="stat-label">Sessions</span><span className="stat-value">{points.length}</span></div>
      </div>
      <div className="card">
        <ProgressChart labels={labels} values={values} unit={unit} />
        <p className="hint">Heaviest set each session.</p>
      </div>
    </>
  );
}
