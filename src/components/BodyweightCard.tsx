import { useState } from 'react';
import { db } from '../db/db';
import { useMyCoach } from '../hooks';
import { saveBodyweight } from '../db/repo';
import type { Metric, Settings } from '../db/types';
import { shortDate } from '../lib/dates';
import { weighIns, weighInDue } from '../lib/body';
import { today } from '../lib/ids';
import { formatWeight, parseNumber, toKg } from '../lib/units';

/** "Weigh in today / this week": one number, then the card goes away until the next one is due. */
export function BodyweightCard({ metrics, settings }: { metrics: Metric[]; settings: Settings }) {
  const coach = useMyCoach();
  const reminder = coach?.bodyweightReminder ?? settings.bodyweightReminder; // a coach sets it for their clients
  const date = today();
  const entries = weighIns(metrics);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  if (!weighInDue(reminder, entries, date)) return null;

  const unit = settings.unit;
  const last = entries[entries.length - 1];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = parseNumber(text);
    if (!n) return setError('Type your bodyweight first.');
    try {
      await saveBodyweight(db, date, toKg(n, unit));
      setText('');
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="card bw-card" onSubmit={save}>
      <div className="grow">
        <div className="card-title">Weigh in {reminder === 'daily' ? 'today' : 'this week'}</div>
        <div className="card-sub">
          {last ? `Last: ${formatWeight(last.kg, unit)} ${unit} on ${shortDate(last.date)}` : 'First thing in the morning is most consistent.'}
        </div>
        {error && <div className="card-sub error">{error}</div>}
      </div>
      <input
        aria-label={`Bodyweight (${unit})`} inputMode="decimal" placeholder={unit} value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit">Save</button>
    </form>
  );
}
