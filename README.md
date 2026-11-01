# Workout Tracker

A strength-training log that installs on your iPhone like an app and works offline at the gym. It's being built up in phases into an advanced, gamified training app. See [docs/SPEC.md](docs/SPEC.md) for the full spec and [CHANGELOG.md](CHANGELOG.md) for what's changed.

Live app: **https://freddiept1.github.io/workout-tracker/**

## Using it on your iPhone
1. Open the link above in **Safari** (it has to be Safari).
2. Tap **Share**, then **Add to Home Screen**.
3. Open it from the new icon. It runs full-screen and works without signal.

Updates install by themselves the next time you open the app with signal.

## Features

### Logging a workout
- Start from a template or an empty workout, then add exercises from the picker (search, filter by type, or create your own).
- Sets are pre-filled from last time, with "Last · 24 Oct: 140 kg × 5 @ 8" shown under each exercise. Check the numbers and tap **✓**.
- **RPE** (6–10) for lifts. **Set types**: tap the set badge for warm-up, top set, back-off, AMRAP, drop set or failure, plus side, tempo, notes and plates.
- **Rest timer** starts when you tick a set. Rest is set per exercise and remembered, with ±15 s and Skip.
- **Supersets/circuits** from an exercise's ⋯ menu. Rest comes after the last exercise in the group.
- **Plate calculator** and **warm-up generator** in the ⋯ menu, using your bar and plates from Settings.
- Your in-progress workout is saved as you type, even if the app closes. Tap **Finish** in the top bar when you're done.

### Athletic work
Sprints, jumps, hops, bounds, throws, carries and sleds are logged by **what you did and how hard you went** (effort as % of max), not by times or distances achieved:

| Type | Logged as |
| --- | --- |
| Sprint | distance × reps @ effort |
| Jump / hop | reps @ effort (left/right for single-leg) |
| Throw | ball weight × reps @ effort |
| Carry / sled | load × distance @ effort |

### Exercise library (Exercises tab)
172 built-in exercises: powerlifting lifts with their variations (paused, deficit, tempo, Larsen, Spoto, close-grip, pin, box…), Olympic lifts (clean, power clean, clean and jerk, snatch and their hang/power/pull variations), accessories, core, and athletic work. Each one is tagged with muscles (%), movement pattern and equipment.
- Search and filter by category, muscle or equipment. Variations are listed under their lift.
- ★ to favourite. Favourites and recent exercises appear first when adding to a workout.
- Tap an exercise to edit it. Use **+ New exercise** to add your own, **Remove** to hide one (restore it from "Removed exercises"), or **Merge** to fold a duplicate into another exercise along with its history.
- **Tempo:** tap the tempo chip on any lift during a workout. Set a default per exercise in the library.

### Programs (Plan tab)
- Build multi-week programs (weeks × days) or start from an example: Linear Strength Base, Powerlifting RPE Block, Athletic Power.
- Each lift gets a method: **linear**, **double progression**, **RPE-based**, **% of 1RM** (per-week waves), or **fixed**. Athletic work is planned as reps @ effort.
- Start the next workout from the Plan or Log tab. Every exercise shows its plan and why ("+2.5 kg: you hit 3 × 5 last time"), and you can type over any weight.
- Missed days don't break anything: the program waits. **Skip** to move on. **Deloads** every N weeks halve the sets and take 10% off.
- **Stalled lifts** (no e1RM gain for 3+ weeks of training) are flagged, with suggested fixes.
- **Templates:** single-day routines. Save any past workout as one, or **Repeat** it, from History.

### Progress and PRs
- **Lifts:**
  - Estimated 1RM chart (RPE-adjusted when you logged RPE, otherwise Epley), or the heaviest set.
  - Optionally includes the lift's variations.
  - Best 1RM–12RM table and PR history.
  - Athletic work charts volume (sprint metres, jumps, throws, heaviest carry).
- **Week:** sessions, sets and tonnage vs last week, PRs, hard sets per muscle group vs a typical range, tonnage by week, and a consistency calendar.
- **Total:** best squat + bench + deadlift (lifted and e1RM), with DOTS and Wilks. Set your category and bodyweight in Settings.
- **PRs** (heaviest weight, rep PRs, e1RM, session volume) get a celebration when you finish a workout, and 🏆 badges in History.

### Other screens
- **History**: every workout, newest first, with tonnage and PR badges. Tap one for details or to delete it.
- **Settings** (gear icon): kg or lb (weights are converted), rest timer beep and notifications, bar/collar/plates, backup Export/Import.

## Your data
Everything is stored on your phone only, in the browser's database (IndexedDB). Nothing is sent anywhere.
- Your phone and your computer each keep their own data.
- **Back up now and then:** Settings → **Export** opens the share sheet so you can save the file to Files or iCloud Drive. **Import** restores a backup (old-format backups work too) and replaces what's in the app.

## Developing
Needs Node.js (LTS).

```
npm install          # first time only
npm run dev          # http://localhost:5173, refreshes as you edit
npm test             # run the tests
npm run typecheck    # check types
npm run build        # production build into dist/
```

Pushing to `main` on GitHub runs the tests, builds, and publishes to GitHub Pages automatically.

### Project layout
- `src/db/`: data model (`types.ts`), database (`db.ts`), reads/writes (`repo.ts`), migration from the old localStorage format (`migrateLegacy.ts`), the exercise library (`library.ts`) and its installer (`seed.ts`)
- `src/lib/`: pure logic with tests next to it: tracking types (`tracking.ts`), the in-progress workout (`draft.ts`), plates, warm-ups, progress metrics, units
- `src/views/`: one component per screen (the session screen's parts are in `views/log/`); `src/App.tsx` is the shell (tabs, header, startup)
- `docs/`: spec and data-model plan
