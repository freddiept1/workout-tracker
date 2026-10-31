# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About the user
The owner is new to coding. Explain changes in plain language, avoid adding tooling (Node, npm, build steps, frameworks) unless they ask, and tell them exactly how to see a change (e.g. "refresh the page").

## Running
No install or build: open `index.html` in a browser (double-click it), and reload the page to see edits. There is no test suite, linter, or package manager, and the machine has no Node/Python/git. To check a change yourself, don't open the `file://` URL in the built-in browser pane: it shows a static snapshot where scripts and localStorage don't work. Instead, serve the folder on localhost with a small PowerShell `System.Net.HttpListener` script (run in the background, kept outside the repo) and open `http://localhost:<port>/`. Test data saved there doesn't touch the user's real data, which lives under the `file://` origin.

## Architecture
- Plain HTML/CSS/JS loaded with classic `<script>` tags (not ES modules, which fail over `file://`). Load order in `index.html`: Chart.js 4.4.1 (cdnjs) → `js/storage.js` → `js/app.js`.
- All data lives in one localStorage key, `workoutTracker.v1`, shaped `{ version, workouts[], templates[] }`. A workout is `{ id, date: "YYYY-MM-DD", templateId|null, notes, exercises: [{ name, sets: [{ reps, weight }] }] }`; a template is `{ id, name, exercises: [string] }`.
- `js/storage.js` exposes a global `Store` and is the only code that reads or writes localStorage. `js/app.js` goes through `Store`'s functions.
- If you change the data shape, bump `VERSION` and add a step to `migrate()` in `storage.js`. Never drop existing user data.
- `app.js` is one IIFE with a section per view (Log, History, Progress, Templates), each with a `render*()` function that rebuilds that view's `innerHTML`. Clicks are handled by one delegated listener per view, keyed off `data-*` attributes. Escape user text with `esc()` before inserting it.
- The Log view keeps an unsaved `draft`. Typing updates the draft without re-rendering, so the cursor stays put. Only structural changes (add/remove set or exercise) call `renderLog()`.
- Progress plots the heaviest set per date for an exercise; exercise names match case-insensitively. Weights have no unit.
- Colors are CSS variables on `:root` in `styles.css`, with a dark-mode override. The chart reads them at render time.
- Export/Import of the JSON blob is the user's only backup. Keep it working.
