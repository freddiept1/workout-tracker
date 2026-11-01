import type { ReactNode } from 'react';
import type { Exercise } from '../db/types';
import { CATEGORIES, type Filters, type Row } from '../lib/exerciseList';
import { EQUIPMENT, MUSCLES, equipmentLabel, splitMuscles, muscleLabel } from '../lib/muscles';
import { MODES, modeOf } from '../lib/tracking';

/** Search box, category chips and (optionally) muscle and equipment pickers. */
export function ExerciseFilters(props: { value: Filters; onChange: (f: Filters) => void; detailed?: boolean; placeholder?: string }) {
  const f = props.value;
  return (
    <div className="filters">
      <input
        type="search" placeholder={props.placeholder ?? 'Search exercises'} autoCapitalize="words" value={f.query ?? ''}
        onChange={(e) => props.onChange({ ...f, query: e.target.value })}
      />
      <div className="chips scroll-x">
        <button type="button" className={'chip-btn' + (!f.category ? ' on' : '')} onClick={() => props.onChange({ ...f, category: null })}>All</button>
        {CATEGORIES.map((c) => (
          <button type="button" key={c.id} className={'chip-btn' + (f.category === c.id ? ' on' : '')} onClick={() => props.onChange({ ...f, category: f.category === c.id ? null : c.id })}>
            {c.label}
          </button>
        ))}
      </div>
      {props.detailed && (
        <div className="row">
          <select className="grow" aria-label="Muscle" value={f.muscle ?? ''} onChange={(e) => props.onChange({ ...f, muscle: e.target.value || null })}>
            <option value="">Any muscle</option>
            {Object.entries(MUSCLES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
          <select className="grow" aria-label="Equipment" value={f.equipment ?? ''} onChange={(e) => props.onChange({ ...f, equipment: e.target.value || null })}>
            <option value="">Any equipment</option>
            {Object.entries(EQUIPMENT).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

/** "Strength · Barbell · Quads, Glutes" */
export function exerciseSummary(e: Exercise): string {
  const parts = [
    modeOf(e) !== 'strength' ? MODES[modeOf(e)].label : null,
    e.equipment && e.equipment !== 'none' && !(e.equipment === 'bodyweight' && modeOf(e) === 'reps') ? equipmentLabel(e.equipment) : null,
    splitMuscles(e.muscles).primary.map((m) => muscleLabel(m.muscle)).join(', ')
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Exercises as tappable rows, variations indented under their lift. */
export function ExerciseRows(props: { rows: Row[]; onTap: (e: Exercise) => void; detail?: boolean; right?: (e: Exercise) => ReactNode }) {
  return (
    <ul className="pick-list">
      {props.rows.map(({ exercise: e, depth }) => (
        <li key={e.id} className={depth ? 'variation' : ''} style={{ paddingLeft: depth ? 14 + (depth - 1) * 12 : 0 }}>
          <button type="button" onClick={() => props.onTap(e)}>
            <span className="pick-name">
              <span>{depth ? '↳ ' : ''}{e.name}</span>
              {props.detail
                ? <span className="pick-sub">{exerciseSummary(e)}</span>
                : modeOf(e) !== 'strength' && <span className="tag">{MODES[modeOf(e)].label}</span>}
            </span>
            {props.right?.(e)}
          </button>
        </li>
      ))}
    </ul>
  );
}
