# Workout Tracker

A strength-training log that installs on your iPhone like an app and works offline at the gym. It's being built up in phases into an advanced, gamified training app. See [docs/SPEC.md](docs/SPEC.md) for the full spec and [CHANGELOG.md](CHANGELOG.md) for what's changed.

Live app: **https://freddiept1.github.io/workout-tracker/**

## Using it on your iPhone
1. Open the link above in **Safari** (it has to be Safari).
2. Tap **Share**, then **Add to Home Screen**.
3. Open it from the new icon. It runs full-screen and works without signal.

Updates install by themselves the next time you open the app with signal.

## Features
- **Log**: start from a template or a blank workout. Sets are pre-filled with what you did last time, and a "Last time" line shows your previous numbers. "+ Add set" copies the previous set. Your in-progress workout is saved as you type, even if the app closes.
- **History**: every workout, newest first. Tap one for details or to delete it.
- **Progress**: heaviest set per session for any exercise, with your best and how much you've gained.
- **Templates**: your own routines, with one exercise per line.
- **Settings** (gear icon): kg or lb (weights are converted), plus backup Export/Import.

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
- `src/db/`: data model (`types.ts`), database (`db.ts`), reads/writes (`repo.ts`), migration from the old localStorage format (`migrateLegacy.ts`)
- `src/lib/`: pure helpers (units, dates, progress maths), with tests next to them
- `src/views/`: one component per screen; `src/App.tsx` is the shell (tabs, header, startup)
- `docs/`: spec and data-model plan
