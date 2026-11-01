import { useEffect, useState } from 'react';
import { Sheet } from '../../components/Sheet';

const PRESETS = ['3-1-X-0', '3-0-X-0', '2-2-X-0', '3-2-X-0', '4-0-X-0', '5-0-X-0', '2-0-2-0', 'X-3-X-0'];

interface Props {
  open: boolean;
  exerciseName: string;
  value: string;
  defaultTempo: string;
  onSave: (tempo: string, makeDefault: boolean) => void;
  onClose: () => void;
}

/** Tempo for every set of an exercise in this workout, optionally saved as the exercise's default. */
export function TempoSheet({ open, exerciseName, value, defaultTempo, onSave, onClose }: Props) {
  const [tempo, setTempo] = useState(value);
  const [makeDefault, setMakeDefault] = useState(false);

  useEffect(() => {
    if (open) { setTempo(value); setMakeDefault(false); }
  }, [open, value]);

  const done = (t: string) => { onSave(t.trim().toUpperCase().replace(/x/g, 'X'), makeDefault); onClose(); };

  return (
    <Sheet open={open} title={`Tempo · ${exerciseName}`} onClose={onClose}>
      <input
        aria-label="Tempo" placeholder="e.g. 3-1-X-0" value={tempo} autoCapitalize="characters"
        onChange={(e) => setTempo(e.target.value.replace(/[^0-9xX-]/g, ''))}
      />
      <div className="chips">
        {PRESETS.map((p) => (
          <button type="button" key={p} className={'chip-btn' + (tempo === p ? ' on' : '')} onClick={() => setTempo(p)}>{p}</button>
        ))}
      </div>
      <p className="hint">
        Seconds for: lowering – pause at the bottom – lifting – pause at the top. X = as fast as possible.
        3-1-X-0 means 3 s down, 1 s pause, drive up.
      </p>
      <label className="toggle">
        <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
        Use this tempo every time for {exerciseName}{defaultTempo ? ` (now ${defaultTempo})` : ''}
      </label>
      <div className="row">
        <button type="button" className="grow" onClick={() => done(tempo)}>Set tempo</button>
        {value && <button type="button" className="ghost grow" onClick={() => done('')}>No tempo</button>}
      </div>
    </Sheet>
  );
}
