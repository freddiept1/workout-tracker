# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About the user
The owner is a personal trainer and competitive powerlifter, new to coding, who uses the app daily as a PWA on an **iPhone** (installed from Safari). Explain changes in plain language and tell them what to check on their phone. Their real training data exists only on that phone, so it must never be lost.

## Roadmap and working rules
The app is being built in phases from `docs/SPEC.md` (the user's spec; the agreed phase list is in `CHANGELOG.md` and the data plan in `docs/DATA_MODEL.md`). Phases 0 (foundation), 1 (better logging + athletic work), 2 (exercise library), 3 (analytics) and 4 (programs + auto-progression) are done. Next is 5 body/readiness: a bodyweight log should replace `settings.bodyweightKg` as the source for DOTS/Wilks, and a readiness score could scale program prescriptions. Then 6 gamified Lifter Profile (+500 XP per finished program: `Program.status` becomes 'completed'), and 7 sync/import/export. The user's rules:
- One phase at a time, and get approval before starting each. After each phase: run it, test it, commit with a clear message, publish, and give the user a phone checklist.
- Gym-first UI: big tap targets, dark mode, logging a set in under 2 seconds, works offline.
- Any schema change needs a migration. Never lose logged sessions.
- kg by default, with a kg/lb setting.
- Add tests for calculations (e1RM, XP, progression, plate maths).
- Keep `CHANGELOG.md` and `README.md` up to date.
- **Athletic work is about force production and effort, not measured results.** The user does not time sprints or measure jump heights or throw distances. Sprints, jumps/hops, throws and carries/sleds record what was done (distance, reps, load) plus effort as % of max. Don't add time, height or throw-distance fields, and don't build PRs, ranks or XP on athletic "results". Use volume and effort instead.

## Commands
- `npm run dev`: dev server at http://localhost:5173 (also `.claude/launch.json` → `dev` for the browser pane)
- `npm test`: Vitest (`src/**/*.test.ts`). Run one file with `npx vitest run src/db/repo.test.ts`, or one test with `-t "name"`
- `npm run typecheck`: `tsc` (TypeScript 7)
- `npm run build`: typecheck + production build into `dist/`. Set `BASE_PATH=/workout-tracker/` to match GitHub Pages
- `npm run icons`: regenerate the PNG icons from `public/icon.svg`

On this Windows machine, if `npm` isn't found, refresh PATH from the Machine and User environment variables, and call `npm.cmd` from PowerShell.

## Architecture
- **Stack:** Vite + React 19 + TypeScript, Dexie (IndexedDB), Chart.js, vite-plugin-pwa (Workbox, `autoUpdate`). It's deliberately a PWA, not React Native: the user installs it free from Safari. Keep calculation logic in plain TS modules under `src/lib/` so it could move to Expo later.
- **Data:** the model is in `src/db/types.ts`, the schema in `src/db/db.ts`, and the plan for every phase in `docs/DATA_MODEL.md`. Weights are always stored as `weightKg`; convert only at display/input via `src/lib/units.ts`. Every record has id/createdAt/updatedAt/deletedAt (soft delete, for future sync), and lifter-owned records have `athleteId` (`ME`), for future coach mode. Exercise ids are name slugs (`exerciseIdFor`), so capitalisation variants are one exercise. Sessions nest exercises → sets in one record. `exerciseIds` is a multi-entry index used for "last time" lookups.
- **All DB access goes through `src/db/repo.ts`.** UI reads through the live-query hooks in `src/hooks.ts`, so screens update when data changes.
- **Schema changes:** add a new `this.version(n).stores(...)` in `db.ts`, with an `.upgrade()` if existing records need reshaping; never edit an old version block. Add a test that runs the upgrade on old-shaped data.
- **Legacy migration:** `startup()` in `repo.ts` runs once per device. It copies the old localStorage blob (key `workoutTracker.v1`) through the pure `migrateLegacy()` into IndexedDB inside a transaction that re-checks `meta.migration`, so it can't run twice. It leaves localStorage untouched as a fallback. If it fails, `App.tsx` shows a recovery screen that can save the raw old data. Old-format backup files are imported through the same function.
- **Tracking modes:** `Exercise.tracking` (`strength`, `reps`, `sprint`, `jump`, `throw`, `carry`; missing or unknown = strength) decides a set's fields and rating, per `MODES` in `src/lib/tracking.ts`. Strength and reps take RPE; athletic modes take effort %. Add a mode there, and everything else (set row, summary text, saving, progress metric in `lib/progress.ts`) follows from it.
- **Exercise library:** `src/db/library.ts` lists the built-in exercises. Ids are name slugs, so never rename an entry: add new ones and bump `LIBRARY_VERSION`. Variations are `parent` links, and muscle %s must total 100 (tested). `applyLibrary()` in `seed.ts` runs on startup once per version, and after imports. It adds missing exercises and only fills *empty* tags on existing ones. It never changes an existing exercise's tracking mode, overwrites the user's edits, or revives a hidden exercise. Tag vocabularies (muscles with avatar regions, patterns, equipment) are in `src/lib/muscles.ts`. Keys are stored, so don't rename them. Search, categories and family ordering are in `src/lib/exerciseList.ts`; a variation also matches its ancestors' names.
- **Editing exercises:** `saveExercise` / `hideExercise` (soft delete) / `restoreExercise` / `toggleFavourite` / `mergeExercise` in `repo.ts`. Merging rewrites sessions, templates, variations' parents and the draft, then hides the source with `mergedInto` set. `findExerciseByName` / `createExercise` follow `mergedInto`. Renaming keeps the id, and name lookups match the new name first, then fall back to the slug.
- **In-progress workout:** stored in `meta.draft` (`Draft` v2) exactly as typed (strings, in the unit typed), with `done`/`completedAt` per set and the rest timer's `endsAt`. It's held in React state in `App.tsx` and saved on every change. `getDraft()` upgrades a Phase 0 draft (no `v`) on first read. Pure helpers in `src/lib/draft.ts` cover pre-fill, unit conversion, supersets and which sets to keep on finish. `finishDraft()` turns it into a `Session`. `App.tsx` waits for settings to load before rendering, so the draft is never converted against default units.
- **Analytics (Phase 3)** are computed from sessions, never stored, so edits and deletes keep them right:
  - `lib/strength.ts`: e1RM (RTS RPE chart when RPE is logged, else Epley; reps 1–12), `isLiftSet` (strength mode, non-warm-up, weight and reps), tonnage.
  - `lib/prs.ts`: `findPRs` walks sessions oldest-first. A lift's first session is its baseline. Kinds are weight/reps/e1rm/volume, and a heaviest-weight set isn't also a rep PR. Also `repMaxTable` and `describePR`.
  - `lib/powerlifting.ts`: DOTS, Wilks, and `COMPETITION_LIFTS` (no partials).
  - `lib/weekly.ts`: Monday weeks, `regionShares` (≥25% = 1 set, 10–24% = 0.5, max per region), hard sets (strength/reps modes, RPE 7+ or unrated), week summary, tonnage by week, calendar.
  - Athletic work never feeds PRs, e1RM or hard sets, only volume.
  - The Progress tab is `views/ProgressView.tsx` with `views/progress/{Lift,Week,Total}Panel.tsx`. `App.afterSave` computes PRs for the just-finished session and shows `components/Celebration.tsx`.
- **Programs (Phase 4):** `Program` records live in the `programs` table (Dexie schema v2), with days and planned exercises nested. The schedule is a sequence (`slots`, `nextSlot` in `lib/programs.ts`), not dates: missed days just wait, and `log[slotKey]` records done/skipped.
  - `prescribe()` is the pure progression engine (linear/double/rpe/pct/fixed, deloads, athletic effort). It always returns `summary` + `why`. Keep explanations specific, and never silently override what the lifter types.
  - `buildProgramDraft()` in `repo.ts` gathers history and the reference 1RM, rounds loads to plates (`loadRounder`), and sets `draft.program` + `DraftExercise.plan`. `finishDraft()` writes `session.programDayId = "programId:slot"` and ticks the program's log.
  - Plateau detection is in `lib/plateau.ts`; example programs in `lib/examplePrograms.ts`. The UI is `views/PlanView.tsx` + `views/plan/ProgramEditor.tsx`.
- **Tempo:** `DraftExercise.tempo` applies to all of an exercise's sets on save (`toSetEntry`), unless a set has its own. It's pre-filled from the most common tempo last time (`commonTempo`), else `Exercise.defaultTempo`.
- **Session screen:** `src/views/LogView.tsx`, plus `views/log/` (exercise picker with favourites/recent/swap-family mode, set/RPE/tempo sheets, exercise ⋯ menu with swap/rest/warm-ups/plates/supersets, rest timer). The Exercises tab is `views/ExercisesView.tsx` + `views/library/ExerciseEditor.tsx`. Shared list UI is in `components/ExerciseList.tsx`. Bottom sheets use `components/Sheet.tsx` (a `<dialog>`). The top bar has a `#header-slot` that screens can portal buttons into (Finish). Rest-timer alerts are in `lib/alerts.ts`. iPhone web apps can't vibrate or run timers while locked, so don't promise lock-screen alerts.
- **UI:** `App.tsx` is the shell (startup gate, header, bottom tabs, settings dialog), and `src/views/*` has one component per tab. Styles are in `src/styles.css`: CSS variables with dark-mode overrides, and `env(safe-area-inset-*)` for the notch and home bar. The chart reads the CSS variables.
- **Deploy:** `.github/workflows/deploy.yml` runs tests, builds and publishes to GitHub Pages on every push to `main` (https://freddiept1.github.io/workout-tracker/). Repo Settings → Pages → Source must be "GitHub Actions". Git credentials are saved by Git Credential Manager. If they expire, push fails with "terminal prompts disabled"; push once from a Terminal tab so the browser sign-in can appear.

## Testing notes
- The built-in browser pane can't register service workers, and it's often too short for phone screenshots. For PWA/offline checks and 390×844 screenshots, drive headless Edge with `puppeteer-core`, installed in a scratch folder outside the repo, against `npm run preview`.
- To test the upgrade path the user's phone takes, build the previously deployed commit in a temporary `git worktree` and serve it on a fixed port. Log data through its UI in a persistent puppeteer profile, then serve the new build on the same port and reopen that profile. Long `node_modules` paths can block `git worktree remove` on Windows; delete with `rmdir /s /q "\\?\<path>"`.
- Starter templates are created only on fresh installs. Seed test data through `repo.ts` functions or the UI, not raw localStorage, unless you're testing the legacy migration.
- When driving the session screen with puppeteer: picker rows contain the exercise name plus a type tag, so match on the first `<span>`. React inputs need the native value setter plus an `input` event if you don't type into them.
