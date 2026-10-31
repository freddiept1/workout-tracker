import { useState } from 'react';
import { db } from '../db/db';
import { deleteTemplate, saveTemplate } from '../db/repo';
import { useExerciseMap, useTemplates } from '../hooks';

interface Editing {
  id?: string;
  name: string;
  exercises: string; // one name per line
}

export function TemplatesView() {
  const templates = useTemplates();
  const exercises = useExerciseMap();
  const [editing, setEditing] = useState<Editing | null>(null);
  const nameOf = (id: string) => exercises.get(id)?.name ?? id;

  async function save(e: Editing) {
    const names = e.exercises.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!e.name.trim()) return alert('Give the template a name.');
    if (!names.length) return alert('Add at least one exercise.');
    await saveTemplate(db, { id: e.id, name: e.name, exerciseNames: names });
    setEditing(null);
  }

  if (editing) {
    return (
      <div className="card stack">
        <h2>{editing.id ? 'Edit template' : 'New template'}</h2>
        <div>
          <label htmlFor="tplName">Name</label>
          <input
            id="tplName" placeholder="e.g. Upper Body" autoCapitalize="words" value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="tplExercises">Exercises (one per line)</label>
          <textarea
            id="tplExercises" rows={6} placeholder={'Squat\nBench Press'} autoCapitalize="words" value={editing.exercises}
            onChange={(e) => setEditing({ ...editing, exercises: e.target.value })}
          />
        </div>
        <div className="row">
          <button type="button" className="grow" onClick={() => save(editing)}>Save</button>
          <button type="button" className="ghost grow" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  if (!templates) return null;
  return (
    <>
      {!templates.length && <p className="empty">No templates yet.</p>}
      {templates.map((t) => (
        <div className="card template-card" key={t.id}>
          <div className="grow">
            <div className="card-title">{t.name}</div>
            <div className="card-sub">{t.exercises.map((e) => nameOf(e.exerciseId)).join(' · ')}</div>
          </div>
          <div className="template-actions">
            <button
              type="button" className="ghost small"
              onClick={() => setEditing({ id: t.id, name: t.name, exercises: t.exercises.map((e) => nameOf(e.exerciseId)).join('\n') })}
            >Edit</button>
            <button
              type="button" className="danger small"
              onClick={() => confirm('Delete this template? Past workouts are kept.') && deleteTemplate(db, t.id)}
            >Delete</button>
          </div>
        </div>
      ))}
      <button type="button" className="full" onClick={() => setEditing({ name: '', exercises: '' })}>+ New template</button>
    </>
  );
}
