import { PlateView } from '../../components/PlateView';
import { Sheet } from '../../components/Sheet';
import type { DraftExercise, Exercise, PlateSetup, Unit } from '../../db/types';
import { restFor, modeOf } from '../../lib/tracking';
import { parseNumber } from '../../lib/units';
import { warmupSets, type WarmupStep } from '../../lib/warmup';

export const formatRest = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

interface Props {
  open: boolean;
  entry: DraftExercise | null;
  exercise: Exercise | undefined;
  index: number;
  count: number;
  unit: Unit;
  plates: PlateSetup;
  onRest: (sec: number) => void;
  onNotes: (notes: string) => void;
  onWarmups: (steps: WarmupStep[]) => void;
  onSwap: () => void;
  onLinkNext: () => void;
  onUnlink: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function ExerciseMenu(p: Props) {
  const entry = p.entry;
  const strength = modeOf(p.exercise) === 'strength';
  const rest = entry ? restFor(p.exercise, entry.restSec) : 0;
  // Warm-ups and plates work from the heaviest working weight typed so far.
  const workingWeights = entry
    ? entry.sets.filter((s) => s.type !== 'warmup').map((s) => parseNumber(s.weight) ?? 0).filter((w) => w > 0)
    : [];
  const top = workingWeights.length ? Math.max(...workingWeights) : 0;
  const warmups = top ? warmupSets(top, p.plates) : [];
  const distinct = [...new Set(workingWeights)].sort((a, b) => b - a);

  return (
    <Sheet open={p.open && !!entry} title={p.exercise?.name ?? 'Exercise'} onClose={p.onClose}>
      {entry && (
        <div className="stack">
          <button type="button" className="ghost full" onClick={() => { p.onClose(); p.onSwap(); }}>Swap for a variation…</button>
          <div>
            <label>Rest after each set</label>
            <div className="stepper">
              <button type="button" className="ghost" onClick={() => p.onRest(Math.max(0, rest - 15))}>−15s</button>
              <b>{formatRest(rest)}</b>
              <button type="button" className="ghost" onClick={() => p.onRest(rest + 15)}>+15s</button>
            </div>
            <p className="hint">Remembered for {p.exercise?.name ?? 'this exercise'} next time.</p>
          </div>

          {strength && (
            <div>
              <label>Warm-up sets</label>
              {warmups.length ? (
                <>
                  <p className="hint">
                    From {top} {p.unit}: {warmups.map((w) => `${w.weight}×${w.reps}`).join(', ')}
                  </p>
                  <button type="button" className="ghost full" onClick={() => { p.onWarmups(warmups); p.onClose(); }}>
                    Add warm-up sets
                  </button>
                </>
              ) : (
                <p className="hint">Enter a working weight first.</p>
              )}
            </div>
          )}

          {strength && distinct.length > 0 && (
            <div>
              <label>Plates</label>
              {distinct.map((w) => (
                <div key={w} className="plate-row">
                  <span className="plate-total">{w} {p.unit}</span>
                  <PlateView target={w} setup={p.plates} unit={p.unit} />
                </div>
              ))}
            </div>
          )}

          <div>
            <label htmlFor="exNotes">Notes</label>
            <textarea id="exNotes" placeholder="e.g. belt on 3rd notch" value={entry.notes} onChange={(e) => p.onNotes(e.target.value)} />
          </div>

          <div className="row wrap">
            {entry.supersetGroup ? (
              <button type="button" className="ghost grow" onClick={() => { p.onUnlink(); p.onClose(); }}>Remove from superset</button>
            ) : null}
            {p.index < p.count - 1 && (
              <button type="button" className="ghost grow" onClick={() => { p.onLinkNext(); p.onClose(); }}>Superset with next</button>
            )}
          </div>
          <div className="row">
            <button type="button" className="ghost grow" disabled={p.index === 0} onClick={() => p.onMove(-1)}>Move up</button>
            <button type="button" className="ghost grow" disabled={p.index === p.count - 1} onClick={() => p.onMove(1)}>Move down</button>
          </div>
          <button type="button" className="danger full" onClick={() => { p.onRemove(); p.onClose(); }}>Remove exercise</button>
        </div>
      )}
    </Sheet>
  );
}
