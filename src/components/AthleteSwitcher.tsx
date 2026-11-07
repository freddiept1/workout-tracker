import { useState } from 'react';
import { ME } from '../db/types';
import { useAthlete, useClientList } from '../hooks';
import { Sheet } from './Sheet';

/** Top-bar "Me ▾" button for coaches: shows History, Progress, Plan and Log for a client instead. */
export function AthleteSwitcher({ onSwitch }: { onSwitch: (id: string, name: string | null) => void }) {
  const clients = useClientList();
  const athlete = useAthlete();
  const [open, setOpen] = useState(false);
  if (!clients.length && athlete.id === ME) return null;

  const pick = (id: string, name: string | null) => {
    setOpen(false);
    onSwitch(id, name);
  };

  return (
    <>
      <button type="button" className={'athlete-btn' + (athlete.id !== ME ? ' client' : '')} onClick={() => setOpen(true)} aria-label="Whose training">
        <span>{athlete.id === ME ? 'Me' : athlete.name?.split(' ')[0]}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <Sheet open={open} title="Whose training?" onClose={() => setOpen(false)}>
        <ul className="pick-list athlete-list">
          <li><button type="button" className={athlete.id === ME ? 'on' : ''} onClick={() => pick(ME, null)}>Me</button></li>
          {clients.map((c) => (
            <li key={c.id}><button type="button" className={athlete.id === c.id ? 'on' : ''} onClick={() => pick(c.id, c.name)}>{c.name}</button></li>
          ))}
        </ul>
        <p className="hint">History, Progress, Plan and Log show the person you pick. Workouts you log go into their account.</p>
      </Sheet>
    </>
  );
}
