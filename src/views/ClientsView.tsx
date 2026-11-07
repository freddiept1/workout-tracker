import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { CoachLink, Exercise } from '../db/types';
import { useExerciseMap, useLinks, useProfile, useSettings, useUnreadComments } from '../hooks';
import { shortDate } from '../lib/dates';
import { today } from '../lib/ids';
import { formatCode } from '../lib/invite';
import { ALERT_ORDER, summariseClient, type ClientSummary, type RosterAlert } from '../lib/roster';
import { round, fromKg } from '../lib/units';
import { loadAthletes, type AthleteData } from '../sync/athleteData';
import { useSyncStatus } from '../sync/controller';
import { AddClientSheet, ShareInvite } from './clients/AddClientSheet';
import { ClientSheet } from './clients/ClientSheet';

export interface ClientEntry {
  link: CoachLink;
  data: AthleteData;
  summary: ClientSummary;
  /** When their phone last sent anything. */
  lastSeen: string | null;
}

/** The coach's roster: alerts first, then every client, then invites waiting to be accepted. */
export function ClientsView({ onOpenAthlete }: { onOpenAthlete: (id: string, name: string) => void }) {
  const profile = useProfile();
  const links = useLinks();
  const baseExercises = useExerciseMap();
  const settings = useSettings();
  const sync = useSyncStatus();
  const unread = useUnreadComments();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [sharing, setSharing] = useState<CoachLink | null>(null);
  const date = today();

  const mine = links.filter((l) => l.coachId === profile?.id);
  const active = mine.filter((l) => l.status === 'active' && l.clientId);
  const ids = active.map((l) => l.clientId!).join(',');
  const loaded = useLiveQuery(() => loadAthletes(db, ids ? ids.split(',') : [], baseExercises as Map<string, Exercise>), [ids, baseExercises]);
  const entries: ClientEntry[] = useMemo(() => {
    if (!loaded) return [];
    return active
      .filter((link) => loaded.has(link.clientId!))
      .map((link) => {
        const data = loaded.get(link.clientId!)!;
        const summary = summariseClient({
          sessions: data.sessions, metrics: data.metrics, programs: data.programs, exercises: data.exercises,
          reminder: link.bodyweightReminder, target: link.weeklyTarget, joinedAt: link.joinedAt, today: date,
          unreadComments: unread.get(link.clientId!) ?? 0
        });
        const stamps = [...data.sessions, ...data.metrics, ...data.programs].map((r) => r.updatedAt);
        const lastSeen = stamps.reduce<string | null>((max, s) => (!max || s > max ? s : max), null);
        return { link, data, summary, lastSeen };
      })
      .sort((a, b) => a.link.name.localeCompare(b.link.name));
  }, [loaded, links, profile?.id, date, unread]);
  const invites = mine.filter((l) => l.status === 'invited');

  if (!sync.user) return <p className="hint">Sign in (Settings → Account) to manage clients.</p>;

  const alerts = entries
    .flatMap((e) => e.summary.alerts.map((a) => ({ entry: e, alert: a })))
    .sort((a, b) => ALERT_ORDER.indexOf(a.alert.kind) - ALERT_ORDER.indexOf(b.alert.kind));
  const current = entries.find((e) => e.link.id === open) ?? null;

  return (
    <>
      {!profile?.name && (
        <div className="notice">Add your name in Settings → Account. Clients see it on their invite.</div>
      )}
      <button type="button" className="full" onClick={() => setAdding(true)}>+ Add a client</button>

      {alerts.length > 0 && (
        <>
          <h2>Needs a look</h2>
          <div className="card alert-list">
            {alerts.map(({ entry, alert }, i) => (
              <button type="button" key={i} className="alert-row" onClick={() => setOpen(entry.link.id)}>
                <span className={'alert-dot ' + (alert.good ? 'good' : alert.kind)} aria-hidden="true" />
                <b>{entry.link.name}</b>
                <span className="grow">{alert.text}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h2>Clients{entries.length ? ` (${entries.length})` : ''}</h2>
      {entries.length === 0 && <p className="hint">No clients yet. Tap “Add a client” to send your first invite.</p>}
      {entries.map((e) => (
        <ClientCard key={e.link.id} entry={e} unit={settings.unit} onOpen={() => setOpen(e.link.id)} />
      ))}

      {invites.length > 0 && (
        <>
          <h2>Invited</h2>
          {invites.map((l) => (
            <div className="card template-card" key={l.id}>
              <div className="grow">
                <div className="card-title">{l.name}</div>
                <div className="card-sub">Code {formatCode(l.inviteCode)} · sent {shortDate(l.createdAt.slice(0, 10))}</div>
              </div>
              <button type="button" className="ghost small" onClick={() => setSharing(l)}>Share</button>
            </div>
          ))}
        </>
      )}

      <AddClientSheet open={adding} coachName={profile?.name ?? null} onClose={() => setAdding(false)} />
      <ShareInvite link={sharing} coachName={profile?.name ?? null} onClose={() => setSharing(null)} />
      <ClientSheet entry={current} unit={settings.unit} onClose={() => setOpen(null)} onOpenAthlete={(id, name) => { setOpen(null); onOpenAthlete(id, name); }} />
    </>
  );
}

function ClientCard({ entry, unit, onOpen }: { entry: ClientEntry; unit: 'kg' | 'lb'; onOpen: () => void }) {
  const { link, summary: s } = entry;
  const last = s.daysSinceSession === null ? 'No workouts yet' : s.daysSinceSession === 0 ? 'Trained today' : s.daysSinceSession === 1 ? 'Trained yesterday' : `Last workout ${s.daysSinceSession} days ago`;
  const flags = s.alerts.filter((a: RosterAlert) => !a.good).length;
  return (
    <button type="button" className="card client-card" onClick={onOpen}>
      <div className="client-head">
        <span className="card-title">{link.name}</span>
        {flags > 0 && <span className="chip warn-chip">{flags} to check</span>}
        {s.prsThisWeek > 0 && <span className="chip pr">🏆 {s.prsThisWeek}</span>}
      </div>
      <div className="card-sub">{last}</div>
      <div className="client-stats">
        <span><b>{s.thisWeek}{s.target ? `/${s.target}` : ''}</b> this week</span>
        {s.bodyweight && (
          <span>
            <b>{round(fromKg(s.bodyweight.kg, unit), 1)}</b> {unit}
            {s.bodyweight.change !== null && <small> ({s.bodyweight.change > 0 ? '+' : ''}{round(fromKg(s.bodyweight.change, unit), 1)})</small>}
          </span>
        )}
        {s.readiness !== null && <span>Readiness <b>{s.readiness}</b></span>}
      </div>
      {s.program && <div className="card-sub">📋 {s.program.name}{s.program.next ? ` · next: ${s.program.next}` : ' · finished'}</div>}
    </button>
  );
}
