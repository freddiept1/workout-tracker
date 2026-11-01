import { PlateView } from '../../components/PlateView';
import { Sheet } from '../../components/Sheet';
import type { DraftSet, PlateSetup, SetType, TrackingMode, Unit } from '../../db/types';
import { EFFORT_VALUES, MODES, RPE_VALUES, SET_TYPE_LABEL } from '../../lib/tracking';
import { parseNumber } from '../../lib/units';

const SET_TYPES: SetType[] = ['warmup', 'working', 'top', 'backoff', 'amrap', 'drop', 'failure'];

/** Quick picker for RPE (lifting) or effort % (athletic work): one tap sets it and closes. */
export function RatingSheet(props: {
  open: boolean;
  mode: TrackingMode;
  value: number | null;
  onPick: (v: number | null) => void;
  onClose: () => void;
}) {
  const effort = MODES[props.mode].rating === 'effort';
  const values = effort ? EFFORT_VALUES : RPE_VALUES;
  return (
    <Sheet open={props.open} title={effort ? 'Effort' : 'RPE'} onClose={props.onClose}>
      <div className="rating-grid">
        {values.map((v) => (
          <button
            type="button" key={v} className={'rating-btn' + (props.value === v ? ' on' : '')}
            onClick={() => { props.onPick(v); props.onClose(); }}
          >{v}{effort ? '%' : ''}</button>
        ))}
      </div>
      <p className="hint">
        {effort ? '% of your maximum effort.' : '10 = nothing left, 9 = one more rep, 8 = two more, and so on.'}
      </p>
      {props.value !== null && (
        <button type="button" className="ghost full" onClick={() => { props.onPick(null); props.onClose(); }}>Clear</button>
      )}
    </Sheet>
  );
}

/** Everything else about a set: type, side, tempo, notes, plates, delete. */
export function SetSheet(props: {
  open: boolean;
  set: DraftSet | null;
  mode: TrackingMode;
  unilateral: boolean;
  unit: Unit;
  plates: PlateSetup;
  onChange: (patch: Partial<DraftSet>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const s = props.set;
  const weight = s ? parseNumber(s.weight) : null;
  return (
    <Sheet open={props.open && !!s} title="Set" onClose={props.onClose}>
      {s && (
        <div className="stack">
          <div>
            <label>Set type</label>
            <div className="chips">
              {SET_TYPES.map((t) => (
                <button type="button" key={t} className={'chip-btn' + (s.type === t ? ' on' : '')} onClick={() => props.onChange({ type: t })}>
                  {SET_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            {s.type === 'warmup' && <p className="hint">Warm-ups don't count towards PRs or volume.</p>}
          </div>
          {props.unilateral && (
            <div>
              <label>Side</label>
              <div className="segmented">
                {(['L', 'R'] as const).map((side) => (
                  <button type="button" key={side} className={s.side === side ? 'on' : ''} onClick={() => props.onChange({ side: s.side === side ? null : side })}>
                    {side === 'L' ? 'Left' : 'Right'}
                  </button>
                ))}
              </div>
            </div>
          )}
          {MODES[props.mode].rating === 'rpe' && (
            <div>
              <label htmlFor="setTempo">Tempo</label>
              <input id="setTempo" placeholder="e.g. 3-1-X-0" value={s.tempo} onChange={(e) => props.onChange({ tempo: e.target.value })} />
            </div>
          )}
          <div>
            <label htmlFor="setNotes">Notes</label>
            <input id="setNotes" placeholder="e.g. belt, felt fast" value={s.notes} onChange={(e) => props.onChange({ notes: e.target.value })} />
          </div>
          {props.mode === 'strength' && weight !== null && weight > 0 && (
            <div>
              <label>Plates</label>
              <PlateView target={weight} setup={props.plates} unit={props.unit} />
            </div>
          )}
          <button type="button" className="danger full" onClick={() => { props.onDelete(); props.onClose(); }}>Delete set</button>
        </div>
      )}
    </Sheet>
  );
}
