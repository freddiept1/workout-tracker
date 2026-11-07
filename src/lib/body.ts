// Bodyweight and check-in maths. Pure functions over Metric records (weights in kg).
import type { BodyweightReminder, Checkin, Metric } from '../db/types';
import { round } from './units';
import { addDays, weekStart } from './weekly';

export interface WeighIn {
  date: string;
  kg: number;
}

/** One weigh-in per day (the latest record for a day wins), oldest first. */
export function weighIns(metrics: Metric[]): WeighIn[] {
  const byDay = new Map<string, Metric>();
  for (const m of metrics) {
    if (m.kind !== 'bodyweight' || m.deletedAt || !m.bodyweightKg) continue;
    const prev = byDay.get(m.date);
    if (!prev || m.updatedAt > prev.updatedAt) byDay.set(m.date, m);
  }
  return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).map((m) => ({ date: m.date, kg: m.bodyweightKg! }));
}

/** Average of weigh-ins in the 7 days ending on `date` (inclusive), or null if there are none. */
export function averageAt(entries: WeighIn[], date: string, days = 7): number | null {
  const from = addDays(date, -(days - 1));
  const window = entries.filter((e) => e.date >= from && e.date <= date);
  return window.length ? round(window.reduce((n, e) => n + e.kg, 0) / window.length, 2) : null;
}

/** The 7-day average at each weigh-in, for the chart's smooth line. */
export function movingAverage(entries: WeighIn[], days = 7): WeighIn[] {
  return entries.map((e) => ({ date: e.date, kg: averageAt(entries, e.date, days)! }));
}

/** Current bodyweight: the 7-day average ending at the latest weigh-in. Daily weigh-ins are noisy. */
export function currentBodyweight(entries: WeighIn[]): { kg: number; asOf: string } | null {
  const last = entries[entries.length - 1];
  return last ? { kg: averageAt(entries, last.date)!, asOf: last.date } : null;
}

/**
 * The bodyweight to use for DOTS, Wilks and "× bodyweight": the latest 7-day average of weigh-ins,
 * falling back to the single number in the profile (settings) when nothing has been logged.
 */
export function bodyweightFor(entries: WeighIn[], profileKg: number | null): { kg: number; asOf: string | null; logged: boolean } | null {
  const c = currentBodyweight(entries);
  if (c) return { kg: c.kg, asOf: c.asOf, logged: true };
  return profileKg ? { kg: profileKg, asOf: null, logged: false } : null;
}

/** Change in the 7-day average over the last `days` days (needs a weigh-in in both windows). */
export function bodyweightChange(entries: WeighIn[], today: string, days = 28): number | null {
  const now = averageAt(entries, today);
  const then = averageAt(entries, addDays(today, -days));
  return now !== null && then !== null ? round(now - then, 2) : null;
}

/** Is a weigh-in due today under this reminder? Daily: none today. Weekly: none this Monday–Sunday week. */
export function weighInDue(reminder: BodyweightReminder, entries: WeighIn[], today: string): boolean {
  if (reminder === 'off') return false;
  const last = entries[entries.length - 1]?.date;
  if (!last) return true;
  return reminder === 'daily' ? last < today : last < weekStart(today);
}

// ---------- Check-ins ----------

export const CHECKIN_FIELDS: { key: keyof Checkin; label: string; low: string; high: string; goodIsHigh: boolean }[] = [
  { key: 'sleep', label: 'Sleep', low: 'Poor', high: 'Great', goodIsHigh: true },
  { key: 'energy', label: 'Energy', low: 'Flat', high: 'Buzzing', goodIsHigh: true },
  { key: 'soreness', label: 'Soreness', low: 'None', high: 'Very sore', goodIsHigh: false },
  { key: 'stress', label: 'Stress', low: 'Calm', high: 'Very stressed', goodIsHigh: false }
];

export interface DatedCheckin {
  date: string;
  checkin: Checkin;
}

export function checkins(metrics: Metric[]): DatedCheckin[] {
  const byDay = new Map<string, Metric>();
  for (const m of metrics) {
    if (m.kind !== 'checkin' || m.deletedAt || !m.checkin) continue;
    const prev = byDay.get(m.date);
    if (!prev || m.updatedAt > prev.updatedAt) byDay.set(m.date, m);
  }
  return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).map((m) => ({ date: m.date, checkin: m.checkin! }));
}

export const isComplete = (c: Checkin | null | undefined) => !!c && CHECKIN_FIELDS.every((f) => c[f.key] != null);

/**
 * One 1–5 "how ready am I" score: sleep and energy as they are, soreness and stress flipped
 * (so 5 is always good). Averages whatever was answered; null if nothing was.
 */
export function readiness(c: Checkin): number | null {
  const scores = CHECKIN_FIELDS.map((f) => (c[f.key] == null ? null : f.goodIsHigh ? c[f.key]! : 6 - c[f.key]!)).filter((x): x is number => x !== null);
  return scores.length ? round(scores.reduce((a, b) => a + b, 0) / scores.length, 1) : null;
}

/** Average of each answer over check-ins dated from `from` to `to` (inclusive). */
export function checkinAverages(list: DatedCheckin[], from: string, to: string): Record<keyof Checkin, number | null> & { count: number } {
  const inRange = list.filter((c) => c.date >= from && c.date <= to);
  const avg = (key: keyof Checkin) => {
    const vals = inRange.map((c) => c.checkin[key]).filter((v): v is number => v != null);
    return vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length, 1) : null;
  };
  return { sleep: avg('sleep'), energy: avg('energy'), soreness: avg('soreness'), stress: avg('stress'), count: inRange.length };
}

/**
 * A rough patch: the last 3 check-ins (within the last 5 days) all have sleep or energy at 2 or
 * below, or soreness or stress at 4 or above. Used to flag clients who may need a lighter week.
 */
export function roughPatch(list: DatedCheckin[], today: string): boolean {
  const recent = list.filter((c) => c.date <= today && c.date >= addDays(today, -4)).slice(-3);
  if (recent.length < 3) return false;
  return recent.every(({ checkin: c }) => (c.sleep ?? 5) <= 2 || (c.energy ?? 5) <= 2 || (c.soreness ?? 1) >= 4 || (c.stress ?? 1) >= 4);
}
