# Data model

Storage is IndexedDB (via Dexie), on the device. Weights are always stored in **kilograms**; the kg/lb setting only changes display and input.

Every record has `id`, `createdAt`, `updatedAt` and `deletedAt` (soft delete), so cloud sync can merge changes later. Records that belong to a lifter also have `athleteId` (`"me"` for now), so coach mode can store clients' data alongside yours.

Types live in `src/db/types.ts`, tables and indexes in `src/db/db.ts`.

## Built (Phase 0)

| Table | Key fields | Notes |
| --- | --- | --- |
| `exercises` | id (slug of name, e.g. `bench-press`), name, isCustom, parentId, muscles[{muscle, pct}], pattern, equipment, mechanic, favourite | Tag fields are filled by the Phase 2 library. Slug ids let the library match exercises migrated from old data |
| `sessions` | id, athleteId, date, startedAt, endedAt, templateId, programDayId, notes, sessionRpe, source (live/migrated/imported), exercises[], exerciseIds[] | Exercises and sets are nested inside the session (one record per workout), so a session is saved atomically. `exerciseIds` is a multi-entry index for "last time" lookups |
| ↳ session exercise | id, exerciseId, supersetGroup, restSec, notes, sets[] | |
| ↳ set | id, type (warmup/working/top/backoff/amrap/drop/failure), weightKg, reps, rpe, tempo, notes, completedAt | `completedAt` is set only when ticked off live. History migrated from the old app has `null` here, which is how XP will tell live work from back-filled history |
| `templates` | id, athleteId, name, order, exercises[{exerciseId}] | |
| `meta` | key → value | `settings` ({unit}), `draft` (the in-progress workout exactly as typed), `migration` (when/what was migrated) |

## Planned

| Phase | Table | Key fields |
| --- | --- | --- |
| 1 | (fields on sets/session exercises) | rpe, tempo, notes, set types, supersetGroup, restSec, per-exercise rest default |
| 1 | `meta.equipment` | bar weight, available plates (kg/lb), collars |
| 2 | `exercises` (seeded) | ~150 tagged exercises; `favourite`, `parentId` for variations |
| 3 | (derived, not stored) | e1RM, PRs, rep-maxes, weekly sets per muscle are computed from sessions |
| 3 | `prs` | id, athleteId, exerciseId, kind (weight/reps/e1rm/volume), value, sessionId, setId, achievedAt; recorded so celebrations fire once |
| 4 | `programs` | id, athleteId/ownerId, name, weeks, phases, deloadEvery, status |
| 4 | `programDays` | id, programId, week, day, order, scheduledDate, completedSessionId |
| 4 | `plannedExercises` | id, programDayId, exerciseId, sets, repTarget, loadRule {type: fixed/pct1rm/rpe, value}, engine (linear/double/rpe), increments |
| 5 | `bodyMetrics` | id, athleteId, date, type (bodyweight/waist/chest/...), value |
| 5 | `photos` | id, athleteId, date, pose, blob (stored as a Blob in IndexedDB, never uploaded unless sync is on) |
| 5 | `checkins` | id, athleteId, date, sessionId, sleep, soreness, stress, motivation, readiness |
| 5 | `painLog` | id, athleteId, date, area, severity, exerciseId, notes |
| 6 | `xpEvents` | id, athleteId, at, kind (set/rpe-bonus/session/pr/weekly-target/block), xp, sessionId, setId, muscles[{muscle, xp}]. A ledger: XP is written when work is logged live, back-filled once from history, and never written by edits |
| 6 | `achievements` | id, athleteId, badgeId, earnedAt, data |
| 6 | `quests`, `bosses` | id, athleteId, kind, target, progress, startsAt, endsAt, status |
| 6 | `meta.profile` | sex, bodyweight, weekly session target, game layer on/off |
| 7 | (sync) | Supabase mirror of the tables above, keyed by id; last-write-wins on `updatedAt`, deletes via `deletedAt` |

## Later (designed for, not built)

| Feature | How it fits |
| --- | --- |
| Coach mode | `athletes` table (id, name, coachId, status); every lifter-owned record already has `athleteId`. `coachLinks` (coachId, athleteId, permissions, status) and `messages` (id, threadId, fromId, body, at) live in the cloud only |
| Wearables / Apple Health | `bodyMetrics` and `checkins` gain a `source` field; HRV/sleep go in `bodyMetrics` with new types |
| AI program generator | Writes ordinary `programs`/`programDays`/`plannedExercises`; questionnaire answers kept in `programs.meta` (goal, days, sport, season) |
