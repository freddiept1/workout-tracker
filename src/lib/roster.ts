// Coach roster: one summary per client, and the alerts worth a look (worst first). Pure, computed from data.
import type { BodyweightReminder, Exercise, Metric, Program, Session } from '../db/types';
import { bodyweightChange, checkins, currentBodyweight, readiness, roughPatch, weighIns } from './body';
import { findPlateaus } from './plateau';
import { nextSlot, progressOf } from './programs';
import { findPRs } from './prs';
import { round } from './units';
import { addDays, weekStart } from './weekly';

export type AlertKind = 'inactive' | 'behind' | 'stalled' | 'rough' | 'weighin' | 'pr';

export interface RosterAlert {
  kind: AlertKind;
  text: string;
  /** Good news (PRs) rather than something to act on. */
  good?: boolean;
}

export interface ClientSummary {
  lastSession: string | null;
  daysSinceSession: number | null;
  thisWeek: number;
  target: number | null;
  program: { name: string; next: string | null; done: number; total: number } | null;
  bodyweight: { kg: number; change: number | null } | null;
  /** Average readiness (1–5) over the last 7 days of check-ins. */
  readiness: number | null;
  checkinsThisWeek: number;
  /** Lifts with a new PR in the last 7 days. */
  prsThisWeek: number;
  alerts: RosterAlert[];
}

export interface ClientInput {
  sessions: Session[];
  metrics: Metric[];
  programs: Program[];
  exercises: Map<string, Exercise>;
  reminder: BodyweightReminder;
  target: number | null;
  /** When they joined (ISO); alerts about not doing things wait until they've had time to. */
  joinedAt: string | null;
  today: string;
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function summariseClient(c: ClientInput): ClientSummary {
  const { today } = c;
  const joinedDay = c.joinedAt?.slice(0, 10) ?? today;
  const memberDays = daysBetween(joinedDay, today);
  const alerts: RosterAlert[] = [];

  // Sessions.
  const dates = [...new Set(c.sessions.map((s) => s.date))].sort();
  const lastSession = dates.at(-1) ?? null;
  const daysSinceSession = lastSession ? daysBetween(lastSession, today) : null;
  const monday = weekStart(today);
  const thisWeek = c.sessions.filter((s) => s.date >= monday && s.date <= today).length;
  if (daysSinceSession === null ? memberDays >= 7 : daysSinceSession >= 7) {
    alerts.push({ kind: 'inactive', text: daysSinceSession === null ? 'No workouts logged yet' : `No workout for ${daysSinceSession} days` });
  }
  const daysLeft = 7 - daysBetween(monday, today); // including today
  if (c.target && thisWeek < c.target && c.target - thisWeek > daysLeft && memberDays >= daysBetween(monday, today)) {
    alerts.push({ kind: 'behind', text: `Behind target: ${thisWeek} of ${c.target} this week` });
  }

  // Lifts.
  for (const p of findPlateaus(c.sessions, c.exercises, today).slice(0, 2)) {
    alerts.push({ kind: 'stalled', text: `${c.exercises.get(p.exerciseId)?.name ?? p.exerciseId} stalled for ${plural(p.weeks, 'week')}` });
  }
  const prs = findPRs(c.sessions, c.exercises);
  const weekAgo = addDays(today, -6);
  const prLifts = [...new Set(c.sessions.filter((s) => s.date >= weekAgo).flatMap((s) => (prs.get(s.id) ?? []).map((p) => p.exerciseId)))];
  const prsThisWeek = prLifts.length;
  if (prsThisWeek) {
    const names = prLifts.map((id) => c.exercises.get(id)?.name ?? id);
    alerts.push({ kind: 'pr', text: `PR${names.length > 1 ? 's' : ''} this week: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`, good: true });
  }

  // Body.
  const entries = weighIns(c.metrics);
  const bw = currentBodyweight(entries);
  const cis = checkins(c.metrics);
  const recent = cis.filter((x) => x.date >= weekAgo && x.date <= today).map((x) => readiness(x.checkin)).filter((x): x is number => x !== null);
  if (roughPatch(cis, today)) alerts.push({ kind: 'rough', text: 'Low check-ins 3 days running' });
  if (missedWeighIn(c.reminder, entries.at(-1)?.date ?? null, today, memberDays)) {
    alerts.push({ kind: 'weighin', text: entries.length ? `No weigh-in since ${entries.at(-1)!.date.slice(5).split('-').reverse().join('/')}` : 'No weigh-ins yet' });
  }

  // Program.
  const active = c.programs.find((p) => p.status === 'active') ?? null;
  let program: ClientSummary['program'] = null;
  if (active) {
    const next = nextSlot(active);
    const prog = progressOf(active);
    program = {
      name: active.name,
      next: next ? `Week ${next.week} · ${active.days[next.day]?.name ?? ''}` : null,
      done: prog.done,
      total: prog.total
    };
  }

  return {
    lastSession,
    daysSinceSession,
    thisWeek,
    target: c.target,
    program,
    bodyweight: bw ? { kg: bw.kg, change: bodyweightChange(entries, today) } : null,
    readiness: recent.length ? round(recent.reduce((a, b) => a + b, 0) / recent.length, 1) : null,
    checkinsThisWeek: cis.filter((x) => x.date >= monday && x.date <= today).length,
    prsThisWeek,
    alerts: alerts.sort((a, b) => ALERT_ORDER.indexOf(a.kind) - ALERT_ORDER.indexOf(b.kind))
  };
}

/** Daily reminder: nothing in the last 3 days. Weekly: nothing in the last 10. Off: never. */
export function missedWeighIn(reminder: BodyweightReminder, last: string | null, today: string, memberDays: number): boolean {
  if (reminder === 'off') return false;
  const allowed = reminder === 'daily' ? 3 : 10;
  if (!last) return memberDays >= allowed;
  return daysBetween(last, today) >= allowed;
}

/** Worst first: things to act on before good news. */
export const ALERT_ORDER: AlertKind[] = ['inactive', 'behind', 'rough', 'weighin', 'stalled', 'pr'];
