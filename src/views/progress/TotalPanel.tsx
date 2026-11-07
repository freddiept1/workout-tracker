import { useMemo } from 'react';
import { ProfileFields } from '../../components/ProfileFields';
import { useIsClientView } from '../../hooks';
import type { Exercise, Metric, Session, Settings } from '../../db/types';
import { bodyweightFor, weighIns } from '../../lib/body';
import { shortDate } from '../../lib/dates';
import { bestLifts, dots, wilks, type TotalLift } from '../../lib/powerlifting';
import { formatWeight, fromKg, round } from '../../lib/units';

interface Props {
  sessions: Session[];
  exercises: Map<string, Exercise>;
  settings: Settings;
  metrics: Metric[];
}

const LIFTS = [['squat', 'Squat'], ['bench', 'Bench'], ['deadlift', 'Deadlift']] as const;

/** Powerlifting total from your best squat, bench and deadlift, with DOTS and Wilks. */
export function TotalPanel({ sessions, exercises, settings, metrics }: Props) {
  const forClient = useIsClientView();
  const unit = settings.unit;
  const best = useMemo(() => bestLifts(sessions, exercises), [sessions, exercises]);
  const w = (kg: number) => `${formatWeight(kg, unit)} ${unit}`;
  const w1 = (kg: number) => `${round(fromKg(kg, unit), 1)} ${unit}`;

  const totals = {
    lifted: LIFTS.every(([k]) => best[k].lifted) ? LIFTS.reduce((n, [k]) => n + best[k].lifted!.weightKg, 0) : null,
    estimated: LIFTS.every(([k]) => best[k].estimated) ? LIFTS.reduce((n, [k]) => n + best[k].estimated!.e1rm, 0) : null
  };
  const body = useMemo(() => bodyweightFor(weighIns(metrics), settings.bodyweightKg), [metrics, settings.bodyweightKg]);
  const bw = body?.kg ?? null;
  const sex = settings.sex;
  const scores = (total: number | null) => (total && bw && sex ? { dots: dots(total, bw, sex), wilks: wilks(total, bw, sex) } : null);

  const row = (label: string, lift: TotalLift) => (
    <tr key={label}>
      <td><b>{label}</b></td>
      <td>{lift.lifted ? <>{w(lift.lifted.weightKg)}<span className="muted">{lift.lifted.reps > 1 ? ` × ${lift.lifted.reps}` : ''}</span></> : '–'}</td>
      <td>{lift.estimated ? w1(lift.estimated.e1rm) : '–'}</td>
      <td className="muted">{bw && lift.estimated ? `${round(lift.estimated.e1rm / bw, 2)}×` : ''}</td>
    </tr>
  );

  return (
    <>
      <div className="card">
        <table className="rm-table total-table">
          <thead><tr><th /><th>Best lifted</th><th>Best e1RM</th><th>× BW</th></tr></thead>
          <tbody>
            {LIFTS.map(([k, label]) => row(label, best[k]))}
            <tr className="total-row">
              <td><b>Total</b></td>
              <td><b>{totals.lifted ? w(totals.lifted) : '–'}</b></td>
              <td><b>{totals.estimated ? w1(totals.estimated) : '–'}</b></td>
              <td />
            </tr>
          </tbody>
        </table>
        <p className="hint">
          Competition lifts only: squat (incl. paused, high/low-bar), bench (incl. paused, touch-and-go) and deadlift (conventional or sumo). Partials like block pulls don't count.
          {LIFTS.some(([k]) => best[k].lifted) && ` Latest best: ${LIFTS.filter(([k]) => best[k].lifted).map(([k, l]) => `${l} ${shortDate(best[k].lifted!.date)}`).join(', ')}.`}
        </p>
      </div>

      <div className="card">
        <h2>Points</h2>
        {sex && bw ? (
          <div className="stats inline-stats">
            {(['lifted', 'estimated'] as const).map((kind) => {
              const s = scores(totals[kind]);
              return (
                <div key={kind}>
                  <span className="stat-label">{kind === 'lifted' ? 'From best lifts' : 'From e1RMs'}</span>
                  <span className="stat-value">{s ? round(s.dots, 1) : '–'} <small>DOTS</small></span>
                  <span className="stat-sub">{s ? `${round(s.wilks, 1)} Wilks` : 'Log all three lifts'}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="hint">Add your category and bodyweight (or log a weigh-in) to see DOTS and Wilks.</p>
        )}
        {forClient ? (
          <p className="hint">{settings.sex ? `Category: ${settings.sex === 'male' ? 'Men' : 'Women'}.` : 'Their category isn’t set (they can set it in their app).'} Bodyweight comes from their weigh-ins.</p>
        ) : (
          <ProfileFields settings={settings} logged={body?.logged ? { kg: body.kg, asOf: body.asOf! } : null} />
        )}
      </div>
    </>
  );
}
