# Workout Tracker

A workout log that installs on your iPhone like an app and works offline at the gym.

## Using it on your iPhone
1. Open the app's link in **Safari** (it has to be Safari).
2. Tap the **Share** button, then **Add to Home Screen**.
3. Open it from the new icon. It runs full-screen, like a normal app.

Updates appear automatically the next time you open it with signal.

## What it does
- **Log**: start from a template (Push / Pull / Legs) or a blank workout. Sets are pre-filled with what you did last time, so you only change what's different. "+ Add set" copies the previous set. Your workout in progress is saved as you type, even if you close the app.
- **History**: every workout you've saved, newest first. Tap one to see the details or delete it.
- **Progress**: pick an exercise to see your heaviest set each session, your best, and how much you've gained.
- **Templates**: make your own routines, with one exercise per line.
- **Settings** (gear icon): choose kg or lb, and back up your data.

## Your data
Your workouts are saved on your phone only. They don't go anywhere else, including to the website hosting the app.
- Data on your computer and on your phone is kept separately.
- **Back up now and then:** Settings → **Export** opens the share sheet, so you can save the file to Files or iCloud Drive. **Import** restores a backup, replacing what's in the app.

## Working on it (on the computer)
```
npm install       # first time only
npm run dev       # opens at http://localhost:5173 and refreshes as you edit
```
Pushing to the `main` branch on GitHub publishes the new version automatically.
