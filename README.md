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

### Other screens
- **History**: every workout, newest first. Tap one for details or to delete it.
- **Progress**: lifts chart the heaviest set per session. Athletic work charts volume (sprint metres, total jumps/throws, heaviest carry).
- **Templates**: your own routines, with one exercise per line.
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
- `src/db/`: data model (`types.ts`), database (`db.ts`), reads/writes (`repo.ts`), migration from the old localStorage format (`migrateLegacy.ts`), built-in athletic exercises (`seed.ts`)
- `src/lib/`: pure logic with tests next to it: tracking types (`tracking.ts`), the in-progress workout (`draft.ts`), plates, warm-ups, progress metrics, units
- `src/views/`: one component per screen (the session screen's parts are in `views/log/`); `src/App.tsx` is the shell (tabs, header, startup)
- `docs/`: spec and data-model plan
