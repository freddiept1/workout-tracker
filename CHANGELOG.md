# Changelog

All notable changes to the Workout Tracker. Newest first.

## Phase 1: Better logging + athletic work (2026-11-01)

### Added
- **Tick to log.** Each set has a ✓ button. Sets are pre-filled from last time, so logging a set is usually one tap. Ticking an empty set jumps to the empty field instead.
- **RPE** for lifts (6–10 in 0.5 steps) via a quick picker. It isn't pre-filled, because it describes today's set.
- **Set types:** warm-up (W, not counted towards PRs or volume), working (numbered), top set (T), back-off (B), AMRAP (A), drop set (D), failure (F). Tap the set badge to change the type, side, tempo or notes, see plates, or delete the set.
- **Athletic work**, tracked by what you did and the effort you put in (% of max), not by measured results:
  - Sprint: distance × reps @ effort
  - Jump / hop: reps @ effort
  - Throw: ball weight × reps @ effort
  - Carry / sled: load × distance @ effort
  - Single-leg/arm exercises record left/right.
  - Starter list of 36 sprints, jumps, hops, bounds, med-ball throws, carries and sleds.
- **Exercise picker** with search and type filters. Create your own exercise and choose how it's logged.
- **"Last · 24 Oct: 140 kg × 5 @ 8"** under every exercise.
- **Rest timer** that starts when you tick a set. Rest is set per exercise and remembered, with ±15 s and Skip. It beeps when rest is over, and shows a notification if allowed (on iPhone only while the app is still running, not when the phone is locked). The timer survives the app closing.
- **Supersets and circuits:** link exercises from the ⋯ menu. Ticking moves you to the next exercise in the group, and rest starts after the last one.
- **Plate calculator** with a picture of the bar. Set your bar, collars and the plates your gym has in Settings.
- **Warm-up generator:** empty bar, then 40/60/80/90% of your working weight, rounded to plates you have.
- Exercise notes, reorder exercises, and a Finish button in the top bar.
- If you finish with sets filled in but not ticked, the app asks whether to save them.
- Progress charts for athletic work show volume: total sprint metres, total jumps or throws, and heaviest carry load.

### Changed
- A workout that was in progress during the update carries over automatically.
- Backups are now format 4. Older backups still import.

### Fixed
- For pound users, reopening the app mid-workout could nudge typed weights (325 → 325.01 lb), because they were briefly converted using default settings.

## Phase 0: Foundation (2026-10-31)

The app looks and works the same; this rebuilds what's underneath so the coming features have room to grow.

### Changed
- Data moved from browser localStorage to IndexedDB, which holds far more (years of logs and, later, progress photos). On first launch your existing workouts, templates, in-progress workout and unit setting are copied across automatically, and a one-time message confirms how many workouts and sets carried over. The original data is left untouched as a fallback.
- Switching between kg and lb now converts weights. Weights are stored in kg internally.
- Rebuilt in React and TypeScript.
- The app asks the phone to keep its storage persistent, so iOS is less likely to clear it.

### Added
- Exercises are now real records (so "Squat" and "squat" are always the same lift), ready for the exercise library.
- If the data upgrade ever fails, a recovery screen lets you save a copy of your original data. Nothing is deleted.
- Backups use a new format that includes everything. Old backup files can still be imported.
- Automated tests for the migration, unit conversion, "last time", saving workouts and backups. The deploy stops if any test fails.

### Fixed
- Templates now always keep their order.

## Earlier versions

- **2026-10-31**: Installable iPhone app (PWA) with offline support, bottom tab bar, last-time pre-fill, in-progress workout auto-save, kg/lb label, export via share sheet, GitHub Pages deploy.
- **2026-10-31**: First version: log workouts, history, progress chart, templates.
