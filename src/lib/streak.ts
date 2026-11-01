// Training streak: consecutive training days, where up to 2 rest days in a row keep it going.
import type { Session } from '../db/types';
import { addDays } from './weekly';

/** Rest days allowed in a row before the streak breaks. */
export const MAX_REST_DAYS = 2;

export interface Streak {
  current: number; // training days in the live streak (0 if it has ended)
  best: number; // longest streak ever, in training days
  lastDate: string | null; // most recent training day
  restDaysLeft: number; // rest days you can still take before it breaks (0 = train today)
  trainByDate: string | null; // last day you can train to keep it going
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function streak(sessions: Pick<Session, 'date'>[], today: string): Streak {
  const days = [...new Set(sessions.map((s) => s.date).filter((d) => d <= today))].sort();
  if (!days.length) return { current: 0, best: 0, lastDate: null, restDaysLeft: 0, trainByDate: null };

  // Walk oldest to newest, measuring each run of training days.
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = daysBetween(days[i - 1], days[i]) <= MAX_REST_DAYS + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }

  const lastDate = days[days.length - 1];
  const sinceLast = daysBetween(lastDate, today);
  const alive = sinceLast <= MAX_REST_DAYS + 1;
  return {
    current: alive ? run : 0,
    best,
    lastDate,
    // Trained today or yesterday: both rest days still to come. Each further day off uses one up.
    restDaysLeft: alive ? Math.min(MAX_REST_DAYS, MAX_REST_DAYS + 1 - sinceLast) : 0,
    trainByDate: alive ? addDays(lastDate, MAX_REST_DAYS + 1) : null
  };
}
