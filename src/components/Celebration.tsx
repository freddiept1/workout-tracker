import { useEffect, useRef } from 'react';
import type { Exercise, Unit } from '../db/types';
import { describePR, type PR } from '../lib/prs';

interface Props {
  prs: PR[] | null;
  exercises: Map<string, Exercise>;
  unit: Unit;
  onClose: () => void;
}

const COLOURS = ['#4f8a4a', '#6aae62', '#f0b429', '#edeee9', '#2e6a3c', '#d9a441'];

/** The moment after finishing a workout with PRs. */
export function Celebration({ prs, exercises, unit, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = !!prs?.length;

  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Group by exercise so a big day reads cleanly.
  const byExercise = new Map<string, PR[]>();
  for (const p of prs ?? []) byExercise.set(p.exerciseId, [...(byExercise.get(p.exerciseId) ?? []), p]);

  return (
    <dialog ref={ref} className="celebrate" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {open && (
        <>
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 36 }, (_, i) => (
              <span key={i} style={{ left: `${(i * 37) % 100}%`, background: COLOURS[i % COLOURS.length], animationDelay: `${(i % 12) * 0.08}s` }} />
            ))}
          </div>
          <div className="celebrate-body">
            <div className="trophy">🏆</div>
            <h2>{prs!.length === 1 ? 'New PR!' : `${prs!.length} new PRs!`}</h2>
            {[...byExercise].map(([exerciseId, list]) => (
              <div key={exerciseId} className="celebrate-ex">
                <div className="card-title">{exercises.get(exerciseId)?.name ?? exerciseId}</div>
                {list.map((p, i) => {
                  const d = describePR(p, unit);
                  return <div key={i} className="celebrate-pr"><span>{d.title}</span><b>{d.detail}</b></div>;
                })}
              </div>
            ))}
            <button type="button" className="full" onClick={onClose}>Nice</button>
          </div>
        </>
      )}
    </dialog>
  );
}
