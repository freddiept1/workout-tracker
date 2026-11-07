import { useEffect, useRef, useState } from 'react';
import { ProfileFields, ReminderSetting } from '../components/ProfileFields';
import { useMetrics } from '../hooks';
import { resetPushCursor } from '../sync/engine';
import { AccountSection } from './settings/AccountSection';
import { useSyncStatus } from '../sync/controller';
import { bodyweightFor, weighIns } from '../lib/body';
import { db } from '../db/db';
import { exportAll, importAll, setUnit, updateSettings } from '../db/repo';
import type { PlateSetup, Settings } from '../db/types';
import { askNotifications, notifyState, type NotifyState } from '../lib/alerts';
import { today } from '../lib/ids';
import { ALL_PLATES } from '../lib/plates';
import { saveFile } from '../lib/saveFile';
import { parseNumber } from '../lib/units';

interface Props {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onImported: () => void;
  onInvite: (code: string) => void;
}

export function SettingsDialog({ open, settings, onClose, onImported, onInvite }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [notify, setNotify] = useState<NotifyState>(notifyState());
  const unit = settings.unit;
  const setup = settings.equipment[unit];
  const metrics = useMetrics();
  const sync = useSyncStatus();
  const body = metrics ? bodyweightFor(weighIns(metrics), settings.bodyweightKg) : null;

  useEffect(() => {
    const d = dialog.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const saveSetup = (patch: Partial<PlateSetup>) =>
    updateSettings(db, { equipment: { ...settings.equipment, [unit]: { ...setup, ...patch } } });

  function togglePlate(p: number) {
    const plates = setup.plates.includes(p) ? setup.plates.filter((x) => x !== p) : [...setup.plates, p].sort((a, b) => b - a);
    void saveSetup({ plates });
  }

  async function exportData() {
    await saveFile(`workout-backup-${today()}.json`, JSON.stringify(await exportAll(db), null, 2));
  }

  async function importData(file: File | undefined) {
    if (!file) return;
    if (!confirm(`Replace everything in this tracker with the backup "${file.name}"?`)) return;
    try {
      const { sessions } = await importAll(db, await file.text());
      await resetPushCursor(db); // signed in: send everything up again (the cloud keeps whichever copy is newer)
      alert(`Backup restored: ${sessions} workouts.`);
      onImported();
    } catch (err) {
      alert('Could not import that file: ' + (err as Error).message);
    }
  }

  return (
    <dialog ref={dialog} onClose={onClose}>
      <form method="dialog" className="stack">
        <h2>Settings</h2>
        <AccountSection onInvite={onInvite} />
        <div>
          <label>Theme</label>
          <div className="segmented">
            {([['dark', 'Dark'], ['light', 'Light'], ['system', 'Match phone']] as const).map(([t, label]) => (
              <button type="button" key={t} className={settings.theme === t ? 'on' : ''} onClick={() => updateSettings(db, { theme: t })}>{label}</button>
            ))}
          </div>
        </div>

        <div>
          <label>Weight unit</label>
          <div className="segmented">
            {(['kg', 'lb'] as const).map((u) => (
              <button type="button" key={u} className={u === unit ? 'on' : ''} onClick={() => setUnit(db, u)}>{u}</button>
            ))}
          </div>
          <p className="hint">Weights are converted, so you can switch any time.</p>
        </div>

        <div>
          <label>Lifter profile</label>
          <ProfileFields settings={settings} logged={body?.logged ? { kg: body.kg, asOf: body.asOf! } : null} />
          <p className="hint">
            Used for DOTS, Wilks and strength relative to bodyweight on the Progress tab.
            {body?.logged ? ' Bodyweight comes from your weigh-ins (Progress → Body).' : ' Once you log weigh-ins, their 7-day average is used instead.'}
          </p>
        </div>

        <div>
          <label>Weigh-in reminder</label>
          <ReminderSetting settings={settings} />
          <p className="hint">Shows a quick bodyweight card on the Log tab when a weigh-in is due.</p>
        </div>

        <div>
          <label>Rest timer</label>
          <label className="toggle">
            <input type="checkbox" checked={settings.restSound} onChange={(e) => updateSettings(db, { restSound: e.target.checked })} />
            Beep when rest is over
          </label>
          {notify === 'default' && (
            <button type="button" className="ghost full" onClick={async () => setNotify(await askNotifications())}>Allow notifications</button>
          )}
          <p className="hint">
            {notify === 'granted'
              ? 'Notifications are on. iPhone only shows them while the app is still running in the background, not when the phone is locked.'
              : notify === 'denied'
                ? 'Notifications are blocked. You can allow them in your phone’s Settings.'
                : notify === 'unsupported'
                  ? 'Notifications need the app installed to your Home Screen.'
                  : 'Get a notification when rest ends while you’re in another app.'}
          </p>
        </div>

        <div>
          <label>Bar and plates ({unit})</label>
          <div className="row">
            <div className="grow">
              <label htmlFor="barWeight" className="sub">Bar</label>
              <input
                id="barWeight" inputMode="decimal" defaultValue={setup.bar} key={unit + 'bar'}
                onBlur={(e) => { const n = parseNumber(e.target.value); if (n !== null) void saveSetup({ bar: n }); }}
              />
            </div>
            <div className="grow">
              <label htmlFor="collarWeight" className="sub">Collar (each)</label>
              <input
                id="collarWeight" inputMode="decimal" defaultValue={setup.collar} key={unit + 'collar'}
                onBlur={(e) => { const n = parseNumber(e.target.value); if (n !== null) void saveSetup({ collar: n }); }}
              />
            </div>
          </div>
          <div className="chips">
            {ALL_PLATES[unit].map((p) => (
              <button type="button" key={p} className={'chip-btn' + (setup.plates.includes(p) ? ' on' : '')} onClick={() => togglePlate(p)}>{p}</button>
            ))}
          </div>
          <p className="hint">Tap the plates your gym has. Used by the plate calculator and warm-up sets.</p>
        </div>

        <div>
          <label>Backup</label>
          <div className="row">
            <button type="button" className="ghost grow" onClick={exportData}>Export</button>
            <button type="button" className="ghost grow" onClick={() => fileInput.current?.click()}>Import</button>
          </div>
          <p className="hint">
            {sync.user ? 'Your data is on this device and synced to your account. A backup file is still a good extra copy.' : 'Your data lives only on this device. Export now and then to keep a copy.'}
          </p>
          <input
            ref={fileInput} type="file" accept="application/json,.json" hidden
            onChange={(e) => { importData(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>
        <button className="full">Done</button>
      </form>
    </dialog>
  );
}
