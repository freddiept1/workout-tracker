import { db } from '../db/db';
import { updateSettings } from '../db/repo';
import type { Settings } from '../db/types';
import { shortDate } from '../lib/dates';
import { formatWeight, fromKg, parseNumber, round, toKg } from '../lib/units';

/**
 * Sex and bodyweight, used for DOTS/Wilks and strength relative to bodyweight. Once weigh-ins are
 * logged, bodyweight comes from their 7-day average instead of this box.
 */
export function ProfileFields({ settings, logged }: { settings: Settings; logged?: { kg: number; asOf: string } | null }) {
  const unit = settings.unit;
  return (
    <div className="row">
      <div className="grow">
        <label className="sub">Category</label>
        <div className="segmented">
          {(['male', 'female'] as const).map((s) => (
            <button type="button" key={s} className={settings.sex === s ? 'on' : ''} onClick={() => updateSettings(db, { sex: s })}>
              {s === 'male' ? 'Men' : 'Women'}
            </button>
          ))}
        </div>
      </div>
      {logged ? (
        <div className="bw-field">
          <label className="sub">Bodyweight</label>
          <div className="bw-logged"><b>{round(fromKg(logged.kg, unit), 1)} {unit}</b><small>7-day avg to {shortDate(logged.asOf)}</small></div>
        </div>
      ) : (
        <div className="bw-field">
          <label htmlFor="bodyweight" className="sub">Bodyweight ({unit})</label>
          <input
            id="bodyweight" inputMode="decimal" placeholder="–" key={unit + (settings.bodyweightKg ?? '')}
            defaultValue={settings.bodyweightKg ? formatWeight(settings.bodyweightKg, unit) : ''}
            onBlur={(e) => {
              const n = parseNumber(e.target.value);
              void updateSettings(db, { bodyweightKg: n ? toKg(n, unit) : null });
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Off / Daily / Weekly weigh-in reminder (the card on the Log tab). */
export function ReminderSetting({ settings }: { settings: Settings }) {
  return (
    <div className="segmented">
      {([['off', 'Off'], ['daily', 'Daily'], ['weekly', 'Weekly']] as const).map(([v, label]) => (
        <button type="button" key={v} className={settings.bodyweightReminder === v ? 'on' : ''} onClick={() => updateSettings(db, { bodyweightReminder: v })}>
          {label}
        </button>
      ))}
    </div>
  );
}
