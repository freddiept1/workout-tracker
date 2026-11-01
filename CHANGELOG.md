# Changelog

All notable changes to the Workout Tracker. Newest first.

## Warm-ups (2026-11-01)

### Added
- **Warm-up drills:** a new exercise type that's simply ticked off against a target ("2 × 20 m", "10 each side").
  - No weights or reps to enter, and no rest timer.
  - Never counted towards PRs, volume, hard sets or progress charts.
  - Drills you didn't tick are just left out when you finish, without a question.
- **50 drills in the library** (Exercises → Warm-ups):
  - Pulse raisers: easy bike/row, jump rope.
  - Mobility: leg swings, 90/90s, World's Greatest Stretch, ankle mobility, couch stretch, pass-throughs…
  - Activation: band pull-aparts, face pulls, external rotations, glute bridges, lateral walks, dead bugs…
  - Athletic: A/B-skips, high knees, butt kicks, carioca, shuffles, wall drill, strides…
- **In a workout,** drills group into one **Warm-up** checklist card at the top, with an "x/y done" count. Tap a row to tick it.
- **"+ Add warm-up"** in any workout drops in a warm-up template. Drills added from "+ Add exercise" also go to the warm-up at the top.
- **Example warm-up templates** (Plan → Templates → "+ Add example warm-ups"): Lower Body, Upper Body and Sprint. Edit them like any template, or put drills straight into your own templates and program days.
- History shows "✓ Warm-up" and which drills you did, separate from your training.
- Each drill's target can be edited in the Exercises tab, and per program day in the program editor.

## New look (2026-11-01)

### Added
- **Freddie Butler branding:**
  - The FB monogram is the home-screen icon (on charcoal) and sits in the top bar.
  - The Log tab opens with the full "FREDDIE BUTLER · PERSONAL TRAINING" logo.
  - The app is now called "Freddie Butler Training" ("FB Training" under the icon).
- **Dark theme by default,** in charcoal and forest green, with a **Light** theme (the logo's off-white) and **Match phone** in Settings → Theme.
- **Streak:** consecutive training days, where up to 2 rest days in a row keep it going.
  - The Log tab shows the count, your best, and how many rest days you have left before you need to train.
  - History shows 🔥 next to the workout count, and Progress → Week mentions it.
- **Montserrat** (the logo's typeface) for headings and big numbers. It's bundled, so it works offline.

### Changed
- Orange accents are now forest green throughout. Warnings use amber; PRs stay gold.
- The active tab gets a green pill highlight.

## Phase 4: Programs and auto-progression (2026-11-01)

### Added
- **Programs** (Plan tab → Programs): weeks × days of planned exercises. Each lift gets a method:
  - **Linear:** add weight when every rep is hit. It jumps twice as far if the top RPE was 7 or less, holds at RPE 9.5+, and resets 10% after missing twice in a row.
  - **Double progression:** climb a rep range, then add weight once every set reaches the top.
  - **RPE-based:** the load is worked out from your latest e1RM and a target RPE, using the RPE chart.
  - **% of 1RM:** a percentage per week for waves, of a 1RM you enter or your best estimated 1RM from the last 12 weeks.
  - **Fixed load.**
  - Athletic exercises are planned as sets × reps (and distance) @ effort.
- **Explained suggestions:** in a program workout, every exercise shows its plan and why, e.g. "+2.5 kg: you hit 3 × 5 at 140 kg last time". The weights are pre-filled, so type over them to override.
- **Schedule:**
  - Workouts are done in order, so missing a day never breaks the program; it waits.
  - **Skip** a workout to move on. **Deloads** every N weeks halve the sets and take 10% off.
  - A grid shows what's done, skipped and next.
  - Restart, archive or delete a program. A program finishes itself after its last workout.
- **Example programs** to start from and edit: Linear Strength Base, Powerlifting RPE Block, and Athletic Power.
- Your program's next workout appears on the Log tab, ready to start.
- **Plateau detection:** a lift whose best e1RM is 3+ weeks old, despite at least 3 sessions since, is flagged on the Plan tab and its Progress chart. Fixes are suggested: a specific variation to rotate in, a different rep range, or a deload (sooner if your RPEs have been 9+).
- **Repeat** any past workout, or **save it as a template**, from History.

### Changed
- The Templates tab is now **Plan**, with Programs and Templates inside.
- Backups now include programs (format 5). Older backups still import.
- Database schema version 2 adds a programs table. Existing data is untouched.

## Phase 3: Analytics (2026-11-01)

### Added
- **Progress → Lifts:**
  - **Estimated 1RM** chart for every lift. It uses the RTS RPE chart when you logged RPE, otherwise Epley, and leaves out sets over 12 reps. You can switch to the heaviest set instead.
  - **Include variations** rolls Paused/SSB/Box Squat etc. into the main lift, charted as the best of each week.
  - **Rep maxes:** best 1RM–12RM.
  - That lift's **PR history**.
- **PRs:** heaviest weight, rep PRs (heaviest for that many reps), estimated 1RM and session volume.
  - Worked out from your history, so editing or deleting a workout keeps them right.
  - A lift's first session is its baseline. Athletic work never counts, since it's about effort, not results.
  - Finishing a workout with PRs shows a **celebration**. History shows 🏆 badges on sessions and sets.
- **Progress → Week:** weekly recap with arrows to go back, covering:
  - Sessions, working sets and tonnage vs the week before.
  - PRs, grouped by lift.
  - **Hard sets per muscle group** against a typical range. Sets at RPE 7+ or unrated count; main movers count a full set, helpers half.
  - Athletic volume.
  - A 12-week **tonnage** chart and a 16-week **consistency calendar**.
- **Progress → Total:** best squat, bench and deadlift (actually lifted, and e1RM), the **total**, **DOTS** and **Wilks**, and each lift × bodyweight. Only competition lifts count; partials like block pulls don't.
- **Lifter profile** in Settings (category and bodyweight) for DOTS and Wilks.
- History shows tonnage for each session.

## Phase 2: Exercise library (2026-11-01)

### Added
- **172-exercise library.** Every exercise is tagged with muscles worked (% of the effort), movement pattern, equipment, and compound/isolation:
  - **Powerlifting families** with variations listed under the main lift:
    - Squat: paused, pin, box, tempo, 1¼, Anderson, high/low bar, SSB, beltless, front, Zercher, belt squat…
    - Bench: paused, long-pause, touch-and-go, close/wide grip, Larsen, Spoto, pin, board, floor, tempo, feet-up, slingshot, incline/decline…
    - Deadlift: sumo, deficit, paused, tempo, block/rack pull, snatch-grip, stiff-leg, trap bar, RDL, plus sumo variations…
    - OHP: push press, Z press, seated, paused, behind-the-neck.
  - **Olympic lifts:**
    - Clean, power, hang, hang power, block and muscle clean, clean pull and clean high pull.
    - Clean and jerk; split, push, power and behind-the-neck jerk.
    - Snatch, power, hang, hang power, block and muscle snatch, snatch pull, high pull and balance, overhead squat.
  - Accessories, arms, calves, core, and all the athletic exercises (now with muscle tags).
- **Exercises tab:**
  - Search covers names, nicknames ("cgbp", "rdl", "ohp") and the parent lift, so "bench" finds Spoto Press.
  - Filter by category, muscle and equipment.
  - Star favourites.
  - Edit anything: name, how it's logged, parent lift, muscles %, movement, equipment, rest, default tempo.
  - Add your own exercises.
  - Remove exercises (and restore them later).
  - Merge duplicates, moving all their history across.
- **Tempo** on every lift in the tracker: tap the tempo chip, pick a preset or type your own. It applies to all sets, carries over from last time, and can be saved as the exercise's default. Tempo variations come with one (Tempo Squat 3-1-X-0). History shows the tempo used.
- **Swap for a variation** from an exercise's ⋯ menu (e.g. Squat → Paused Squat mid-workout).
- **Exercise picker:** favourites and recent exercises at the top, variations grouped under their lift, and the same search and categories.

### Changed
- Exercises you'd already logged with a library name (Squat, Bench Press…) picked up the library's tags. Anything you set yourself, and how each exercise is logged, is left alone.
- Typing a renamed exercise's new name in a template now finds it.

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
