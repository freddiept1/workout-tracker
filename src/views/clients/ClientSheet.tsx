import { useMemo, useState } from 'react';
import { ProgressChart } from '../../components/ProgressChart';
import { Sheet } from '../../components/Sheet';
import type { BodyweightReminder, Unit } from '../../db/types';
import { CHECKIN_FIELDS, checkinAverages, checkins, movingAverage, weighIns } from '../../lib/body';
import { longDate, shortDate } from '../../lib/dates';
import { today } from '../../lib/ids';
import { findPRs } from '../../lib/prs';
import { isDrill } from '../../lib/tracking';
import { fromKg, round } from '../../lib/units';
import { addDays, weekStart } from '../../lib/weekly';
import { refreshLinks } from '../../sync/controller';
import type { ClientEntry } from '../ClientsView';
import { ReminderPicker, TargetPicker } from './AddClientSheet';

/** One client: how they're doing, their recent workouts, and the settings you control for them. */
export function ClientSheet({ entry, unit, onClose, onOpenAthlete }: { entry: ClientEntry | null; unit: Unit; onClose: () => void; onOpenAthlete: (id: string, name: string) => void }) {
  return (
    <Sheet open={!!entry} title={entry?.link.name ?? ''} onClose={onClose}>
      {entry && (
        <>
          <button type="button" className="full" onClick={() => onOpenAthlete(entry.link.clientId!, entry.link.name)}>Open {entry.link.name.split(' ')[0]}’s training</button>
          <ClientBody entry={entry} unit={unit} onClose={onClose} />
        </>
      )}
    </Sheet>
  );
}

function ClientBody({ entry, unit, onClose }: { entry: ClientEntry; unit: Unit; onClose: () => void }) {
  const { link, data, summary: s } = entry;
  const [busy, setBusy] = useState(false);
  const date = today();
  const w = (kg: number) => round(fromKg(kg, unit), 1);

  const prs = useMemo(() => findPRs(data.sessions, data.exercises), [data]);
  const chart = useMemo(() => {
    const entries = weighIns(data.metrics);
    const avg = movingAverage(entries);
    const from = addDays(date, -90);
    const idx = entries.map((_, i) => i).filter((i) => entries[i].date >= from);
    return { labels: idx.map((i) => shortDate(entries[i].date)), values: idx.map((i) => w(avg[i].kg)), points: idx.map((i) => w(entries[i].kg)) };
  }, [data, unit, date]);
  const week = checkinAverages(checkins(data.metrics), weekStart(date), date);
  const last4 = data.sessions.filter((x) => x.date >= addDays(date, -27)).length;

  async function save(patch: { weeklyTarget?: number | null; bodyweightReminder?: BodyweightReminder }) {
    try {
      const { updateLink } = await import('../../sync/cloud');
      await updateLink(link.id, patch);
      await refreshLinks();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <>
      <div className="stats inline-stats client-detail-stats">
        <div>
          <span className="stat-label">This week</span>
          <span className="stat-value">{s.thisWeek}{s.target ? <small> / {s.target}</small> : null}</span>
          <span className="stat-sub">{last4} in the last 4 weeks</span>
        </div>
        <div>
          <span className="stat-label">Bodyweight</span>
          <span className="stat-value">{s.bodyweight ? w(s.bodyweight.kg) : '–'} <small>{s.bodyweight ? unit : ''}</small></span>
          <span className="stat-sub">{s.bodyweight?.change != null ? `${s.bodyweight.change > 0 ? '+' : ''}${w(s.bodyweight.change)} in 4 weeks` : '7-day average'}</span>
        </div>
        <div>
          <span className="stat-label">Readiness</span>
          <span className="stat-value">{s.readiness ?? '–'} <small>{s.readiness !== null ? '/ 5' : ''}</small></span>
          <span className="stat-sub">{s.checkinsThisWeek} check-in{s.checkinsThisWeek === 1 ? '' : 's'} this week</span>
        </div>
      </div>

      {s.alerts.length > 0 && (
        <ul className="client-alerts">
          {s.alerts.map((a, i) => <li key={i} className={a.good ? 'good' : ''}>{a.good ? '🏆' : '⚠️'} {a.text}</li>)}
        </ul>
      )}

      {s.program && (
        <div className="card">
          <div className="card-title">📋 {s.program.name}</div>
          <div className="card-sub">{s.program.done} of {s.program.total} days done{s.program.next ? ` · next: ${s.program.next}` : ' · finished'}</div>
          <div className="progress-bar"><span style={{ width: `${Math.round((s.program.done / Math.max(1, s.program.total)) * 100)}%` }} /></div>
        </div>
      )}

      {week.count > 0 && (
        <p className="hint">This week’s check-ins: {CHECKIN_FIELDS.map((f) => `${f.label} ${week[f.key] ?? '–'}`).join(' · ')}</p>
      )}

      {chart.values.length > 1 && (
        <div>
          <h3 className="chart-title">Bodyweight, last 3 months</h3>
          <ProgressChart labels={chart.labels} values={chart.values} points={chart.points} unit={unit} height={160} />
        </div>
      )}

      <div>
        <h3 className="chart-title">Recent workouts</h3>
        {data.sessions.length === 0 && <p className="hint">Nothing logged yet.</p>}
        <ul className="client-sessions">
          {data.sessions.slice(0, 6).map((x) => {
            const names = [...new Set(x.exercises.filter((e) => !isDrill(data.exercises.get(e.exerciseId))).map((e) => data.exercises.get(e.exerciseId)?.name ?? e.exerciseId))];
            const n = prs.get(x.id)?.length ?? 0;
            return (
              <li key={x.id}>
                <b>{longDate(x.date)}</b>{n > 0 && <span className="chip pr">🏆 {n}</span>}
                <span className="card-sub">{names.join(' · ') || 'Warm-up only'}</span>
              </li>
            );
          })}
        </ul>
        <p className="hint">{entry.lastSeen ? `Last update from ${link.name.split(' ')[0]}’s phone: ${shortDate(entry.lastSeen.slice(0, 10))}.` : ''} Open their training (top) for full history, progress, programs and logging.</p>
      </div>

      <TargetPicker value={link.weeklyTarget} onChange={(n) => void save({ weeklyTarget: n })} />
      <ReminderPicker value={link.bodyweightReminder} onChange={(r) => void save({ bodyweightReminder: r })} />

      <button type="button" className="danger full" disabled={busy} onClick={async () => {
        if (!confirm(`Stop coaching ${link.name}? You’ll no longer see their training. Their data stays in their own account.`)) return;
        setBusy(true);
        try {
          const { endCoaching } = await import('../../sync/cloud');
          await endCoaching(link.id);
          await refreshLinks();
          onClose();
        } catch (err) {
          alert((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}>Stop coaching {link.name.split(' ')[0]}</button>
    </>
  );
}
