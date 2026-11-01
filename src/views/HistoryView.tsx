import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { deleteSession, saveTemplate } from '../db/repo';
import type { Session, Unit } from '../db/types';
import { StreakChip } from '../components/StreakCard';
import { useExerciseMap, usePRs, useSessions, useTemplates } from '../hooks';
import { longDate } from '../lib/dates';
import { commonTempo } from '../lib/draft';
import { describePR } from '../lib/prs';
import { isLiftSet, tonnageOf } from '../lib/strength';
import { formatSet, isDrill, modeOf, setBadge } from '../lib/tracking';
import { fromKg } from '../lib/units';

export function HistoryView({ unit, onRepeat }: { unit: Unit; onRepeat: (s: Session) => void }) {
  const sessions = useSessions();
  const templates = useTemplates();
  const programs = useLiveQuery(() => db.programs.toArray(), []);
  const exercises = useExerciseMap();
  const prs = usePRs(sessions, exercises);
  if (!sessions) return null;

  async function saveAsTemplate(s: Session) {
    const name = prompt('Name for the new template:', longDate(s.date));
    if (!name?.trim()) return;
    await saveTemplate(db, { name, exerciseIds: [...new Set(s.exercises.map((e) => e.exerciseId))] });
    alert(`Saved “${name.trim()}”. Find it in Plan → Templates.`);
  }

  if (!sessions.length) {
    return <p className="empty">No workouts yet.<br />Log one from the Log tab.</p>;
  }

  return (
    <>
      <h2 className="history-head">{sessions.length} workout{sessions.length === 1 ? '' : 's'}<StreakChip sessions={sessions} /></h2>
      {sessions.map((s) => {
        const template = templates?.find((t) => t.id === s.templateId);
        const program = s.programDayId ? programs?.find((p) => p.id === s.programDayId!.split(':')[0]) : undefined;
        // Warm-up drills are shown as one line and left out of the exercise/set counts.
        const drills = s.exercises.filter((ex) => isDrill(exercises.get(ex.exerciseId)));
        const training = s.exercises.filter((ex) => !isDrill(exercises.get(ex.exerciseId)));
        const setCount = training.reduce((n, ex) => n + ex.sets.length, 0);
        const sessionPRs = prs.get(s.id) ?? [];
        const prSets = new Set(sessionPRs.map((p) => p.setId));
        const tonnage = s.exercises.reduce(
          (n, ex) => n + ex.sets.filter((x) => isLiftSet(x, exercises.get(ex.exerciseId))).reduce((m, x) => m + tonnageOf(x), 0), 0
        );
        return (
          <details className="card" key={s.id}>
            <summary>
              <span>
                <span className="card-title">{longDate(s.date)}</span>
                {sessionPRs.length > 0 && <span className="pr-badge">🏆 {sessionPRs.length}</span>}
                <br />
                <span className="card-sub">
                  {program ? `📋 ${program.name} ${s.programDayId!.split(':')[1]?.replace(/w(\d+)d(\d+)/, 'W$1 D$2')} · ` : ''}
                  {template ? template.name + ' · ' : ''}
                  {drills.length > 0 && 'Warm-up ✓ · '}
                  {training.length} exercise{training.length === 1 ? '' : 's'} · {setCount} sets
                  {tonnage > 0 && ` · ${Math.round(fromKg(tonnage, unit)).toLocaleString()} ${unit}`}
                </span>
              </span>
              <svg className="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </summary>
            <div className="workout-detail">
              {drills.length > 0 && (
                <p className="warmup-summary">
                  <b>✓ Warm-up</b> · {drills.map((ex) => exercises.get(ex.exerciseId)?.name ?? ex.exerciseId).join(', ')}
                </p>
              )}
              {training.map((ex) => {
                const exercise = exercises.get(ex.exerciseId);
                const tempo = commonTempo(ex.sets);
                const exPRs = sessionPRs.filter((p) => p.exerciseId === ex.exerciseId);
                return (
                  <div key={ex.id}>
                    <div className="card-title">
                      {exercise?.name ?? ex.exerciseId}
                      {tempo && <span className="tempo-note"> · tempo {tempo}</span>}
                    </div>
                    {ex.notes && <p className="exercise-note">{ex.notes}</p>}
                    <div className="set-chips">
                      {ex.sets.map((set, i) => (
                        <span className={'chip' + (set.type === 'warmup' ? ' warm' : '') + (prSets.has(set.id) ? ' pr' : '')} key={set.id} title={set.notes}>
                          {prSets.has(set.id) && '🏆 '}
                          {set.type !== 'working' && <b className="chip-type">{setBadge(ex.sets, i)}</b>}
                          {formatSet(set, modeOf(exercise), unit)}
                        </span>
                      ))}
                    </div>
                    {exPRs.length > 0 && (
                      <ul className="pr-list compact">
                        {exPRs.map((p, i) => {
                          const d = describePR(p, unit);
                          return <li key={i}>{d.title}: <b>{d.detail}</b></li>;
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
              {s.notes && <p className="muted">{s.notes}</p>}
              <div className="row wrap history-actions">
                <button type="button" className="small" onClick={() => onRepeat(s)}>Repeat</button>
                <button type="button" className="ghost small" onClick={() => saveAsTemplate(s)}>Save as template</button>
                <button
                  type="button" className="danger small"
                  onClick={() => confirm('Delete this workout? This cannot be undone.') && deleteSession(db, s.id)}
                >Delete</button>
              </div>
            </div>
          </details>
        );
      })}
    </>
  );
}
