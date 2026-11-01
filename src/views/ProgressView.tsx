import { useState } from 'react';
import type { Settings } from '../db/types';
import { useExerciseMap, usePRs, useSessions } from '../hooks';
import { LiftPanel } from './progress/LiftPanel';
import { TotalPanel } from './progress/TotalPanel';
import { WeekPanel } from './progress/WeekPanel';

type Panel = 'lift' | 'week' | 'total';

export function ProgressView({ settings }: { settings: Settings }) {
  const sessions = useSessions();
  const exercises = useExerciseMap();
  const prs = usePRs(sessions, exercises);
  const [panel, setPanel] = useState<Panel>('lift');
  if (!sessions) return null;

  return (
    <>
      <div className="segmented panel-tabs">
        {([['lift', 'Lifts'], ['week', 'Week'], ['total', 'Total']] as const).map(([id, label]) => (
          <button type="button" key={id} className={panel === id ? 'on' : ''} onClick={() => setPanel(id)}>{label}</button>
        ))}
      </div>
      {panel === 'lift' && <LiftPanel sessions={sessions} exercises={exercises} prs={prs} unit={settings.unit} />}
      {panel === 'week' && <WeekPanel sessions={sessions} exercises={exercises} prs={prs} unit={settings.unit} />}
      {panel === 'total' && <TotalPanel sessions={sessions} exercises={exercises} settings={settings} />}
    </>
  );
}
