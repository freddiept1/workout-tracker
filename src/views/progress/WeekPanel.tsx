import { useMemo, useState } from 'react';
import { ProgressChart } from '../../components/ProgressChart';
import type { Exercise, Session, Unit } from '../../db/types';
import { shortDate } from '../../lib/dates';
import { today } from '../../lib/ids';
import { describePR, type PR } from '../../lib/prs';
import { fromKg, round } from '../../lib/units';
import { addDays, calendarWeeks, inWeek, REGIONS, summariseWeek, weekStart, weeklyTonnage } from '../../lib/weekly';

interface Props {
  sessions: Session[];
  exercises: Map<string, Exercise>;
  prs: Map<string, PR[]>;
  unit: Unit;
}

const pct = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : null);

function prsByExercise(prs: PR[]): Map<string, PR[]> {
  const map = new Map<string, PR[]>();
  for (const p of prs) map.set(p.exerciseId, [...(map.get(p.exerciseId) ?? []), p]);
  return map;
}

/** Weekly recap: the chosen week against the one before, plus longer-term tonnage and consistency. */
export function WeekPanel({ sessions, exercises, prs, unit }: Props) {
  const [offset, setOffset] = useState(0); // 0 = this week
  const now = today();
  const start = addDays(weekStart(now), -7 * offset);
  const week = useMemo(() => summariseWeek(sessions, exercises, start), [sessions, exercises, start]);
  const prev = useMemo(() => summariseWeek(sessions, exercises, addDays(start, -7)), [sessions, exercises, start]);
  const weekPRs = useMemo(() => [...prs.values()].flat().filter((p) => inWeek(p.date, start)), [prs, start]);
  const tonnage = useMemo(() => weeklyTonnage(sessions, exercises, now), [sessions, exercises, now]);
  const calendar = useMemo(() => calendarWeeks(sessions, now), [sessions, now]);

  const tonnageNow = Math.round(fromKg(week.tonnageKg, unit));
  const tonnageChange = pct(week.tonnageKg, prev.tonnageKg);
  const trainedWeeks = calendar.filter((w) => w.days.some((d) => d.trained)).length;
  const sessionsIn = (w: (typeof calendar)[number]) => w.days.filter((d) => d.trained).length;
  // Average from the first week you trained (in this window), not from before you started.
  const firstWeek = calendar.findIndex((w) => w.days.some((d) => d.trained));
  const counted = firstWeek < 0 ? [] : calendar.slice(firstWeek);
  const avgPerWeek = counted.length ? round(counted.reduce((n, w) => n + sessionsIn(w), 0) / counted.length, 1) : 0;

  return (
    <>
      <div className="week-nav card">
        <button type="button" className="ghost icon" aria-label="Previous week" onClick={() => setOffset(offset + 1)}>‹</button>
        <div className="grow center">
          <div className="card-title">{offset === 0 ? 'This week' : offset === 1 ? 'Last week' : `Week of ${shortDate(start)}`}</div>
          <div className="card-sub">{shortDate(start)} – {shortDate(addDays(start, 6))}</div>
        </div>
        <button type="button" className="ghost icon" aria-label="Next week" disabled={offset === 0} onClick={() => setOffset(offset - 1)}>›</button>
      </div>

      <div className="stats">
        <div className="card">
          <span className="stat-label">Sessions</span>
          <span className="stat-value">{week.sessions}</span>
          <Delta value={week.sessions - prev.sessions} />
        </div>
        <div className="card">
          <span className="stat-label">Working sets</span>
          <span className="stat-value">{week.workingSets}</span>
          <Delta value={week.workingSets - prev.workingSets} />
        </div>
        <div className="card">
          <span className="stat-label">Tonnage</span>
          <span className="stat-value">{tonnageNow >= 10000 ? `${round(tonnageNow / 1000, 1)}k` : tonnageNow.toLocaleString()} <small>{unit}</small></span>
          {tonnageChange !== null && <Delta value={tonnageChange} suffix="%" />}
        </div>
      </div>

      {weekPRs.length > 0 && (
        <div className="card">
          <h2>🏆 {weekPRs.length} PR{weekPRs.length === 1 ? '' : 's'}</h2>
          <ul className="pr-list">
            {[...prsByExercise(weekPRs)].map(([exerciseId, list]) => {
              // Lead with the headline record; mention the rest briefly.
              const lead = list.find((p) => p.kind === 'e1rm') ?? list.find((p) => p.kind === 'weight') ?? list[0];
              const d = describePR(lead, unit);
              const others = list.filter((p) => p !== lead).map((p) => describePR(p, unit).title.toLowerCase());
              return (
                <li key={exerciseId}>
                  <span className="grow">
                    <b>{exercises.get(exerciseId)?.name}</b> · {d.title}: {d.detail}
                    {others.length > 0 && <span className="muted"> · also {others.join(', ')}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Hard sets per muscle</h2>
        <div className="muscle-bars">
          {REGIONS.map((r) => {
            const sets = round(week.hardSets.get(r.id) ?? 0, 1);
            const [lo, hi] = r.target;
            const scale = hi * 1.25;
            const state = sets < lo ? 'low' : sets > hi ? 'high' : 'ok';
            return (
              <div className="muscle-bar" key={r.id}>
                <span className="mb-label">{r.label}</span>
                <span className="mb-track">
                  <span className="mb-band" style={{ left: `${(lo / scale) * 100}%`, width: `${((hi - lo) / scale) * 100}%` }} />
                  <span className={'mb-fill ' + state} style={{ width: `${Math.min(100, (sets / scale) * 100)}%` }} />
                </span>
                <span className={'mb-value ' + state}>{sets}</span>
              </div>
            );
          })}
        </div>
        <p className="hint">
          Working sets at RPE 7+ (or no RPE). Main muscles count a full set, helpers half. The shaded band is a typical range ({REGIONS[0].target.join('–')} for big groups).
          {week.untagged > 0 && ` ${week.untagged} set${week.untagged === 1 ? '' : 's'} from exercises without muscle tags aren't counted (add them in the Exercises tab).`}
        </p>
      </div>

      {(week.athletic.sprintMetres > 0 || week.athletic.jumps > 0 || week.athletic.throws > 0) && (
        <div className="card">
          <h2>Athletic work</h2>
          <div className="stats inline-stats">
            {week.athletic.sprintMetres > 0 && <div><span className="stat-label">Sprinting</span><span className="stat-value">{week.athletic.sprintMetres} <small>m</small></span></div>}
            {week.athletic.jumps > 0 && <div><span className="stat-label">Jumps</span><span className="stat-value">{week.athletic.jumps}</span></div>}
            {week.athletic.throws > 0 && <div><span className="stat-label">Throws</span><span className="stat-value">{week.athletic.throws}</span></div>}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Tonnage by week</h2>
        <ProgressChart kind="bar" height={200} labels={tonnage.map((t) => shortDate(t.start))} values={tonnage.map((t) => Math.round(fromKg(t.tonnageKg, unit)))} unit={unit} />
        <p className="hint">Weight × reps of all lifting sets (warm-ups left out).</p>
      </div>

      <div className="card">
        <h2>Consistency</h2>
        <div className="calendar" role="img" aria-label={`Trained in ${trainedWeeks} of the last ${calendar.length} weeks`}>
          {calendar.map((w) => (
            <div className="cal-week" key={w.start}>
              {w.days.map((d) => <span key={d.date} className={'cal-day' + (d.trained ? ' on' : '') + (d.future ? ' future' : '')} title={d.date} />)}
            </div>
          ))}
        </div>
        <p className="hint">
          Last {calendar.length} weeks, Monday at the top. Trained in {trainedWeeks} of them
          {counted.length ? `, ${avgPerWeek} sessions a week on average${counted.length < calendar.length ? ' since you started' : ''}` : ''}.
        </p>
      </div>
    </>
  );
}

function Delta({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (!value) return <span className="delta">same as week before</span>;
  return <span className={'delta ' + (value > 0 ? 'up' : 'down')}>{value > 0 ? '▲' : '▼'} {Math.abs(value)}{suffix} vs week before</span>;
}
