import { useEffect, useRef } from 'react';
import { db } from '../db/db';
import { exportAll, importAll, setUnit } from '../db/repo';
import type { Unit } from '../db/types';
import { today } from '../lib/ids';
import { saveFile } from '../lib/saveFile';

interface Props {
  open: boolean;
  unit: Unit;
  onClose: () => void;
  onImported: () => void;
}

export function SettingsDialog({ open, unit, onClose, onImported }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const d = dialog.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function exportData() {
    await saveFile(`workout-backup-${today()}.json`, JSON.stringify(await exportAll(db), null, 2));
  }

  async function importData(file: File | undefined) {
    if (!file) return;
    if (!confirm(`Replace everything in this tracker with the backup "${file.name}"?`)) return;
    try {
      const { sessions } = await importAll(db, await file.text());
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
          <label>Backup</label>
          <div className="row">
            <button type="button" className="ghost grow" onClick={exportData}>Export</button>
            <button type="button" className="ghost grow" onClick={() => fileInput.current?.click()}>Import</button>
          </div>
          <p className="hint">Your data lives only on this device. Export now and then to keep a copy.</p>
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
