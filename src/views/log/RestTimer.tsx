import { useEffect, useRef, useState } from 'react';
import type { RestTimer as Rest } from '../../db/types';
import { beep, buzz, notifyRestOver } from '../../lib/alerts';
import { formatRest } from './ExerciseMenu';

interface Props {
  rest: Rest | null;
  sound: boolean;
  nextName: string;
  onChange: (rest: Rest | null) => void;
}

/**
 * Countdown bar above the tab bar. The end time is stored in the draft, so the timer is right even
 * after the app was closed or the phone locked.
 */
export function RestTimer({ rest, sound, nextName, onChange }: Props) {
  const [now, setNow] = useState(Date.now());
  const firedFor = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const endsAt = rest?.endsAt;

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    // Hide the bar a few seconds after the rest ends.
    const hide = setTimeout(() => onChangeRef.current(null), Math.max(0, Date.parse(endsAt) - Date.now()) + 4000);
    return () => { clearInterval(id); clearTimeout(hide); };
  }, [endsAt]);

  const left = rest ? Math.ceil((Date.parse(rest.endsAt) - now) / 1000) : 0;

  useEffect(() => {
    if (!endsAt || left > 0 || firedFor.current === endsAt) return;
    firedFor.current = endsAt;
    // Only alert if it ended just now, not if the app reopens long after.
    if (Date.now() - Date.parse(endsAt) < 5000) {
      if (sound) beep();
      buzz();
      void notifyRestOver(nextName);
    }
  }, [endsAt, left, sound, nextName]);

  if (!rest) return null;
  const adjust = (sec: number) => onChange({ ...rest, endsAt: new Date(Date.parse(rest.endsAt) + sec * 1000).toISOString(), durationSec: rest.durationSec + sec });
  const done = left <= 0;
  const pct = done ? 100 : Math.min(100, 100 * (1 - left / rest.durationSec));

  return (
    <div className={'rest-timer' + (done ? ' done' : '')} role="timer" aria-live="polite">
      <div className="rest-progress" style={{ width: `${pct}%` }} />
      <div className="rest-main">
        <span className="rest-label">{done ? 'Rest over' : 'Rest'}</span>
        <span className="rest-time">{done ? (nextName ? `Next: ${nextName}` : 'Go!') : formatRest(left)}</span>
      </div>
      {!done && (
        <div className="rest-actions">
          <button type="button" className="ghost small" onClick={() => adjust(-15)}>−15</button>
          <button type="button" className="ghost small" onClick={() => adjust(15)}>+15</button>
          <button type="button" className="small" onClick={() => onChange(null)}>Skip</button>
        </div>
      )}
    </div>
  );
}
