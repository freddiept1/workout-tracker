import { useState } from 'react';
import { db } from '../db/db';
import { saveCheckin, skipCheckin } from '../db/repo';
import type { Checkin, Metric } from '../db/types';
import { CHECKIN_FIELDS, isComplete, readiness } from '../lib/body';
import { today } from '../lib/ids';

/**
 * Today's 5-second check-in: sleep, energy, soreness, stress, each 1–5. Every tap saves.
 * Once all four are answered it shrinks to a summary line (tap to change).
 */
export function CheckinCard({ metrics, skippedOn }: { metrics: Metric[]; skippedOn: string | null | undefined }) {
  const date = today();
  const current = metrics.find((m) => m.kind === 'checkin' && m.date === date)?.checkin ?? null;
  const [editing, setEditing] = useState(false);

  if (skippedOn === date && !current) return null;

  if (isComplete(current) && !editing) {
    const c = current!;
    return (
      <button type="button" className="card checkin-done" onClick={() => setEditing(true)}>
        <span className="checkin-score">{readiness(c)?.toFixed(1)}</span>
        <span className="grow">
          <span className="card-title">Check-in done</span>
          <span className="card-sub">{CHECKIN_FIELDS.map((f) => `${f.label} ${c[f.key]}`).join(' · ')}</span>
        </span>
        <span className="card-sub">Edit</span>
      </button>
    );
  }

  const answer = (key: keyof Checkin, value: number) => {
    void saveCheckin(db, date, { [key]: value });
  };

  return (
    <div className="card checkin-card">
      <div className="checkin-head">
        <h3>Today’s check-in</h3>
        {editing ? (
          <button type="button" className="link" onClick={() => setEditing(false)}>Done</button>
        ) : (
          <button type="button" className="link" onClick={() => void skipCheckin(db, date)}>Skip today</button>
        )}
      </div>
      {CHECKIN_FIELDS.map((f) => (
        <div className="checkin-row" key={f.key}>
          <div className="checkin-label">
            <b>{f.label}</b>
            <small>1 {f.low} · 5 {f.high}</small>
          </div>
          <div className="checkin-scale" role="radiogroup" aria-label={f.label}>
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                type="button" key={v} role="radio" aria-checked={current?.[f.key] === v}
                className={current?.[f.key] === v ? 'on' : ''} onClick={() => answer(f.key, v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
