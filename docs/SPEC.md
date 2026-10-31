# Workout Tracker App — Full Feature Spec

Oct 31, 2026 · @Freddie

## Overview

A standalone strength-first training app that logs faster than pen and paper, programs itself from your data, and doubles as a coaching tool for your PT clients. It covers everything the top paid apps charge for (Strong Pro, Hevy Pro, Boostcamp, RP Hypertrophy, JuggernautAI, TrainHeroic, Trainerize), in one place.

**Who it's for**

- Lifters: powerlifters, bodybuilders, hybrid athletes, rugby/field-sport players doing S&C
- Coaches: you, managing in-person and remote clients from one app

**Design principles**

- **Log a set in under 2 seconds.** Prefilled weights, one tap to confirm, big targets usable with chalky hands.
- **Offline-first.** Gyms have bad signal; everything works without internet and syncs later.
- **Your data is yours.** Full export (CSV/JSON) at any time, on the free tier too.
- **Smart, not preachy.** Suggestions are explained ("+2.5 kg because last RPE was 7") and always overridable.
- **Dark mode by default**, one-handed use, no clutter during a session.

## Core logging

The session screen is the heart of the app; if logging is slow, nothing else matters.

**Session flow**

- Start from a program day, a template, a repeat of a past session, or empty
- Previous performance shown inline next to every set ("Last: 140 kg × 5 @ RPE 8")
- Weight/reps prefilled from the plan or last session; tap tick to confirm
- Reorder, swap or add exercises mid-session; swap suggests equivalents (same pattern/muscle/equipment)
- Notes per set, per exercise and per session (pinned notes carry over, e.g. "belt on 3rd notch")
- Session summary on finish: volume, PRs hit, duration, comparison to last time
- Crash-proof: an in-progress session survives app close, phone restart or battery death

**Set data captured**

| Field | Notes |
| --- | --- |
| Weight | kg/lb per user, per-exercise override; supports plates, bodyweight +/-, assistance |
| Reps | Plus partials and failed reps |
| RPE / RIR | 6–10 in 0.5 steps, or RIR 0–5 |
| Tempo | e.g. 3-1-X-0 |
| Time / distance | For carries, sleds, conditioning, cardio |
| Bar speed | Manual entry or from a VBT device (m/s) |
| Side | Left/right for unilateral work |

**Set types**

- Warm-up (excluded from volume and PRs), working, top set, back-off, AMRAP
- Drop sets, rest-pause, myo-reps, cluster sets, failure sets
- Supersets, giant sets and circuits with automatic exercise cycling
- EMOM, AMRAP-for-time and interval blocks for conditioning

**Timers and tools**

- Auto rest timer per exercise (e.g. 3–5 min compounds, 90 s accessories), with lock-screen and watch notifications
- Session stopwatch, EMOM/Tabata/interval timer
- Warm-up set generator from your working weight (e.g. bar, 40%, 60%, 80%, 90%)
- Plate calculator for your gym's actual plates, including change plates and collars
- 1RM, %1RM and RPE chart calculators built into the set row
- Video recording/attachment per set for technique checks

## Exercise library

Ship with 400+ exercises, each tagged richly enough to power swaps, analytics and muscle maps.

- **Tags per exercise:** primary and secondary muscles (with % contribution), movement pattern (squat, hinge, push, pull, carry, lunge), equipment, unilateral/bilateral, compound/isolation, difficulty
- **Media:** demo video or animation, form cues, common mistakes, setup notes
- **Variations linked to parents:** paused squat, SSB squat and box squat roll up to "squat" for strength trends
- **Custom exercises** with the same tags, plus user's own demo clips
- **Gym profiles:** list the equipment at each gym (home, commercial, client's garage); the app hides or swaps exercises that aren't available
- **Search and filters** by muscle, equipment, pattern; recent and favourite exercises at the top

## Programs, templates and auto-progression

This is where paid apps make their money: the app decides what you lift next, not just records what you lifted.

**Program builder**

- Templates (single sessions) and programs (weeks × days, with phases/blocks)
- Prescribe by fixed load, %1RM, %training max, RPE/RIR target, or rep range
- Periodisation models: linear, double progression, undulating (DUP), block (accumulation → intensification → realisation → peak)
- Scheduled and automatic deloads (every N weeks, or triggered by fatigue/readiness)
- Flexible scheduling: miss a day and the program shifts rather than breaks
- Built-in library of proven programs (5/3/1-style, PPL, upper/lower, full body, powerlifting peaks, in-season S&C) written as your own originals

**Auto-progression engines** (pick per exercise)

| Engine | How it works |
| --- | --- |
| Linear | Add fixed load each session when all reps hit; reset 10% after 2–3 fails |
| Double progression | Climb reps to top of range, then add load and drop to bottom |
| RPE-based (autoregulated) | Next load from today's e1RM and target RPE using an RPE chart |
| Training max | Percentages off a TM that rises after each cycle / AMRAP result |
| Volume-driven (hypertrophy) | Sets per muscle adjusted weekly from pump, soreness and performance feedback |
| Velocity-based | Load set to hit a target bar speed; stop sets at a velocity-loss cutoff |

**AI coach / smart programming**

- Generate a full program from a questionnaire: goal, days available, session length, equipment, injuries, sport and season
- Weekly check-in adjusts volume and intensity from performance trend, readiness and feedback
- Plateau detection: flags a lift that has stalled for 3+ weeks and suggests a variation or rep-range change
- Meet/competition peaking: count back from a date, taper volume, plan attempts
- Rugby/sport mode: in-season vs off-season volume, match-day aware scheduling (lighter sessions after match days)

## Analytics and progress tracking

Answer three questions at a glance: am I getting stronger, am I doing enough, am I recovering.

**Strength**

- Estimated 1RM per lift over time (Epley/Brzycki, or RPE-adjusted), with trend line and rate of gain
- Rep-max table: best 1RM–12RM ever and this block
- PR tracking: weight, reps, e1RM, volume and rep PRs, with celebration and history
- Powerlifting total, Wilks, DOTS and IPF GL points, with bodyweight-class context
- Strength standards: how each lift compares by bodyweight, age and sex (beginner → elite)
- Relative strength (×bodyweight) for field-sport athletes

**Volume and load**

- Weekly hard sets per muscle group vs target ranges (MEV/MAV/MRV style), shown on a body heatmap
- Tonnage per session, week, lift and muscle
- Intensity distribution: % of sets in each RPE or %1RM zone
- Training load and acute:chronic workload ratio, with injury-risk flag when it spikes
- Frequency: sessions per week, per muscle, streaks and consistency calendar

**Reports**

- Weekly and monthly recaps (push notification + shareable card)
- Block comparison: this block vs last on every key lift
- Custom dashboards: pick charts, lifts and date ranges
- Year in review

## Body tracking, nutrition and recovery

**Body tracking**

- Bodyweight with 7-day moving average (daily weigh-ins are noisy)
- Tape measurements: chest, waist, hips, arms, thighs, calves, neck
- Body-fat estimates (manual, smart-scale import, or Navy formula)
- Progress photos with pose guides, side-by-side compare and timelapse; stored privately

**Nutrition hooks** (integrate rather than rebuild a food database)

- Pull calories, protein, carbs and fats from MyFitnessPal / Cronometer / Apple Health / Health Connect
- Daily targets with simple adherence view; protein per kg bodyweight
- Weight-change rate vs goal (cut/bulk/maintain) with suggested target tweaks

**Recovery and readiness**

- Pre-session check-in: sleep, soreness, stress, motivation (1–5 each)
- Wearable data: HRV, resting HR, sleep duration from Apple Watch, Garmin, Whoop, Oura
- Readiness score that can auto-scale today's session (e.g. drop a set or cap RPE at 7)
- Post-session feedback: pump, joint pain, session RPE (feeds training load and volume engine)
- Injury/pain log by body area, with exercise flags so painful movements get swapped

## Coach mode

The feature that turns this from a personal tool into a business asset: manage every client from the same app (what Trainerize and TrainHeroic charge coaches £20–£100+/month for).

- **Client roster** with status, last session, adherence %, and alerts (missed sessions, pain flagged, PRs)
- **Assign programs** from your library, then tweak per client; push updates live
- **Log for the client** during in-person sessions on your phone, or let them log themselves
- **Review feed:** see each client's sessions, form videos and notes; comment on a set
- **In-app messaging** and voice notes, with check-in forms (weekly questionnaire, photos, bodyweight)
- **Assessments:** baseline tests (1RMs, mobility, jumps, conditioning) and retest comparisons
- **Client-facing progress reports** you can send as a branded PDF
- **Business tools:** session packages and credits, booking calendar, payments (Stripe), renewal reminders
- **Branding:** your logo and colours in the client's app (white-label)
- **Privacy:** clients control what coaches see; coach access revocable at any time

## Social, gamification, integrations and data

**Social and motivation**

- Follow friends, activity feed, likes/comments on sessions and PRs
- Share cards for PRs and session summaries (Instagram story-ready)
- Leaderboards by lift, relative strength or consistency, with gym/club groups (e.g. your rugby squad)
- Challenges: monthly volume, streaks, team challenges
- Achievements and badges (first 200 kg deadlift, 100 sessions, 12-week streak)

**Devices and integrations**

- Apple Watch / Wear OS companion: log sets, rest timer, heart rate, without the phone
- Apple Health and Google Health Connect: write workouts, read bodyweight, sleep, HRV
- Garmin, Whoop, Oura, Strava for cardio and recovery data
- VBT devices (e.g. bar-speed sensors) via Bluetooth
- Home-screen and lock-screen widgets (next session, streak, rest timer)
- Siri/Google Assistant shortcuts ("start push day")

**Data and account**

- Offline-first local database with cloud sync across phone, tablet and watch
- Import from Strong, Hevy, FitNotes and spreadsheets (CSV)
- Export everything as CSV/JSON; automatic backups
- Units, plate sets, bar weights and first day of week configurable
- Account deletion that actually deletes; GDPR-compliant data handling (you're UK-based)

## Gamified visual: the Lifter Profile

A game-style home screen that turns your real training data into a character you level up, so progress is visible every time you open the app.

**The anatomy avatar**

- Front/back body figure split into muscle groups (chest, back, quads, hamstrings, glutes, shoulders, arms, core, calves)
- Each muscle has its own level (1–50) earned from hard sets and strength gains on exercises that hit it, weighted by the % contribution tags
- Colour shows level tier (grey → bronze → silver → gold → platinum → diamond); a soft glow pulses on muscles trained in the last 48 hours
- Muscles not trained for 10+ days fade slightly, nudging balance without nagging
- Tap a muscle to see its level, XP to next level, top lifts and weekly sets vs target

**XP and levels**

| Action | XP |
| --- | --- |
| Completed working set | 10 |
| Set at RPE 8+ | +5 bonus |
| Session completed | 50 |
| New rep or e1RM PR | 100 |
| Weekly sessions target hit | 150 |
| Program block completed | 500 |

- Overall Lifter Level from total XP, with a rising XP bar after every set
- Titles that unlock with level (Rookie, Grinder, Iron Regular, Plate Loader, Barbell Veteran, Strength Athlete)

**Lift ranks**

- Each main lift gets a rank badge from your e1RM relative to bodyweight (Bronze I → Diamond, then "Elite")
- Progress ring shows how close you are to the next rank, in kg ("7.5 kg to Gold II")
- Rank-up animation and share card when you cross a threshold

**Streaks, quests and boss fights**

- Weekly streak flame (weeks hitting your session target, so rest days never break it)
- Daily/weekly quests: "Hit 12 back sets this week", "Log a top set at RPE 9"
- Boss fights: a named target lift (e.g. "The 200 kg Deadlift") with a health bar that drops as your e1RM closes the gap; beating it unlocks a badge
- Trophy cabinet for badges and defeated bosses

**Fun but honest:** XP only rewards real work (no XP for junk sets or editing old sessions), and the whole layer can be switched off for a plain view.

## Free vs paid features

If you ever sell it, keep logging generous and charge for intelligence and coaching. This split mirrors how the market leaders gate features (prices change, so check before setting yours).

| Feature | Free | Pro (lifter) | Coach |
| --- | --- | --- | --- |
| Unlimited logging, timers, plate calc | Yes | Yes | Yes |
| Templates | Up to 4 | Unlimited | Unlimited |
| History and PRs | Full | Full | Full |
| Basic charts (e1RM, volume) | Last 3 months | All-time + custom dashboards | All-time |
| Advanced set types, RPE/tempo/VBT fields | Basic only | Yes | Yes |
| Muscle heatmap, weekly sets vs targets | No | Yes | Yes |
| Auto-progression engines | Linear only | All | All |
| AI program generator and weekly adjustments | No | Yes | Yes |
| Readiness score and wearable sync | Manual check-in | Full | Full |
| Progress photos and measurements | Yes | Yes + timelapse | Yes |
| Watch app and widgets | Widgets | Yes | Yes |
| Program library | 3 programs | Full | Full + sell your own |
| Client management, messaging, payments | No | No | Yes |
| White-label branding | No | No | Yes |
| Data export | Yes | Yes | Yes |

Common pricing shapes: Pro around £5–£10/month or a lifetime unlock; Coach priced per client or in tiers.

## Building it: stack, data model, phases

**Suggested stack** for a standalone phone app built with Claude Code

- **React Native + Expo (TypeScript):** one codebase for iPhone and Android; test on your own phone instantly with Expo Go
- **SQLite on-device** (expo-sqlite with Drizzle ORM) for offline-first storage
- **Supabase** later for accounts, cloud sync and coach/client sharing
- **Charts:** Victory Native or react-native-skia; **payments:** RevenueCat for subscriptions, Stripe for coaching

**Core data model**

| Table | Key fields |
| --- | --- |
| users | id, name, units, bodyweight, gym\_profile\_id, role (lifter/coach) |
| exercises | id, name, parent\_id, pattern, equipment, muscles (with %), is\_custom |
| programs | id, owner\_id, name, weeks, progression\_rules |
| program\_days | id, program\_id, week, day, order |
| planned\_exercises | id, program\_day\_id, exercise\_id, sets, rep\_target, load\_rule (%1RM / RPE / fixed), engine |
| sessions | id, user\_id, program\_day\_id, started\_at, ended\_at, readiness, notes, session\_rpe |
| sets | id, session\_id, exercise\_id, order, type, weight, reps, rpe, tempo, velocity, side, completed |
| body\_metrics | id, user\_id, date, type (weight / waist / photo), value |
| coach\_links | coach\_id, client\_id, permissions, status |

**Build order**

1. **MVP logger:** exercise library, empty session, sets with weight/reps/RPE, rest timer, history list
2. **Templates and previous-performance:** save/repeat sessions, show last numbers inline, plate and warm-up calculators
3. **Analytics v1:** e1RM charts, PRs, weekly sets per muscle
4. **Programs:** multi-week builder, %1RM/RPE prescriptions, linear and double progression
5. **Body and readiness:** bodyweight trend, measurements, photos, pre-session check-in
6. **Sync and accounts:** Supabase auth, cloud backup, import/export
7. **Coach mode:** client roster, assign programs, view client logs, messaging
8. **Advanced:** RPE/volume/VBT engines, AI program generator, wearables, watch app, social

Phases 1–3 alone give you an app you'd actually use in the gym; that's the right first Claude Code project.

## Claude Code prompt

Paste this into Claude Code from inside your repo folder. It tells Claude Code to read your existing app first, keep what works (weight tracking, progress chart, last-weight-used), and upgrade in phases you approve one at a time.

```markdown
I'm a personal trainer and competitive powerlifter. This repo is my live workout tracker. It currently:
- logs weight lifted per exercise
- shows a progress chart
- shows the last weight I used on each exercise

I want to turn it into an advanced, gamified strength-training app. Do NOT break or remove the existing features or my existing logged data.

## Step 1: Understand before changing
1. Explore the repo: framework, file structure, how data is stored, how it's deployed.
2. Summarise what you found in a short report.
3. Propose a phased plan based on the phases below, adapted to my current stack. If a change of stack or storage is needed, explain why and include a migration that keeps my existing data.
4. Wait for my approval before writing code.

## Working rules
- One phase at a time. After each phase: run it, test it, commit with a clear message, and tell me what to check on my phone.
- Keep the UI fast for gym use: big tap targets, dark mode, logging a set in under 2 seconds, works offline.
- Write a data migration whenever the schema changes; never lose logged sessions.
- Use kg by default with a kg/lb setting.
- Add tests for calculations (e1RM, XP, progression, plate maths).
- Keep a CHANGELOG.md and update the README with features and how to run it.

## Phase 1: Better logging
- Sessions containing exercises containing sets
- Set fields: weight, reps, RPE (6-10 in 0.5 steps), optional tempo and notes
- Set types: warm-up (excluded from PRs/volume), working, top set, back-off, AMRAP, drop set, failure
- Supersets/circuits
- Prefill weight/reps from last session and show "Last: 140 kg x 5 @ RPE 8" inline (extend my existing last-weight feature)
- Auto rest timer per exercise with notification
- Plate calculator (configurable plates and bar) and warm-up set generator
- In-progress session survives the app closing

## Phase 2: Exercise library
- Seed library of common exercises tagged with primary/secondary muscles (with % contribution), movement pattern, equipment, compound/isolation
- Variations linked to a parent lift (paused squat -> squat)
- Custom exercises, search and filters, favourites

## Phase 3: Analytics (extend my existing progress chart)
- Estimated 1RM over time per lift (Epley, and RPE-adjusted when RPE is logged)
- PR tracking: weight, rep, e1RM and volume PRs with a celebration moment
- Rep-max table (best 1RM-12RM)
- Weekly hard sets per muscle vs target ranges
- Tonnage per session/week, consistency calendar
- Powerlifting total plus DOTS and Wilks
- Weekly recap screen

## Phase 4: Templates and programs with auto-progression
- Save and repeat templates; multi-week programs (weeks x days)
- Prescribe by fixed load, %1RM, or RPE target
- Progression engines per exercise: linear, double progression, RPE-based (next load from e1RM + target RPE)
- Scheduled deloads; missed days shift the program instead of breaking it
- Plateau detection: flag a lift stalled 3+ weeks and suggest a fix
- Always explain suggestions ("+2.5 kg because last RPE was 7") and let me override

## Phase 5: Body and readiness
- Bodyweight log with 7-day moving average
- Measurements and private progress photos with side-by-side compare
- Pre-session check-in (sleep, soreness, stress, motivation 1-5) giving a readiness score that can suggest lighter loads
- Post-session session RPE and pain/injury log by body area

## Phase 6: Gamified Lifter Profile (make this look great)
- Home screen with a front/back anatomy avatar split into muscle groups (SVG)
- Each muscle has its own level (1-50) from hard sets and strength gains, weighted by the exercise muscle %
- Colour by tier: grey, bronze, silver, gold, platinum, diamond; glow on muscles trained in the last 48h; slight fade if untrained 10+ days
- Tap a muscle: level, XP to next, top lifts, weekly sets vs target
- XP: 10 per working set, +5 at RPE 8+, 50 per session, 100 per PR, 150 for hitting the weekly session target, 500 per finished program block
- Overall Lifter Level with an XP bar that animates after each set, plus titles (Rookie, Grinder, Iron Regular, Plate Loader, Barbell Veteran, Strength Athlete)
- Lift ranks per main lift from e1RM relative to bodyweight (Bronze I to Diamond, then Elite) with a ring showing kg to next rank, and a rank-up animation
- Weekly streak flame (weeks hitting my session target; rest days never break it)
- Weekly quests and "boss fights": a named target lift with a health bar that shrinks as my e1RM closes in
- Trophy cabinet for badges; shareable PR/rank-up cards
- XP only for real work (no XP for editing old sessions); a setting to turn the game layer off
- Back-fill XP and levels from my existing history

## Phase 7: Sync, import/export
- Export all data to CSV/JSON; import from CSV (Strong/Hevy format)
- Optional accounts and cloud sync with offline-first local storage

## Later (plan the data model for these now, build later)
- Coach mode: client roster, assign programs, log for a client, view their sessions, messaging
- Wearable/Apple Health/Health Connect sync, watch app, home-screen widgets
- AI program generator from a goal questionnaire, including a rugby in-season/off-season mode

Start with Step 1 now.
```

Tip: keep this doc open beside Claude Code. When it finishes a phase, test it in the gym before approving the next.
