import { useMemo, useState } from 'react';
import { ProgressChart } from '../components/ProgressChart';
import type { Unit } from '../db/types';
import { useExerciseMap, useSessions } from '../hooks';
import { shortDate } from '../lib/dates';
import { bestByDate, metricFor } from '../lib/progress';
import { MODES, modeOf } from '../lib/tracking';
import { round } from '../lib/units';

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
  const mode = modeOf(exercises.get(exerciseId));
  const metric = useMemo(() => metricFor(mode, unit), [mode, unit]);
  const points = useMemo(() => (sessions ? bestByDate(sessions, exerciseId, metric) : []), [sessions, exerciseId, metric]);
  const labels = useMemo(() => points.map((p) => shortDate(p.date)), [points]);
  const values = useMemo(() => points.map((p) => p.value), [points]);

  if (!sessions) return null;
  if (!logged.length) {
    return <p className="empty">Log a few workouts and your progress charts will show up here.</p>;
  }

  const picker = (
    <div className="card">
      <label htmlFor="progressPick">Exercise</label>
      <select id="progressPick" value={exerciseId} onChange={(e) => setPicked(e.target.value)}>
        {logged.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
    </div>
  );
  if (!points.length) return <>{picker}<p className="empty">No sets to chart for this exercise yet.</p></>;

  const best = Math.max(...values);
  const change = round(values[values.length - 1] - values[0], 2);
  const isVolume = metric.combine === 'sum';

  return (
    <>
      {picker}
      <div className="stats">
        <div className="card"><span className="stat-label">{isVolume ? 'Most in a day' : 'Best'}</span><span className="stat-value">{best} <small>{metric.unit}</small></span></div>
        <div className="card">
          <span className="stat-label">{isVolume ? 'Last vs first' : 'Change'}</span>
          <span className={'stat-value' + (change > 0 ? ' up' : '')}>{change > 0 ? '+' : ''}{change} <small>{metric.unit}</small></span>
        </div>
        <div className="card"><span className="stat-label">Sessions</span><span className="stat-value">{points.length}</span></div>
      </div>
      <div className="card">
        <ProgressChart labels={labels} values={values} unit={metric.unit} />
        <p className="hint">
          {metric.label} each session.
          {MODES[mode].rating === 'effort' && ' Athletic work is tracked by how much you do and the effort you put in.'}
        </p>
      </div>
    </>
  );
}
