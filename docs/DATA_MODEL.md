# Data model

Storage is IndexedDB (via Dexie), on the device. Weights are always stored in **kilograms**; the kg/lb setting only changes display and input.

Every record has `id`, `createdAt`, `updatedAt` and `deletedAt` (soft delete), so cloud sync can merge changes later. Records that belong to a lifter also have `athleteId` (`"me"` for now), so coach mode can store clients' data alongside yours.

Types live in `src/db/types.ts`, tables and indexes in `src/db/db.ts`.

## Built (Phases 0–4)

| Table | Key fields | Notes |
| --- | --- | --- |
| `exercises` | id (slug of name, e.g. `bench-press`), name, isCustom, **tracking** (strength/reps/sprint/jump/throw/carry), **unilateral**, **restSec**, **defaultDistanceM**, **defaultTempo**, **parentId**, **muscles**[{muscle, pct}], **pattern**, **equipment**, **mechanic**, **aliases**[], **favourite**, **mergedInto** | `tracking` decides a set's fields (missing = strength). Built-in exercises come from `src/db/library.ts`, installed by `applyLibrary()` (version in `meta.library`). Slug ids let the library match exercises migrated from old data. `parentId` links a variation to its lift. Removed exercises are soft-deleted. Merged ones also point to `mergedInto` |
| `sessions` | id, athleteId, date, startedAt, endedAt, templateId, programDayId, notes, sessionRpe, source (live/migrated/imported), exercises[], exerciseIds[] | Exercises and sets are nested inside the session (one record per workout), so a session is saved atomically. `exerciseIds` is a multi-entry index for "last time" lookups |
| ↳ session exercise | id, exerciseId, supersetGroup, restSec, notes, sets[] | Exercises sharing a `supersetGroup` are a superset/circuit |
| ↳ set | id, type (warmup/working/top/backoff/amrap/drop/failure), weightKg, reps, rpe, **distanceM**, **effortPct**, **side** (L/R), tempo, notes, completedAt | Lifts use weight/reps/RPE. Athletic work uses distance/reps/load plus `effortPct` (% of max), never measured results. `completedAt` is set when ticked off live (or at finish for filled-in unticked sets). History migrated from the old app has `null` here, which is how XP will tell live work from back-filled history |
| `templates` | id, athleteId, name, order, exercises[{exerciseId}] | |
| `meta` | key → value | `settings` ({unit, restSound, equipment {kg, lb: {bar, collar, plates[]}}}), `draft` (the in-progress workout exactly as typed, v2: per-set done/completedAt, rest timer endsAt), `migration` (when/what was migrated) |
| `metrics` (schema v3) | id, athleteId, date, kind (bodyweight/checkin), bodyweightKg, checkin {sleep, energy, soreness, stress} (each 1–5 or null) | One record per kind per day (index `[athleteId+kind+date]`); logging again updates it, and check-in answers merge. `meta.checkinSkipped` holds the date "Skip today" was tapped. `settings.bodyweightReminder` (off/daily/weekly). The 7-day average, trends and readiness are computed in `src/lib/body.ts` |
| `programs` (schema v2) | id, athleteId, name, weeks, deloadEvery, days[{id, name, exercises: PlannedExercise[]}], maxes{exerciseId: kg}, status (active/completed/archived), startedAt, log{"w1d1": {sessionId, date, skipped}} | Planned exercise: exerciseId, sets, reps ("5" or "8-12"), method (linear/double/rpe/pct/fixed), startKg, pcts[] (per week), rpe, incrementKg, effort, distanceM, notes. Program workouts set `session.programDayId = "programId:w1d1"` |

### Derived, not stored (Phase 3)

e1RM, PRs, rep maxes, weekly hard sets per muscle group, tonnage and the total/DOTS/Wilks are all computed from `sessions` when needed (see `src/lib/strength.ts`, `prs.ts`, `weekly.ts`, `powerlifting.ts`). That keeps them correct when a session is edited or deleted, and needs no migrations. `meta.settings` gained `sex` and `bodyweightKg` for DOTS/Wilks.

## Planned

| Phase | Table | Key fields |
| --- | --- | --- |
| 5 | `metrics` kinds | Built for bodyweight and check-ins (above). Waist/chest etc. would be new `kind`s |
| 5 | `photos` | id, athleteId, date, pose, blob (stored as a Blob in IndexedDB, never uploaded unless sync is on) |
| 5 | `painLog` | id, athleteId, date, area, severity, exerciseId, notes |
| 6 | `xpEvents` | id, athleteId, at, kind (set/rpe-bonus/session/pr/weekly-target/block), xp, sessionId, setId, muscles[{muscle, xp}]. A ledger: XP is written when work is logged live, back-filled once from history, and never written by edits |
| 6 | `achievements` | id, athleteId, badgeId, earnedAt, data |
| 6 | `quests`, `bosses` | id, athleteId, kind, target, progress, startsAt, endsAt, status |
| 6 | `meta.profile` | sex, bodyweight, weekly session target, game layer on/off |
| 7 | (sync) | Built: one Supabase table `records` (athlete_id, kind, id, data, updated_at, deleted_at, synced_at) mirrors every synced record; last-write-wins on `updatedAt`, deletes via `deletedAt`. See `supabase/schema.sql` and `src/sync/` |

## Later (designed for, not built)

| Feature | How it fits |
| --- | --- |
| Coach mode | `athletes` table (id, name, coachId, status); every lifter-owned record already has `athleteId`. `coachLinks` (coachId, athleteId, permissions, status) and `messages` (id, threadId, fromId, body, at) live in the cloud only |
| Wearables / Apple Health | `bodyMetrics` and `checkins` gain a `source` field; HRV/sleep go in `bodyMetrics` with new types |
| AI program generator | Writes ordinary `programs`/`programDays`/`plannedExercises`; questionnaire answers kept in `programs.meta` (goal, days, sport, season) |
