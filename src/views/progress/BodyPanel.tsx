import { useMemo, useState } from 'react';
import { ProgressChart } from '../../components/ProgressChart';
import { ReminderSetting } from '../../components/ProfileFields';
import { useIsClientView } from '../../hooks';
import { db } from '../../db/db';
import { deleteMetric, saveBodyweight } from '../../db/repo';
import type { Metric, Settings } from '../../db/types';
import {
  bodyweightChange, checkinAverages, checkins, CHECKIN_FIELDS, currentBodyweight, movingAverage, readiness, roughPatch, weighIns
} from '../../lib/body';
import { shortDate } from '../../lib/dates';
import { today } from '../../lib/ids';
import { formatWeight, fromKg, parseNumber, round, toKg } from '../../lib/units';
import { addDays, weekStart } from '../../lib/weekly';

type Range = 30 | 90 | 365;

/** Bodyweight (with a 7-day average) and check-in trends. */
export function BodyPanel({ metrics, settings }: { metrics: Metric[]; settings: Settings }) {
  const forClient = useIsClientView(); // their weigh-ins are theirs to log
  const unit = settings.unit;
  const now = today();
  const [range, setRange] = useState<Range>(90);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const entries = useMemo(() => weighIns(metrics), [metrics]);
  const avg = useMemo(() => movingAverage(entries), [entries]);
  const current = currentBodyweight(entries);
  const change = bodyweightChange(entries, now);
  const w = (kg: number) => round(fromKg(kg, unit), 1);

  const chart = useMemo(() => {
    const from = addDays(now, -range);
    const idx = entries.map((_, i) => i).filter((i) => entries[i].date >= from);
    return {
      labels: idx.map((i) => shortDate(entries[i].date)),
      values: idx.map((i) => w(avg[i].kg)),
      points: idx.map((i) => w(entries[i].kg))
    };
  }, [entries, avg, range, unit, now]);

  const cis = useMemo(() => checkins(metrics), [metrics]);
  const thisWeek = weekStart(now);
  const week = checkinAverages(cis, thisWeek, now);
  const before = checkinAverages(cis, addDays(thisWeek, -28), addDays(thisWeek, -1));
  const rough = roughPatch(cis, now);

  // Weekly average readiness over the last 8 weeks.
  const trend = useMemo(() => {
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(thisWeek, -7 * (7 - i)));
    return {
      labels: weeks.map((s) => shortDate(s)),
      values: weeks.map((s) => {
        const scores = cis.filter((c) => c.date >= s && c.date <= addDays(s, 6)).map((c) => readiness(c.checkin)).filter((x): x is number => x !== null);
        return scores.length ? round(scores.reduce((a, b) => a + b, 0) / scores.length, 1) : null;
      })
    };
  }, [cis, thisWeek]);

  async function log(e: React.FormEvent) {
    e.preventDefault();
    const n = parseNumber(text);
    if (!n) return setError('Type a bodyweight first.');
    try {
      await saveBodyweight(db, now, toKg(n, unit));
      setText('');
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const recent = entries.slice(-5).reverse();
  const recentIds = new Map(metrics.filter((m) => m.kind === 'bodyweight').map((m) => [m.date, m.id]));

  return (
    <>
      <div className="card">
        <h2>Bodyweight</h2>
        <div className="stats inline-stats body-stats">
          <div>
            <span className="stat-label">7-day average</span>
            <span className="stat-value">{current ? w(current.kg) : '–'} <small>{unit}</small></span>
            <span className="stat-sub">{current ? `to ${shortDate(current.asOf)}` : 'No weigh-ins yet'}</span>
          </div>
          <div>
            <span className="stat-label">4 weeks</span>
            <span className={'stat-value' + (change ? '' : ' muted')}>{change === null ? '–' : `${change > 0 ? '+' : ''}${w(change)}`} <small>{change === null ? '' : unit}</small></span>
            <span className="stat-sub">{change === null ? 'Needs a month of weigh-ins' : 'change in average'}</span>
          </div>
        </div>
        {!forClient && (
          <form className="bw-log" onSubmit={log}>
            <input aria-label={`Today’s bodyweight (${unit})`} inputMode="decimal" placeholder={`Today (${unit})`} value={text} onChange={(e) => setText(e.target.value)} />
            <button type="submit">Log</button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
        {chart.values.length > 1 ? (
          <>
            <ProgressChart labels={chart.labels} values={chart.values} points={chart.points} unit={unit} height={200} />
            <div className="segmented small-seg">
              {([[30, '1 month'], [90, '3 months'], [365, '1 year']] as const).map(([r, label]) => (
                <button type="button" key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{label}</button>
              ))}
            </div>
            <p className="hint">Dots are single weigh-ins; the line is the 7-day average, which smooths out water and food swings.</p>
          </>
        ) : (
          <p className="hint">Log a few weigh-ins to see the chart. Weigh in at the same time each day, ideally in the morning.</p>
        )}
        {recent.length > 0 && (
          <ul className="bw-recent">
            {recent.map((e) => (
              <li key={e.date}>
                <span>{shortDate(e.date)}</span>
                <b>{formatWeight(e.kg, unit)} {unit}</b>
                {!forClient && <button type="button" className="link" aria-label={`Delete weigh-in on ${shortDate(e.date)}`} onClick={() => void deleteMetric(db, recentIds.get(e.date)!)}>Delete</button>}
              </li>
            ))}
          </ul>
        )}
        {!forClient && (
          <>
            <label className="sub reminder-label">Weigh-in reminder on the Log tab</label>
            <ReminderSetting settings={settings} />
          </>
        )}
      </div>

      <div className="card">
        <h2>Check-ins</h2>
        {rough && <div className="notice warn-notice">Three rough check-ins in a row. Worth a lighter session, more sleep or a deload.</div>}
        {cis.length === 0 ? (
          <p className="hint">Fill in the check-in on the Log tab (about 5 seconds) and trends will show here.</p>
        ) : (
          <>
            <table className="rm-table checkin-table">
              <thead><tr><th /><th>This week</th><th>Previous 4 wks</th></tr></thead>
              <tbody>
                {CHECKIN_FIELDS.map((f) => (
                  <tr key={f.key}>
                    <td><b>{f.label}</b> <small className="muted">{f.goodIsHigh ? '↑ good' : '↓ good'}</small></td>
                    <td>{week[f.key] ?? '–'}</td>
                    <td className="muted">{before[f.key] ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">{week.count} check-in{week.count === 1 ? '' : 's'} this week. Scores are 1–5.</p>
            {trend.values.filter((v) => v !== null).length > 1 && (
              <>
                <h3 className="chart-title">Readiness by week</h3>
                <ProgressChart labels={trend.labels} values={trend.values} unit="/ 5" kind="bar" height={150} min={1} max={5} />
                <p className="hint">Readiness is the average of all four, with soreness and stress flipped so 5 is always good.</p>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
