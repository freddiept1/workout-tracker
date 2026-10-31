// Data layer: the only file that touches localStorage.
// Everything else calls these functions via the global `Store`.

var Store = (function () {
  var KEY = 'workoutTracker.v1';
  var VERSION = 1;

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function starterData() {
    return {
      version: VERSION,
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
    data.version = VERSION;
    return data;
  }

  var data;
  try {
    var raw = localStorage.getItem(KEY);
    data = raw ? migrate(JSON.parse(raw)) : starterData();
  } catch (e) {
    data = starterData();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      alert('Could not save your data in this browser. Use Export to keep a backup.');
    }
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }

  return {
    newId: newId,

    getWorkouts: function () {
      return data.workouts.slice().sort(function (a, b) {
        return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
      });
    },
    addWorkout: function (w) {
      w.id = newId();
      data.workouts.push(w);
      save();
    },
    deleteWorkout: function (id) {
      var i = byId(data.workouts, id);
      if (i >= 0) { data.workouts.splice(i, 1); save(); }
    },

    getTemplates: function () { return data.templates.slice(); },
    getTemplate: function (id) {
      var i = byId(data.templates, id);
      return i >= 0 ? data.templates[i] : null;
    },
    saveTemplate: function (t) {
      var i = t.id ? byId(data.templates, t.id) : -1;
      if (i >= 0) data.templates[i] = t;
      else { t.id = newId(); data.templates.push(t); }
      save();
    },
    deleteTemplate: function (id) {
      var i = byId(data.templates, id);
      if (i >= 0) { data.templates.splice(i, 1); save(); }
    },

    // Every exercise name ever used, for the Progress picker and autocomplete.
    exerciseNames: function () {
      var seen = {};
      data.workouts.forEach(function (w) {
        w.exercises.forEach(function (ex) { seen[ex.name] = true; });
      });
      data.templates.forEach(function (t) {
        t.exercises.forEach(function (n) { seen[n] = true; });
      });
      return Object.keys(seen).sort();
    },

    exportJSON: function () { return JSON.stringify(data, null, 2); },
    importJSON: function (text) {
      var parsed = JSON.parse(text); // throws on bad file; caller shows the error
      if (!parsed || !Array.isArray(parsed.workouts)) throw new Error('This file is not a workout tracker backup.');
      data = migrate(parsed);
      save();
    }
  };
})();
