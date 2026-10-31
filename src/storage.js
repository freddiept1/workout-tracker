// Data layer: the only file that touches localStorage.

const KEY = 'workoutTracker.v1';
const VERSION = 2;

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function starterData() {
  return {
    version: VERSION,
    settings: { unit: 'kg' },
    draft: null,
    workouts: [],
    templates: [
      { id: newId(), name: 'Push', exercises: ['Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Triceps Pushdown'] },
      { id: newId(), name: 'Pull', exercises: ['Deadlift', 'Pull-up', 'Barbell Row', 'Biceps Curl'] },
      { id: newId(), name: 'Legs', exercises: ['Squat', 'Romanian Deadlift', 'Leg Press', 'Calf Raise'] }
    ]
  };
}

// Upgrade older saved data to the current shape. Add a step here whenever VERSION goes up.
function migrate(data) {
  if (!data || typeof data !== 'object') return starterData();
  if (!Array.isArray(data.workouts)) data.workouts = [];
  if (!Array.isArray(data.templates)) data.templates = [];
  // v1 -> v2: add settings and the in-progress workout.
  if (!data.settings) data.settings = { unit: 'kg' };
  if (!('draft' in data)) data.draft = null;
  data.version = VERSION;
  return data;
}

let data;
try {
  const raw = localStorage.getItem(KEY);
  data = raw ? migrate(JSON.parse(raw)) : starterData();
} catch {
  data = starterData();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    alert('Could not save your data in this browser. Use Export to keep a backup.');
  }
}

const indexOf = (list, id) => list.findIndex((x) => x.id === id);
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const Store = {
  getWorkouts() {
    return data.workouts.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  },
  addWorkout(w) {
    w.id = newId();
    data.workouts.push(w);
    save();
  },
  deleteWorkout(id) {
    const i = indexOf(data.workouts, id);
    if (i >= 0) { data.workouts.splice(i, 1); save(); }
  },

  // Sets from the most recent saved workout that included this exercise.
  lastSets(name) {
    if (!name.trim()) return null;
    for (const w of this.getWorkouts()) {
      const ex = w.exercises.find((e) => same(e.name, name));
      if (ex) return { date: w.date, sets: ex.sets };
    }
    return null;
  },

  getTemplates() { return data.templates.slice(); },
  getTemplate(id) { return data.templates[indexOf(data.templates, id)] || null; },
  saveTemplate(t) {
    const i = t.id ? indexOf(data.templates, t.id) : -1;
    if (i >= 0) data.templates[i] = t;
    else { t.id = newId(); data.templates.push(t); }
    save();
  },
  deleteTemplate(id) {
    const i = indexOf(data.templates, id);
    if (i >= 0) { data.templates.splice(i, 1); save(); }
  },

  // Every exercise name ever used (one spelling per name), for autocomplete.
  exerciseNames() {
    const seen = new Map();
    const add = (n) => { const k = n.trim().toLowerCase(); if (k && !seen.has(k)) seen.set(k, n.trim()); };
    data.workouts.forEach((w) => w.exercises.forEach((ex) => add(ex.name)));
    data.templates.forEach((t) => t.exercises.forEach(add));
    return [...seen.values()].sort();
  },

  // The workout being logged, saved as you type so it survives the app being closed.
  getDraft() { return data.draft; },
  saveDraft(draft) { data.draft = draft; save(); },

  getUnit() { return data.settings.unit; },
  setUnit(unit) { data.settings.unit = unit; save(); },

  exportJSON() { return JSON.stringify(data, null, 2); },
  importJSON(text) {
    const parsed = JSON.parse(text); // throws on a bad file; caller shows the error
    if (!parsed || !Array.isArray(parsed.workouts)) throw new Error('This file is not a workout tracker backup.');
    data = migrate(parsed);
    save();
  }
};
