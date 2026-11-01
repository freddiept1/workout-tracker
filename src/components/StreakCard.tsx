import { useMemo } from 'react';
import type { Session } from '../db/types';
import { today } from '../lib/ids';
import { MAX_REST_DAYS, streak } from '../lib/streak';

const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long' });
};

/** "🔥 12 training days · best 20" with what it takes to keep it going. */
export function StreakCard({ sessions }: { sessions: Session[] }) {
  const now = today();
  const s = useMemo(() => streak(sessions, now), [sessions, now]);
  if (!s.best) return null;

  let sub: React.ReactNode;
  if (!s.current) sub = <>Train today to start a new streak. Up to {MAX_REST_DAYS} rest days in a row keep it going.</>;
  else if (s.lastDate === now) sub = <>Trained today. You can rest up to {MAX_REST_DAYS} days and keep it.</>;
  else if (s.restDaysLeft === 0) sub = <><b>Train today</b> to keep your streak.</>;
  else sub = <>Rest day OK: <b>{s.restDaysLeft} left</b>. Train by {weekday(s.trainByDate!)} to keep it.</>;

  return (
    <div className={'card streak-card' + (s.current ? '' : ' cold')}>
      <span className="flame" aria-hidden="true">🔥</span>
      <div className="grow">
        <div className="streak-num">{s.current} <small>training day{s.current === 1 ? '' : 's'} · best {s.best}</small></div>
        <div className="streak-sub">{sub}</div>
      </div>
    </div>
  );
}

/** Compact "🔥 12" for headers; nothing when there's no live streak. */
export function StreakChip({ sessions }: { sessions: Session[] }) {
  const s = useMemo(() => streak(sessions, today()), [sessions]);
  if (!s.current) return null;
  return <span className="streak-chip" title={`${s.current}-training-day streak`}>🔥 {s.current}</span>;
}
