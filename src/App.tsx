import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type ReactNode } from 'react';
import { db } from './db/db';
import { Celebration } from './components/Celebration';
import { getDraft, getSettings, listSessions, saveDraft, startup, type StartupResult } from './db/repo';
import type { Draft, Exercise, MigrationInfo } from './db/types';
import { convertDraftUnit } from './lib/draft';
import { findPRs, type PR } from './lib/prs';
import { saveFile } from './lib/saveFile';
import { ExercisesView } from './views/ExercisesView';
import { HistoryView } from './views/HistoryView';
import { LogView } from './views/LogView';
import { ProgressView } from './views/ProgressView';
import { SettingsDialog } from './views/SettingsDialog';
import { TemplatesView } from './views/TemplatesView';

type View = 'log' | 'history' | 'progress' | 'exercises' | 'templates';

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function App() {
  const [boot, setBoot] = useState<StartupResult | null>(null);
  useEffect(() => {
    startup(db, safeLocalStorage()).then(setBoot);
    // Ask the browser not to clear our data when the phone is low on space.
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  if (!boot) return null;
  if (boot.status === 'error') return <Recovery message={boot.message} legacyRaw={boot.legacyRaw} />;
  return <Shell migrated={boot.migrated} />;
}

/** Shown if the one-time data upgrade fails. The old data is untouched and can be saved from here. */
function Recovery({ message, legacyRaw }: { message: string; legacyRaw: string | null }) {
  return (
    <main className="recovery">
      <div className="card stack">
        <h2>Your data couldn't be upgraded</h2>
        <p>Nothing has been deleted. Save a copy of your data now, then send it over so it can be fixed.</p>
        <p className="hint">Error: {message}</p>
        {legacyRaw && (
          <button type="button" className="full" onClick={() => saveFile('workout-data-original.json', legacyRaw)}>
            Save a copy of my data
          </button>
        )}
        <button type="button" className="ghost full" onClick={() => location.reload()}>Try again</button>
      </div>
    </main>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const titles: Record<View, string> = { log: 'Log', history: 'History', progress: 'Progress', exercises: 'Exercises', templates: 'Templates' };

function Shell({ migrated }: { migrated: MigrationInfo | null }) {
  // undefined until loaded: don't render (or convert the draft's units) against default settings.
  const settings = useLiveQuery(() => getSettings(db), []);
  const [view, setView] = useState<View>('log');
  const [draft, setDraftState] = useState<Draft | null | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(
    migrated && migrated.sessions
      ? `Your data was upgraded: ${plural(migrated.sessions, 'workout')} and ${plural(migrated.sets, 'set')} carried over.`
      : null
  );

  const loadDraft = () => getDraft(db).then((d) => setDraftState(d));
  useEffect(() => { loadDraft(); }, []);

  // The draft lives in React state while editing and is saved on every change, so closing the
  // app mid-workout loses nothing.
  const setDraft = (d: Draft | null) => {
    setDraftState(d);
    saveDraft(db, d);
  };

  // If the unit setting changes mid-workout, convert what's been typed so far.
  const unit = settings?.unit;
  useEffect(() => {
    if (draft && unit && draft.unit !== unit) setDraft(convertDraftUnit(draft, unit));
  }, [unit, draft]);

  function show(v: View) {
    setView(v);
    window.scrollTo(0, 0);
  }

  // After finishing a workout: go to History, and celebrate any PRs it set.
  const [celebrate, setCelebrate] = useState<PR[] | null>(null);
  const [exerciseMap, setExerciseMap] = useState<Map<string, Exercise>>(new Map());
  async function afterSave(sessionId: string) {
    show('history');
    const exercises = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
    const prs = findPRs(await listSessions(db), exercises).get(sessionId);
    if (prs?.length) {
      setExerciseMap(exercises);
      setCelebrate(prs);
    }
  }

  if (draft === undefined || !settings || !unit) return null;
  const title = view === 'log' && draft ? 'Workout' : titles[view];

  return (
    <>
      <header className="topbar">
        <h1>{title}</h1>
        {/* Screens can put their own buttons here (Log puts "Finish" during a workout). */}
        <div id="header-slot" className="header-slot" />
        <button type="button" className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      </header>

      <main>
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button type="button" className="ghost small" onClick={() => setNotice(null)}>OK</button>
          </div>
        )}
        <section className="view active" key={view}>
          {view === 'log' && <LogView draft={draft} settings={settings} onChange={setDraft} onSaved={afterSave} />}
          {view === 'history' && <HistoryView unit={unit} />}
          {view === 'progress' && <ProgressView settings={settings} />}
          {view === 'exercises' && <ExercisesView onMerged={loadDraft} />}
          {view === 'templates' && <TemplatesView />}
        </section>
      </main>

      <nav className="tabs">
        <Tab view="log" current={view} onClick={show} label="Log"><path d="M12 5v14M5 12h14" /></Tab>
        <Tab view="history" current={view} onClick={show} label="History">
          <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" />
        </Tab>
        <Tab view="progress" current={view} onClick={show} label="Progress"><path d="M3 17l6-6 4 4 8-8M15 7h6v6" /></Tab>
        <Tab view="exercises" current={view} onClick={show} label="Exercises">
          <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
        </Tab>
        <Tab view="templates" current={view} onClick={show} label="Templates">
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </Tab>
      </nav>

      <Celebration prs={celebrate} exercises={exerciseMap} unit={unit} onClose={() => setCelebrate(null)} />

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onImported={() => { setSettingsOpen(false); loadDraft(); show('history'); }}
      />
    </>
  );
}

function Tab(props: { view: View; current: View; label: string; onClick: (v: View) => void; children: ReactNode }) {
  return (
    <button type="button" className={'tab' + (props.view === props.current ? ' active' : '')} onClick={() => props.onClick(props.view)}>
      <svg viewBox="0 0 24 24">{props.children}</svg>
      <span>{props.label}</span>
    </button>
  );
}
