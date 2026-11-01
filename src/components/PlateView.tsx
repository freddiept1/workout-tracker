import type { PlateSetup, Unit } from '../db/types';
import { loadBar, plateColour } from '../lib/plates';

/** Picture of one side of the bar, plus the plate list. */
export function PlateView({ target, setup, unit }: { target: number; setup: PlateSetup; unit: Unit }) {
  const { perSide, achieved, remainder } = loadBar(target, setup);
  const max = Math.max(...setup.plates, 1);
  return (
    <div className="plate-view">
      <div className="bar-picture" aria-hidden="true">
        <span className="sleeve" />
        {perSide.map((p, i) => (
          <span
            key={i}
            className="plate"
            style={{ height: `${36 + 64 * (p / max)}%`, background: plateColour(p, unit) }}
          />
        ))}
        {setup.collar > 0 && <span className="collar" />}
      </div>
      <div className="plate-text">
        {perSide.length ? <><b>{perSide.join(' + ')}</b> {unit} each side</> : <b>Empty bar</b>}
        {remainder !== 0 && (
          <div className="hint">
            {remainder > 0 ? `Closest you can load: ${achieved} ${unit} (${remainder} ${unit} short)` : `Lighter than the bar (${setup.bar} ${unit})`}
          </div>
        )}
      </div>
    </div>
  );
}
