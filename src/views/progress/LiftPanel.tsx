import { useMemo, useState } from 'react';
import { ProgressChart } from '../../components/ProgressChart';
import type { Exercise, Session, Unit } from '../../db/types';
import { shortDate } from '../../lib/dates';
import { withVariations } from '../../lib/exerciseList';
import { today } from '../../lib/ids';
import { findPlateau } from '../../lib/plateau';
import { bestByDate, e1rmMetric, metricFor } from '../../lib/progress';
import { describePR, repMaxTable, type PR } from '../../lib/prs';
import { MODES, modeOf } from '../../lib/tracking';
import { formatWeight, round } from '../../lib/units';

interface Props {
  sessions: Session[];
  exercises: Map<string, Exercise>;
  prs: Map<string, PR[]>;
  unit: Unit;
}

export function LiftPanel({ sessions, exercises, prs, unit }: Props) {
  const [picked, setPicked] = useState('');
  const [metricKind, setMetricKind] = useState<'e1rm' | 'heaviest'>('e1rm');
  const [withVars, setWithVars] = useState(false);

  // Only offer exercises that have actually been logged.
  const logged = useMemo(() => {
    const ids = new Set(sessions.flatMap((s) => s.exerciseIds));
    return [...ids].map((id) => ({ id, name: exercises.get(id)?.name ?? id })).sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions, exercises]);

  // Default to the first exercise of the latest workout (usually the main lift).
  const exerciseId = logged.some((e) => e.id === picked) ? picked : sessions[0]?.exerciseIds[0] ?? '';
  const exercise = exercises.get(exerciseId);
  const mode = modeOf(exercise);
  const lifting = mode === 'strength';

  // Variations of this lift that have been logged, for the roll-up switch.
  const family = useMemo(() => withVariations(exerciseId, exercises), [exerciseId, exercises]);
  const loggedVariations = useMemo(() => logged.filter((e) => e.id !== exerciseId && family.has(e.id)), [logged, family, exerciseId]);
  const rollUp = withVars && loggedVariations.length > 0;
  const ids = useMemo(() => (rollUp ? family : new Set([exerciseId])), [rollUp, family, exerciseId]);

  const metric = useMemo(() => (lifting && metricKind === 'e1rm' ? e1rmMetric(unit) : metricFor(mode, unit)), [lifting, metricKind, mode, unit]);
  const points = useMemo(() => bestByDate(sessions, ids, metric, rollUp), [sessions, ids, metric, rollUp]);
  const labels = useMemo(() => points.map((p) => (rollUp ? 'w/c ' : '') + shortDate(p.date)), [points, rollUp]);
  const values = useMemo(() => points.map((p) => p.value), [points]);
  const repMaxes = useMemo(() => (lifting ? repMaxTable(sessions, ids, exercises) : []), [lifting, sessions, ids, exercises]);
  const liftPRs = useMemo(
    () => [...prs.values()].flat().filter((p) => ids.has(p.exerciseId)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12),
    [prs, ids]
  );

  const plateau = useMemo(() => (lifting ? findPlateau(sessions, exerciseId, exercises, today()) : null), [lifting, sessions, exerciseId, exercises]);

  if (!logged.length) return <p className="empty">Log a few workouts and your progress will show up here.</p>;

  const isVolume = metric.combine === 'sum';
  const best = values.length ? Math.max(...values) : 0;
  const change = values.length ? round(values[values.length - 1] - values[0], 2) : 0;

  return (
    <>
      <div className="card">
        <label htmlFor="progressPick">Exercise</label>
        <select id="progressPick" value={exerciseId} onChange={(e) => { setPicked(e.target.value); setWithVars(false); }}>
          {logged.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        {lifting && (
          <div className="segmented small-seg">
            <button type="button" className={metricKind === 'e1rm' ? 'on' : ''} onClick={() => setMetricKind('e1rm')}>Estimated 1RM</button>
            <button type="button" className={metricKind === 'heaviest' ? 'on' : ''} onClick={() => setMetricKind('heaviest')}>Heaviest set</button>
          </div>
        )}
        {loggedVariations.length > 0 && (
          <label className="toggle">
            <input type="checkbox" checked={withVars} onChange={(e) => setWithVars(e.target.checked)} />
            Include variations ({loggedVariations.map((v) => v.name).join(', ')})
          </label>
        )}
      </div>

      {plateau && (
        <div className="card plateau-card">
          <div className="card-title">⚠️ No e1RM gain for {plateau.weeks} weeks</div>
          <ul>{plateau.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}

      {points.length ? (
        <>
          <div className="stats">
            <div className="card"><span className="stat-label">{isVolume ? 'Most in a day' : 'Best'}</span><span className="stat-value">{best} <small>{metric.unit}</small></span></div>
            <div className="card">
              <span className="stat-label">{isVolume ? 'Last vs first' : 'Change'}</span>
              <span className={'stat-value' + (change > 0 ? ' up' : '')}>{change > 0 ? '+' : ''}{change} <small>{metric.unit}</small></span>
            </div>
            <div className="card"><span className="stat-label">{rollUp ? 'Weeks' : 'Sessions'}</span><span className="stat-value">{points.length}</span></div>
          </div>
          <div className="card">
            <ProgressChart labels={labels} values={values} unit={metric.unit} />
            <p className="hint">
              {metric.label} {rollUp ? 'each week, best across the lift and its variations' : 'each session'}.
              {lifting && metricKind === 'e1rm' && ' Uses the RPE chart when you logged RPE, otherwise Epley. Sets over 12 reps are left out.'}
              {MODES[mode].rating === 'effort' && ' Athletic work is tracked by how much you do and the effort you put in.'}
            </p>
          </div>
        </>
      ) : (
        <p className="empty">No sets to chart for this exercise yet.</p>
      )}

      {repMaxes.length > 0 && (
        <div className="card">
          <h2>Rep maxes</h2>
          <table className="rm-table">
            <thead><tr><th>Reps</th><th>Best</th><th>From</th><th>When</th></tr></thead>
            <tbody>
              {repMaxes.map((r) => (
                <tr key={r.reps}>
                  <td>{r.reps}RM</td>
                  <td><b>{formatWeight(r.weightKg, unit)}</b> {unit}</td>
                  <td className="muted">{r.actualReps !== r.reps ? `× ${r.actualReps}` : ''}</td>
                  <td className="muted">{shortDate(r.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">Heaviest weight lifted for at least that many reps.</p>
        </div>
      )}

      {lifting && (
        <div className="card">
          <h2>PRs</h2>
          {liftPRs.length ? (
            <ul className="pr-list">
              {liftPRs.map((p, i) => {
                const d = describePR(p, unit);
                return (
                  <li key={i}>
                    <span className="pr-icon">🏆</span>
                    <span className="grow"><b>{d.title}</b> · {d.detail}{withVars && p.exerciseId !== exerciseId ? ` (${exercises.get(p.exerciseId)?.name})` : ''}</span>
                    <span className="muted">{shortDate(p.date)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="hint">No PRs yet. Your first session of a lift is the starting point; beat it to set one.</p>
          )}
        </div>
      )}
    </>
  );
}
