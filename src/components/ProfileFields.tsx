import { db } from '../db/db';
import { updateSettings } from '../db/repo';
import type { Settings } from '../db/types';
import { formatWeight, parseNumber, toKg } from '../lib/units';

/** Sex and bodyweight, used for DOTS/Wilks and strength relative to bodyweight. */
export function ProfileFields({ settings }: { settings: Settings }) {
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
    </div>
  );
}
