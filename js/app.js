// UI: tab switching and the four views. All data goes through `Store` (storage.js).

(function () {
  var $ = function (sel) { return document.querySelector(sel); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function today() {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function prettyDate(iso) {
    var p = iso.split('-');
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
  }

  function refreshExerciseList() {
    $('#exerciseList').innerHTML = Store.exerciseNames().map(function (n) {
      return '<option value="' + esc(n) + '">';
    }).join('');
  }

  // ---------- Tabs ----------

  var renderers = {
    log: renderLog,
    history: renderHistory,
    progress: renderProgress,
    templates: renderTemplates
  };

  function show(view) {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.view === view);
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('active', v.id === 'view-' + view);
    });
    renderers[view]();
  }

  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { show(t.dataset.view); });
  });

  // ---------- Log ----------

  // The workout being filled in. null = not started yet.
  var draft = null;

  function startDraft(templateId) {
    var t = templateId ? Store.getTemplate(templateId) : null;
    draft = {
      date: today(),
      templateId: t ? t.id : null,
      notes: '',
      exercises: (t ? t.exercises : ['']).map(function (name) {
        return { name: name, sets: [{ reps: '', weight: '' }] };
      })
    };
    renderLog();
  }

  function renderLog() {
    var el = $('#view-log');
    refreshExerciseList();

    if (!draft) {
      var templates = Store.getTemplates();
      el.innerHTML =
        '<h2>Start a workout</h2>' +
        templates.map(function (t) {
          return '<div class="card"><div class="template-head"><div>' +
            '<div class="summary-title">' + esc(t.name) + '</div>' +
            '<div class="muted">' + esc(t.exercises.join(', ')) + '</div></div>' +
            '<button type="button" data-start="' + t.id + '">Start</button></div></div>';
        }).join('') +
        '<button type="button" class="ghost full" data-start="">Start a blank workout</button>';
      return;
    }

    el.innerHTML =
      '<div class="card row">' +
        '<div class="grow"><label for="logDate">Date</label>' +
        '<input type="date" id="logDate" value="' + draft.date + '"></div>' +
        '<button type="button" class="danger" id="discardBtn">Discard</button>' +
      '</div>' +
      draft.exercises.map(function (ex, i) {
        return '<div class="card">' +
          '<div class="exercise-head">' +
            '<input list="exerciseList" placeholder="Exercise name" data-ex="' + i + '" data-field="name" value="' + esc(ex.name) + '">' +
            '<button type="button" class="danger small" data-remove-ex="' + i + '" aria-label="Remove exercise">✕</button>' +
          '</div>' +
          '<div class="set-row set-labels"><span></span><span>Reps</span><span>Weight</span><span></span></div>' +
          ex.sets.map(function (s, j) {
            return '<div class="set-row">' +
              '<span class="set-num">' + (j + 1) + '</span>' +
              '<input type="number" inputmode="numeric" min="0" placeholder="0" data-ex="' + i + '" data-set="' + j + '" data-field="reps" value="' + esc(s.reps) + '">' +
              '<input type="number" inputmode="decimal" min="0" step="any" placeholder="0" data-ex="' + i + '" data-set="' + j + '" data-field="weight" value="' + esc(s.weight) + '">' +
              '<button type="button" class="ghost small" data-remove-set="' + i + ':' + j + '" aria-label="Remove set">✕</button>' +
            '</div>';
          }).join('') +
          '<button type="button" class="ghost small" data-add-set="' + i + '">+ Add set</button>' +
        '</div>';
      }).join('') +
      '<div class="stack">' +
        '<button type="button" class="ghost full" id="addExBtn">+ Add exercise</button>' +
        '<div><label for="logNotes">Notes</label>' +
        '<textarea id="logNotes" placeholder="How did it feel?">' + esc(draft.notes) + '</textarea></div>' +
        '<button type="button" class="full" id="saveWorkoutBtn">Save workout</button>' +
      '</div>';
  }

  // Typing updates the draft without re-rendering (so the cursor stays put).
  $('#view-log').addEventListener('input', function (e) {
    var t = e.target;
    if (!draft) return;
    if (t.id === 'logDate') draft.date = t.value;
    else if (t.id === 'logNotes') draft.notes = t.value;
    else if (t.dataset.field === 'name') draft.exercises[t.dataset.ex].name = t.value;
    else if (t.dataset.field) draft.exercises[t.dataset.ex].sets[t.dataset.set][t.dataset.field] = t.value;
  });

  $('#view-log').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var d = b.dataset;

    if ('start' in d) return startDraft(d.start);

    if (b.id === 'discardBtn') {
      if (confirm('Discard this workout? It has not been saved.')) { draft = null; renderLog(); }
      return;
    }
    if (b.id === 'addExBtn') {
      draft.exercises.push({ name: '', sets: [{ reps: '', weight: '' }] });
    } else if ('removeEx' in d) {
      draft.exercises.splice(+d.removeEx, 1);
    } else if ('addSet' in d) {
      // Copy the previous set so repeating the same weight is one tap.
      var sets = draft.exercises[d.addSet].sets;
      var last = sets[sets.length - 1] || { reps: '', weight: '' };
      sets.push({ reps: last.reps, weight: last.weight });
    } else if ('removeSet' in d) {
      var ij = d.removeSet.split(':');
      draft.exercises[ij[0]].sets.splice(+ij[1], 1);
    } else if (b.id === 'saveWorkoutBtn') {
      return saveDraft();
    } else {
      return;
    }
    renderLog();
  });

  function saveDraft() {
    var exercises = draft.exercises
      .map(function (ex) {
        return {
          name: ex.name.trim(),
          sets: ex.sets
            .filter(function (s) { return s.reps !== '' && Number(s.reps) > 0; })
            .map(function (s) { return { reps: Number(s.reps), weight: Number(s.weight) || 0 }; })
        };
      })
      .filter(function (ex) { return ex.name && ex.sets.length; });

    if (!draft.date) return alert('Pick a date for this workout.');
    if (!exercises.length) return alert('Add at least one exercise with a name and a set with reps.');

    Store.addWorkout({
      date: draft.date,
      templateId: draft.templateId,
      notes: draft.notes.trim(),
      exercises: exercises
    });
    draft = null;
    show('history');
  }

  // ---------- History ----------

  function renderHistory() {
    var el = $('#view-history');
    var workouts = Store.getWorkouts();
    if (!workouts.length) {
      el.innerHTML = '<p class="empty">No workouts yet. Log one from the Log tab.</p>';
      return;
    }
    el.innerHTML = '<h2>' + workouts.length + ' workout' + (workouts.length === 1 ? '' : 's') + '</h2>' +
      workouts.map(function (w) {
        var t = w.templateId ? Store.getTemplate(w.templateId) : null;
        var setCount = w.exercises.reduce(function (n, ex) { return n + ex.sets.length; }, 0);
        return '<details class="card"><summary>' +
            '<span><span class="summary-title">' + esc(prettyDate(w.date)) + '</span>' +
            (t ? ' <span class="muted">· ' + esc(t.name) + '</span>' : '') + '</span>' +
            '<span class="muted">' + w.exercises.length + ' ex · ' + setCount + ' sets</span>' +
          '</summary><div class="workout-detail">' +
            w.exercises.map(function (ex) {
              return '<div class="summary-title">' + esc(ex.name) + '</div><ul>' +
                ex.sets.map(function (s) { return '<li>' + s.reps + ' reps × ' + s.weight + '</li>'; }).join('') +
                '</ul>';
            }).join('') +
            (w.notes ? '<p class="muted">' + esc(w.notes) + '</p>' : '') +
            '<button type="button" class="danger small" data-delete="' + w.id + '">Delete workout</button>' +
          '</div></details>';
      }).join('');
  }

  $('#view-history').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-delete]');
    if (b && confirm('Delete this workout? This cannot be undone.')) {
      Store.deleteWorkout(b.dataset.delete);
      renderHistory();
    }
  });

  // ---------- Progress ----------

  var chart = null;
  var progressExercise = '';

  // Heaviest set per date for one exercise, oldest first.
  function topSets(name) {
    var best = {};
    Store.getWorkouts().forEach(function (w) {
      w.exercises.forEach(function (ex) {
        if (ex.name.toLowerCase() !== name.toLowerCase()) return;
        ex.sets.forEach(function (s) {
          if (!(w.date in best) || s.weight > best[w.date]) best[w.date] = s.weight;
        });
      });
    });
    return Object.keys(best).sort().map(function (d) { return { date: d, weight: best[d] }; });
  }

  function renderProgress() {
    var el = $('#view-progress');
    // Only offer exercises that have actually been logged ("Squat" and "squat" count as one).
    var logged = {};
    Store.getWorkouts().forEach(function (w) {
      w.exercises.forEach(function (ex) {
        var key = ex.name.toLowerCase();
        if (!(key in logged)) logged[key] = ex.name;
      });
    });
    var names = Object.keys(logged).map(function (k) { return logged[k]; }).sort();

    if (chart) { chart.destroy(); chart = null; }
    if (!names.length) {
      el.innerHTML = '<p class="empty">Log a few workouts and your progress charts will show up here.</p>';
      return;
    }
    if (names.indexOf(progressExercise) < 0) progressExercise = names[0];

    var points = topSets(progressExercise);
    var first = points[0].weight;
    var best = Math.max.apply(null, points.map(function (p) { return p.weight; }));

    el.innerHTML =
      '<div class="card"><label for="progressPick">Exercise</label><select id="progressPick">' +
        names.map(function (n) {
          return '<option' + (n === progressExercise ? ' selected' : '') + '>' + esc(n) + '</option>';
        }).join('') +
      '</select></div>' +
      '<div class="stats">' +
        '<div class="card stat"><span class="muted">Best</span><b>' + best + '</b></div>' +
        '<div class="card stat"><span class="muted">Change</span><b>' + (best - first >= 0 ? '+' : '') + (best - first) + '</b></div>' +
        '<div class="card stat"><span class="muted">Sessions</span><b>' + points.length + '</b></div>' +
      '</div>' +
      '<div class="card"><div class="chart-wrap"><canvas id="progressChart"></canvas></div>' +
      '<p class="muted">Heaviest set each session.</p></div>';

    $('#progressPick').addEventListener('change', function (e) {
      progressExercise = e.target.value;
      renderProgress();
    });

    if (typeof Chart === 'undefined') {
      $('.chart-wrap').innerHTML = '<p class="empty">The chart needs an internet connection to load.</p>';
      return;
    }
    var css = getComputedStyle(document.documentElement);
    var accent = css.getPropertyValue('--accent').trim();
    var muted = css.getPropertyValue('--muted').trim();
    var border = css.getPropertyValue('--border').trim();
    chart = new Chart($('#progressChart'), {
      type: 'line',
      data: {
        labels: points.map(function (p) {
          var d = p.date.split('-');
          return new Date(d[0], d[1] - 1, d[2]).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        }),
        datasets: [{
          label: progressExercise,
          data: points.map(function (p) { return p.weight; }),
          borderColor: accent,
          backgroundColor: accent,
          tension: 0.25,
          pointRadius: 4
        }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: muted, maxRotation: 0, autoSkip: true }, grid: { display: false } },
          y: { ticks: { color: muted }, grid: { color: border }, title: { display: true, text: 'Weight', color: muted } }
        }
      }
    });
  }

  // ---------- Templates ----------

  var editingTemplate = null; // { id?, name, exercises[] } while the form is open

  function renderTemplates() {
    var el = $('#view-templates');
    if (editingTemplate) {
      el.innerHTML =
        '<div class="card stack">' +
          '<h2>' + (editingTemplate.id ? 'Edit template' : 'New template') + '</h2>' +
          '<div><label for="tplName">Name</label>' +
          '<input id="tplName" placeholder="e.g. Upper Body" value="' + esc(editingTemplate.name) + '"></div>' +
          '<div><label for="tplExercises">Exercises (one per line)</label>' +
          '<textarea id="tplExercises" rows="6" placeholder="Squat&#10;Bench Press">' + esc(editingTemplate.exercises.join('\n')) + '</textarea></div>' +
          '<div class="row"><button type="button" id="tplSave">Save</button>' +
          '<button type="button" class="ghost" id="tplCancel">Cancel</button></div>' +
        '</div>';
      return;
    }

    var templates = Store.getTemplates();
    el.innerHTML =
      (templates.length ? '' : '<p class="empty">No templates yet.</p>') +
      templates.map(function (t) {
        return '<div class="card"><div class="template-head">' +
          '<span class="summary-title">' + esc(t.name) + '</span>' +
          '<span class="template-actions">' +
            '<button type="button" class="ghost small" data-edit="' + t.id + '">Edit</button>' +
            '<button type="button" class="danger small" data-delete-tpl="' + t.id + '">Delete</button>' +
          '</span></div>' +
          '<div class="muted">' + esc(t.exercises.join(', ')) + '</div></div>';
      }).join('') +
      '<button type="button" class="full" id="tplNew">+ New template</button>';
  }

  $('#view-templates').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'tplNew') {
      editingTemplate = { name: '', exercises: [] };
    } else if (b.dataset.edit) {
      var t = Store.getTemplate(b.dataset.edit);
      editingTemplate = { id: t.id, name: t.name, exercises: t.exercises.slice() };
    } else if (b.dataset.deleteTpl) {
      if (!confirm('Delete this template? Past workouts are kept.')) return;
      Store.deleteTemplate(b.dataset.deleteTpl);
    } else if (b.id === 'tplCancel') {
      editingTemplate = null;
    } else if (b.id === 'tplSave') {
      var name = $('#tplName').value.trim();
      var exercises = $('#tplExercises').value.split('\n')
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
      if (!name) return alert('Give the template a name.');
      if (!exercises.length) return alert('Add at least one exercise.');
      Store.saveTemplate({ id: editingTemplate.id, name: name, exercises: exercises });
      editingTemplate = null;
    } else {
      return;
    }
    renderTemplates();
  });

  // ---------- Backup ----------

  $('#exportBtn').addEventListener('click', function () {
    var blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'workout-backup-' + today() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });

  $('#importFile').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('Replace everything in this tracker with the backup "' + file.name + '"?')) return;
    file.text().then(function (text) {
      try {
        Store.importJSON(text);
        draft = null;
        editingTemplate = null;
        alert('Backup restored.');
        show('history');
      } catch (err) {
        alert('Could not import that file: ' + err.message);
      }
    });
  });

  show('log');
})();
