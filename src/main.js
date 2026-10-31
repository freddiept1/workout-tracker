// UI: tab switching and the four views. All data goes through `Store` (storage.js).
import Chart from 'chart.js/auto';
import { registerSW } from 'virtual:pwa-register';
import { Store } from './storage.js';
import './styles.css';

registerSW({ immediate: true });

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function toDate(iso) {
  const [y, m, d] = iso.split('-');
  return new Date(y, m - 1, d);
}
const prettyDate = (iso) => toDate(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = (iso) => toDate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const unit = () => Store.getUnit();
const fmtSet = (s) => `${s.reps} × ${s.weight} ${unit()}`;

function refreshExerciseList() {
  $('#exerciseList').innerHTML = Store.exerciseNames().map((n) => `<option value="${esc(n)}">`).join('');
}

// ---------- Tabs ----------

const titles = { log: 'Log', history: 'History', progress: 'Progress', templates: 'Templates' };
const renderers = { log: renderLog, history: renderHistory, progress: renderProgress, templates: renderTemplates };
let currentView = 'log';

function show(view) {
  currentView = view;
  $('#viewTitle').textContent = view === 'log' && draft ? 'Workout' : titles[view];
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  renderers[view]();
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));

// ---------- Log ----------

// The workout being filled in (null = not started). Saved on every change so closing the app loses nothing.
let draft = Store.getDraft();
let justAdded = null; // "exerciseIndex:setIndex" of the set row to animate in

const persistDraft = () => Store.saveDraft(draft);

function startDraft(templateId) {
  const t = templateId ? Store.getTemplate(templateId) : null;
  draft = {
    date: today(),
    templateId: t ? t.id : null,
    notes: '',
    exercises: (t ? t.exercises : ['']).map((name) => {
      // Pre-fill with what you did last time, so you only change what's different.
      const last = Store.lastSets(name);
      const sets = last ? last.sets.map((s) => ({ reps: s.reps, weight: s.weight })) : [{ reps: '', weight: '' }];
      return { name, sets };
    })
  };
  persistDraft();
  show('log');
}

function lastTimeHtml(name) {
  const last = Store.lastSets(name);
  if (!last) return '';
  return `Last time (${esc(shortDate(last.date))}): <b>${last.sets.map(fmtSet).map(esc).join(', ')}</b>`;
}

function renderLog() {
  const el = $('#view-log');
  refreshExerciseList();

  if (!draft) {
    el.innerHTML =
      '<h2>Start a workout</h2>' +
      Store.getTemplates().map((t) => `
        <div class="card template-card">
          <div class="grow">
            <div class="card-title">${esc(t.name)}</div>
            <div class="card-sub">${esc(t.exercises.join(' · '))}</div>
          </div>
          <button type="button" data-start="${t.id}">Start</button>
        </div>`).join('') +
      '<button type="button" class="ghost full" data-start="">Start a blank workout</button>';
    return;
  }

  el.innerHTML = `
    <div class="card row">
      <div class="grow"><label for="logDate">Date</label>
      <input type="date" id="logDate" value="${draft.date}"></div>
      <button type="button" class="danger" id="discardBtn">Discard</button>
    </div>` +
    draft.exercises.map((ex, i) => `
      <div class="card">
        <div class="exercise-head">
          <input list="exerciseList" placeholder="Exercise name" data-ex="${i}" data-field="name" value="${esc(ex.name)}" autocapitalize="words">
          <button type="button" class="danger icon" data-remove-ex="${i}" aria-label="Remove exercise">✕</button>
        </div>
        <div class="last-time" data-last="${i}">${lastTimeHtml(ex.name)}</div>
        <div class="set-row set-labels"><span></span><span>Reps</span><span>Weight (${unit()})</span><span></span></div>
        ${ex.sets.map((s, j) => `
          <div class="set-row${justAdded === i + ':' + j ? ' new' : ''}">
            <span class="set-num">${j + 1}</span>
            <input type="text" inputmode="numeric" pattern="[0-9]*" placeholder="0" data-ex="${i}" data-set="${j}" data-field="reps" value="${esc(s.reps)}">
            <input type="text" inputmode="decimal" placeholder="0" data-ex="${i}" data-set="${j}" data-field="weight" value="${esc(s.weight)}">
            <button type="button" class="ghost icon" data-remove-set="${i}:${j}" aria-label="Remove set">✕</button>
          </div>`).join('')}
        <button type="button" class="ghost small" data-add-set="${i}">+ Add set</button>
      </div>`).join('') + `
    <div class="stack">
      <button type="button" class="ghost full" id="addExBtn">+ Add exercise</button>
      <div><label for="logNotes">Notes</label>
      <textarea id="logNotes" placeholder="How did it feel?">${esc(draft.notes)}</textarea></div>
    </div>
    <button type="button" class="full save-bar" id="saveWorkoutBtn">Save workout</button>`;
  justAdded = null;
}

// Typing updates the draft without re-rendering (so the cursor stays put).
$('#view-log').addEventListener('input', (e) => {
  const t = e.target;
  if (!draft) return;
  if (t.id === 'logDate') draft.date = t.value;
  else if (t.id === 'logNotes') draft.notes = t.value;
  else if (t.dataset.field === 'name') {
    draft.exercises[t.dataset.ex].name = t.value;
    $(`[data-last="${t.dataset.ex}"]`).innerHTML = lastTimeHtml(t.value);
  } else if (t.dataset.field) {
    // Keep only digits (and one decimal point for weight); iPhone number pads can still paste junk.
    const clean = t.dataset.field === 'reps'
      ? t.value.replace(/\D/g, '')
      : t.value.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    if (clean !== t.value) t.value = clean;
    draft.exercises[t.dataset.ex].sets[t.dataset.set][t.dataset.field] = clean;
  }
  persistDraft();
});

// Select the whole number on tap, so typing replaces it instead of appending.
$('#view-log').addEventListener('focusin', (e) => {
  if (e.target.dataset.set !== undefined) e.target.select();
});

$('#view-log').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;

  if ('start' in d) return startDraft(d.start);

  if (b.id === 'discardBtn') {
    if (!confirm('Discard this workout? It has not been saved.')) return;
    draft = null;
    persistDraft();
    return show('log');
  }
  if (b.id === 'saveWorkoutBtn') return saveDraft();

  if (b.id === 'addExBtn') {
    draft.exercises.push({ name: '', sets: [{ reps: '', weight: '' }] });
  } else if ('removeEx' in d) {
    const ex = draft.exercises[d.removeEx];
    if (ex.name && !confirm(`Remove ${ex.name}?`)) return;
    draft.exercises.splice(+d.removeEx, 1);
  } else if ('addSet' in d) {
    // Copy the previous set so repeating the same weight is one tap.
    const sets = draft.exercises[d.addSet].sets;
    const last = sets[sets.length - 1] || { reps: '', weight: '' };
    sets.push({ reps: last.reps, weight: last.weight });
    justAdded = d.addSet + ':' + (sets.length - 1);
  } else if ('removeSet' in d) {
    const [i, j] = d.removeSet.split(':');
    draft.exercises[i].sets.splice(+j, 1);
  } else {
    return;
  }
  persistDraft();
  renderLog();
  if (b.id === 'addExBtn') {
    const inputs = document.querySelectorAll('#view-log [data-field="name"]');
    inputs[inputs.length - 1].focus();
  }
});

function saveDraft() {
  const exercises = draft.exercises
    .map((ex) => ({
      name: ex.name.trim(),
      sets: ex.sets
        .filter((s) => s.reps !== '' && Number(s.reps) > 0)
        .map((s) => ({ reps: Number(s.reps), weight: Number(s.weight) || 0 }))
    }))
    .filter((ex) => ex.name && ex.sets.length);

  if (!draft.date) return alert('Pick a date for this workout.');
  if (!exercises.length) return alert('Add at least one exercise with a name and a set with reps.');

  Store.addWorkout({ date: draft.date, templateId: draft.templateId, notes: draft.notes.trim(), exercises });
  draft = null;
  persistDraft();
  show('history');
}

// ---------- History ----------

function renderHistory() {
  const el = $('#view-history');
  const workouts = Store.getWorkouts();
  if (!workouts.length) {
    el.innerHTML = '<p class="empty">No workouts yet.<br>Log one from the Log tab.</p>';
    return;
  }
  el.innerHTML = `<h2>${workouts.length} workout${workouts.length === 1 ? '' : 's'}</h2>` +
    workouts.map((w) => {
      const t = w.templateId ? Store.getTemplate(w.templateId) : null;
      const setCount = w.exercises.reduce((n, ex) => n + ex.sets.length, 0);
      return `
        <details class="card">
          <summary>
            <span>
              <span class="card-title">${esc(prettyDate(w.date))}</span><br>
              <span class="card-sub">${t ? esc(t.name) + ' · ' : ''}${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'} · ${setCount} sets</span>
            </span>
            <svg class="chev" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </summary>
          <div class="workout-detail">
            ${w.exercises.map((ex) => `
              <div class="card-title">${esc(ex.name)}</div>
              <div class="set-chips">${ex.sets.map((s) => `<span class="chip">${esc(fmtSet(s))}</span>`).join('')}</div>`).join('')}
            ${w.notes ? `<p class="muted">${esc(w.notes)}</p>` : ''}
            <button type="button" class="danger small" data-delete="${w.id}">Delete workout</button>
          </div>
        </details>`;
    }).join('');
}

$('#view-history').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-delete]');
  if (b && confirm('Delete this workout? This cannot be undone.')) {
    Store.deleteWorkout(b.dataset.delete);
    renderHistory();
  }
});

// ---------- Progress ----------

let chart = null;
let progressExercise = '';

// Heaviest set per date for one exercise, oldest first.
function topSets(name) {
  const best = {};
  for (const w of Store.getWorkouts()) {
    for (const ex of w.exercises) {
      if (ex.name.trim().toLowerCase() !== name.toLowerCase()) continue;
      for (const s of ex.sets) {
        if (!(w.date in best) || s.weight > best[w.date]) best[w.date] = s.weight;
      }
    }
  }
  return Object.keys(best).sort().map((date) => ({ date, weight: best[date] }));
}

function renderProgress() {
  const el = $('#view-progress');
  // Only offer exercises that have actually been logged ("Squat" and "squat" count as one).
  const logged = new Map();
  for (const w of Store.getWorkouts()) {
    for (const ex of w.exercises) {
      const key = ex.name.trim().toLowerCase();
      if (!logged.has(key)) logged.set(key, ex.name.trim());
    }
  }
  const names = [...logged.values()].sort();

  if (chart) { chart.destroy(); chart = null; }
  if (!names.length) {
    el.innerHTML = '<p class="empty">Log a few workouts and your progress charts will show up here.</p>';
    return;
  }
  // Default to the first exercise of the latest workout (usually the main lift).
  if (!names.includes(progressExercise)) progressExercise = logged.get(Store.getWorkouts()[0].exercises[0].name.trim().toLowerCase());

  const points = topSets(progressExercise);
  const first = points[0].weight;
  const best = Math.max(...points.map((p) => p.weight));
  const change = Math.round((best - first) * 100) / 100;

  el.innerHTML = `
    <div class="card"><label for="progressPick">Exercise</label>
      <select id="progressPick">${names.map((n) => `<option${n === progressExercise ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
    </div>
    <div class="stats">
      <div class="card"><span class="stat-label">Best</span><span class="stat-value">${best} <small>${unit()}</small></span></div>
      <div class="card"><span class="stat-label">Change</span><span class="stat-value${change > 0 ? ' up' : ''}">${change > 0 ? '+' : ''}${change} <small>${unit()}</small></span></div>
      <div class="card"><span class="stat-label">Sessions</span><span class="stat-value">${points.length}</span></div>
    </div>
    <div class="card"><div class="chart-wrap"><canvas id="progressChart"></canvas></div>
    <p class="hint">Heaviest set each session.</p></div>`;

  $('#progressPick').addEventListener('change', (e) => {
    progressExercise = e.target.value;
    renderProgress();
  });

  const css = getComputedStyle(document.documentElement);
  const color = (v) => css.getPropertyValue(v).trim();
  chart = new Chart($('#progressChart'), {
    type: 'line',
    data: {
      labels: points.map((p) => shortDate(p.date)),
      datasets: [{
        label: progressExercise,
        data: points.map((p) => p.weight),
        borderColor: color('--accent'),
        backgroundColor: color('--accent-soft'),
        pointBackgroundColor: color('--accent'),
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.parsed.y} ${unit()}` } }
      },
      scales: {
        x: { ticks: { color: color('--muted'), maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y: { ticks: { color: color('--muted') }, grid: { color: color('--border') }, border: { display: false } }
      }
    }
  });
}

// Redraw the chart in the right colours when the phone switches light/dark mode.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (currentView === 'progress') renderProgress();
});

// ---------- Templates ----------

let editingTemplate = null; // { id?, name, exercises[] } while the form is open

function renderTemplates() {
  const el = $('#view-templates');
  if (editingTemplate) {
    el.innerHTML = `
      <div class="card stack">
        <h2>${editingTemplate.id ? 'Edit template' : 'New template'}</h2>
        <div><label for="tplName">Name</label>
        <input id="tplName" placeholder="e.g. Upper Body" value="${esc(editingTemplate.name)}" autocapitalize="words"></div>
        <div><label for="tplExercises">Exercises (one per line)</label>
        <textarea id="tplExercises" rows="6" placeholder="Squat&#10;Bench Press" autocapitalize="words">${esc(editingTemplate.exercises.join('\n'))}</textarea></div>
        <div class="row"><button type="button" class="grow" id="tplSave">Save</button>
        <button type="button" class="ghost grow" id="tplCancel">Cancel</button></div>
      </div>`;
    return;
  }

  const templates = Store.getTemplates();
  el.innerHTML =
    (templates.length ? '' : '<p class="empty">No templates yet.</p>') +
    templates.map((t) => `
      <div class="card template-card">
        <div class="grow">
          <div class="card-title">${esc(t.name)}</div>
          <div class="card-sub">${esc(t.exercises.join(' · '))}</div>
        </div>
        <div class="template-actions">
          <button type="button" class="ghost small" data-edit="${t.id}">Edit</button>
          <button type="button" class="danger small" data-delete-tpl="${t.id}">Delete</button>
        </div>
      </div>`).join('') +
    '<button type="button" class="full" id="tplNew">+ New template</button>';
}

$('#view-templates').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'tplNew') {
    editingTemplate = { name: '', exercises: [] };
  } else if (b.dataset.edit) {
    const t = Store.getTemplate(b.dataset.edit);
    editingTemplate = { id: t.id, name: t.name, exercises: t.exercises.slice() };
  } else if (b.dataset.deleteTpl) {
    if (!confirm('Delete this template? Past workouts are kept.')) return;
    Store.deleteTemplate(b.dataset.deleteTpl);
  } else if (b.id === 'tplCancel') {
    editingTemplate = null;
  } else if (b.id === 'tplSave') {
    const name = $('#tplName').value.trim();
    const exercises = $('#tplExercises').value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!name) return alert('Give the template a name.');
    if (!exercises.length) return alert('Add at least one exercise.');
    Store.saveTemplate({ id: editingTemplate.id, name, exercises });
    editingTemplate = null;
  } else {
    return;
  }
  renderTemplates();
});

// ---------- Settings (units + backup) ----------

function syncUnitPick() {
  document.querySelectorAll('#unitPick button').forEach((b) => b.classList.toggle('on', b.dataset.unit === unit()));
}

$('#settingsBtn').addEventListener('click', () => {
  syncUnitPick();
  $('#settings').showModal();
});

$('#unitPick').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-unit]');
  if (!b) return;
  Store.setUnit(b.dataset.unit);
  syncUnitPick();
  renderers[currentView]();
});

$('#exportBtn').addEventListener('click', async () => {
  const name = `workout-backup-${today()}.json`;
  const file = new File([Store.exportJSON()], name, { type: 'application/json' });
  // On iPhone, the share sheet is the easy way to save the file to Files or send it somewhere.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Workout backup' }); return; } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#importBtn').addEventListener('click', () => $('#importFile').click());

$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!confirm(`Replace everything in this tracker with the backup "${file.name}"?`)) return;
  try {
    Store.importJSON(await file.text());
    draft = Store.getDraft();
    editingTemplate = null;
    $('#settings').close();
    alert('Backup restored.');
    show('history');
  } catch (err) {
    alert('Could not import that file: ' + err.message);
  }
});

show('log');
