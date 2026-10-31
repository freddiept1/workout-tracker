# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About the user
The owner is a personal trainer and competitive powerlifter, new to coding, who uses the app daily as a PWA on an **iPhone** (installed from Safari). Explain changes in plain language and tell them what to check on their phone. Their real training data exists only on that phone, so it must never be lost.

## Roadmap and working rules
The app is being built in phases from `docs/SPEC.md` (the user's spec; the agreed phase list is in `CHANGELOG.md` and the data plan in `docs/DATA_MODEL.md`). Phase 0 (foundation) is done; next is Phase 1 (better logging), then 2 library, 3 analytics, 4 programs, 5 body/readiness, 6 gamified Lifter Profile, 7 sync/import/export. The user's rules:
- One phase at a time, and get approval before starting each. After each phase: run it, test it, commit with a clear message, publish, and give the user a phone checklist.
- Gym-first UI: big tap targets, dark mode, logging a set in under 2 seconds, works offline.
- Any schema change needs a migration. Never lose logged sessions.
- kg by default, with a kg/lb setting.
- Add tests for calculations (e1RM, XP, progression, plate maths).
- Keep `CHANGELOG.md` and `README.md` up to date.

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
- **In-progress workout:** stored in `meta.draft` exactly as typed (strings, in the unit typed), held in React state in `App.tsx` and saved on every change. `finishDraft()` turns it into a `Session`. Phase 1 will rework this for tick-to-confirm sets.
- **UI:** `App.tsx` is the shell (startup gate, header, bottom tabs, settings dialog), and `src/views/*` has one component per tab. Styles are in `src/styles.css`: CSS variables with dark-mode overrides, and `env(safe-area-inset-*)` for the notch and home bar. The chart reads the CSS variables.
- **Deploy:** `.github/workflows/deploy.yml` runs tests, builds and publishes to GitHub Pages on every push to `main` (https://freddiept1.github.io/workout-tracker/). Repo Settings → Pages → Source must be "GitHub Actions". Git credentials are saved by Git Credential Manager. If they expire, push fails with "terminal prompts disabled"; push once from a Terminal tab so the browser sign-in can appear.

## Testing notes
- The built-in browser pane can't register service workers, and it's often too short for phone screenshots. For PWA/offline checks and 390×844 screenshots, drive headless Edge with `puppeteer-core`, installed in a scratch folder outside the repo, against `npm run preview`.
- To test the upgrade path the user's phone takes, build the previously deployed commit in a temporary `git worktree` and serve it on a fixed port. Log data through its UI in a persistent puppeteer profile, then serve the new build on the same port and reopen that profile. Long `node_modules` paths can block `git worktree remove` on Windows; delete with `rmdir /s /q "\\?\<path>"`.
- Starter templates are created only on fresh installs. Seed test data through `repo.ts` functions or the UI, not raw localStorage, unless you're testing the legacy migration.
