# Changelog

All notable changes to the Workout Tracker. Newest first.

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
