import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Sheet } from '../components/Sheet';
import { db } from '../db/db';
import { deleteProgram, listPrograms, restartProgram, setProgramStatus, skipProgramSlot, type ProgramInput } from '../db/repo';
import type { Program, Unit } from '../db/types';
import { useExerciseMap, useSessions } from '../hooks';
import { shortDate } from '../lib/dates';
import { EXAMPLE_PROGRAMS } from '../lib/examplePrograms';
import { today } from '../lib/ids';
import { findPlateaus } from '../lib/plateau';
import { isDeloadWeek, nextSlot, progressOf, slots, type Slot } from '../lib/programs';
import { formatWeight, fromKg, round } from '../lib/units';
import { ProgramEditor } from './plan/ProgramEditor';
import { TemplatesView } from './TemplatesView';

interface Props {
  unit: Unit;
  onStart: (program: Program, slot: Slot) => void;
}

/** Programs (multi-week plans), plateau warnings, and single-day templates. */
export function PlanView({ unit, onStart }: Props) {
  const [panel, setPanel] = useState<'programs' | 'templates'>('programs');
  return (
    <>
      <div className="segmented panel-tabs">
        <button type="button" className={panel === 'programs' ? 'on' : ''} onClick={() => setPanel('programs')}>Programs</button>
        <button type="button" className={panel === 'templates' ? 'on' : ''} onClick={() => setPanel('templates')}>Templates</button>
      </div>
      {panel === 'programs' ? <Programs unit={unit} onStart={onStart} /> : <TemplatesView />}
    </>
  );
}

function Programs({ unit, onStart }: Props) {
  const programs = useLiveQuery(() => listPrograms(db), []);
  const sessions = useSessions();
  const exercises = useExerciseMap();
  const [editing, setEditing] = useState<(ProgramInput & { id?: string }) | null | 'new'>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [examples, setExamples] = useState(false);
  const plateaus = useMemo(() => (sessions ? findPlateaus(sessions, exercises, today()) : []), [sessions, exercises]);
  if (!programs) return null;

  const active = programs.filter((p) => p.status === 'active');
  const finished = programs.filter((p) => p.status !== 'active');
  const shown = detail ? programs.find((p) => p.id === detail) ?? null : null;

  return (
    <>
      {active.map((p) => <ProgramCard key={p.id} program={p} onOpen={() => setDetail(p.id)} onStart={onStart} />)}
      {!active.length && <p className="empty">No program running. Build your own, or start from an example.</p>}
      <div className="row button-row">
        <button type="button" className="grow" onClick={() => setEditing('new')}>+ New program</button>
        <button type="button" className="ghost grow" onClick={() => setExamples(true)}>Examples</button>
      </div>

      {plateaus.length > 0 && (
        <div className="card plateau-card">
          <h2>⚠️ Stalled lifts</h2>
          {plateaus.map((pl) => (
            <details key={pl.exerciseId} className="plateau">
              <summary>
                <b>{exercises.get(pl.exerciseId)?.name}</b>: no e1RM gain for {pl.weeks} weeks
                <span className="muted"> (best e1RM {round(fromKg(pl.bestKg, unit), 1)} {unit}, {shortDate(pl.bestDate)})</span>
              </summary>
              <ul>{pl.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </details>
          ))}
          <p className="hint">A lift is flagged when its best estimated 1RM was 3+ weeks ago and you've trained it at least 3 times since.</p>
        </div>
      )}

      {finished.length > 0 && (
        <>
          <h2>Finished and archived</h2>
          {finished.map((p) => (
            <button type="button" key={p.id} className="card list-card" onClick={() => setDetail(p.id)}>
              <span className="card-title">{p.name}</span>
              <span className="card-sub">{p.status === 'completed' ? '✓ Completed' : 'Archived'} · {p.weeks} weeks</span>
            </button>
          ))}
        </>
      )}

      <ProgramDetail
        program={shown} unit={unit} exerciseName={(id) => exercises.get(id)?.name ?? id}
        onClose={() => setDetail(null)} onStart={onStart}
        onEdit={(p) => { setDetail(null); setEditing({ ...p }); }}
      />
      <ProgramEditor open={editing !== null} initial={editing === 'new' ? null : editing} unit={unit} onClose={() => setEditing(null)} />
      <Sheet open={examples} title="Example programs" onClose={() => setExamples(false)}>
        <p className="hint">Start from one of these and make it yours. You can change anything before saving.</p>
        {EXAMPLE_PROGRAMS.map((ex) => {
          const p = ex.make();
          return (
            <button type="button" key={ex.key} className="card list-card" onClick={() => { setExamples(false); setEditing(p); }}>
              <span className="card-title">{p.name}</span>
              <span className="card-sub">{ex.description}</span>
            </button>
          );
        })}
      </Sheet>
    </>
  );
}

function ProgramCard({ program, onOpen, onStart }: { program: Program; onOpen: () => void; onStart: Props['onStart'] }) {
  const next = nextSlot(program);
  const { done, total, pct } = progressOf(program);
  return (
    <div className="card program-card">
      <button type="button" className="program-open" onClick={onOpen}>
        <span className="card-title">{program.name}</span>
        <span className="card-sub">
          {next ? <>Next: Week {next.week}{isDeloadWeek(program, next.week) ? ' (deload)' : ''} · {program.days[next.day]?.name}</> : 'All done'} · {done}/{total} workouts
        </span>
        <span className="progress-bar"><span style={{ width: `${pct}%` }} /></span>
      </button>
      {next && <button type="button" className="full" onClick={() => onStart(program, next)}>Start {program.days[next.day]?.name}</button>}
    </div>
  );
}

function ProgramDetail({ program, unit, exerciseName, onClose, onStart, onEdit }: {
  program: Program | null;
  unit: Unit;
  exerciseName: (id: string) => string;
  onClose: () => void;
  onStart: Props['onStart'];
  onEdit: (p: Program) => void;
}) {
  const p = program;
  const next = p ? nextSlot(p) : null;
  return (
    <Sheet open={!!p} title={p?.name ?? ''} onClose={onClose}>
      {p && (
        <div className="stack">
          <table className="program-grid">
            <thead><tr><th />{p.days.map((d) => <th key={d.id}>{d.name}</th>)}</tr></thead>
            <tbody>
              {Array.from({ length: p.weeks }, (_, w) => (
                <tr key={w}>
                  <th>W{w + 1}{isDeloadWeek(p, w + 1) ? <span className="deload-tag">deload</span> : ''}</th>
                  {p.days.map((d, di) => {
                    const slot = slots(p).find((s) => s.week === w + 1 && s.day === di)!;
                    const log = p.log[slot.key];
                    const isNext = next?.key === slot.key;
                    return (
                      <td key={d.id} className={log ? (log.skipped ? 'skipped' : 'done') : isNext ? 'next' : ''}>
                        {log ? (log.skipped ? '–' : '✓') : isNext ? '●' : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {next && (
            <div className="card">
              <div className="card-title">Next: Week {next.week} · {p.days[next.day].name}</div>
              <ul className="plan-preview">
                {p.days[next.day].exercises.map((e) => <li key={e.id}>{exerciseName(e.exerciseId)} <span className="muted">{e.sets} × {e.reps}{e.notes ? ` · ${e.notes}` : ''}</span></li>)}
              </ul>
              <div className="row">
                <button type="button" className="grow" onClick={() => { onClose(); onStart(p, next); }}>Start</button>
                <button type="button" className="ghost grow" onClick={() => confirm('Skip this workout? The program moves on to the next one.') && skipProgramSlot(db, p.id, next.key, today())}>Skip</button>
              </div>
            </div>
          )}

          {Object.keys(p.maxes).length > 0 && (
            <p className="hint">1RMs entered: {Object.entries(p.maxes).map(([id, kg]) => `${exerciseName(id)} ${formatWeight(kg, unit)} ${unit}`).join(', ')}.</p>
          )}

          <div className="row wrap">
            <button type="button" className="ghost grow" onClick={() => onEdit(p)}>Edit</button>
            <button type="button" className="ghost grow" onClick={() => confirm('Start this program again from week 1? Past workouts stay in History.') && restartProgram(db, p.id)}>Restart</button>
            {p.status === 'active'
              ? <button type="button" className="ghost grow" onClick={() => { setProgramStatus(db, p.id, 'archived'); onClose(); }}>Archive</button>
              : <button type="button" className="ghost grow" onClick={() => setProgramStatus(db, p.id, 'active')}>Make active</button>}
          </div>
          <button type="button" className="danger full" onClick={() => { if (confirm(`Delete “${p.name}”? Its workouts stay in History.`)) { deleteProgram(db, p.id); onClose(); } }}>Delete program</button>
        </div>
      )}
    </Sheet>
  );
}
