# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About the user
The owner is new to coding. Explain changes in plain language, don't add tooling or frameworks unless they ask, and tell them exactly how to see a change. They use the app as a PWA on an **iPhone** (installed from Safari via Add to Home Screen), so check changes at phone width.

## Commands
- `npm run dev`: dev server with auto-reload at http://localhost:5173 (also in `.claude/launch.json` as `dev` for the browser pane)
- `npm run build`: production build into `dist/` (set `BASE_PATH=/workout-tracker/` to match GitHub Pages)
- `npm run preview`: serve the built `dist/`
- `npm run icons`: regenerate the PNG icons in `public/` from `public/icon.svg` (config in `pwa-assets.config.js`)

There is no test suite or linter. Node/npm were installed with winget. If `npm` isn't found in the shell, refresh PATH from the Machine and User environment variables, and call `npm.cmd` from PowerShell.

## Architecture
- Vite + plain JavaScript (ES modules, no framework). `index.html` is the shell (header, four `<section class="view">`s, bottom tab bar, settings `<dialog>`), and it loads `src/main.js`.
- `src/storage.js` exports `Store` and is the only code that touches localStorage. Everything lives under one key, `workoutTracker.v1` (the key name is fixed; the schema version is stored inside), shaped `{ version, settings: { unit }, draft, workouts[], templates[] }`. A workout is `{ id, date: "YYYY-MM-DD", templateId|null, notes, exercises: [{ name, sets: [{ reps, weight }] }] }`.
- To change the data shape, bump `VERSION` and add a step to `migrate()`. Never drop user data, since it exists only on their phone.
- `src/main.js` has one section per view (Log, History, Progress, Templates) plus Settings. Each view has a `render*()` that rebuilds its `innerHTML`. Clicks are handled by one delegated listener per view, keyed off `data-*` attributes. Escape user text with `esc()`.
- Log keeps an in-progress `draft` that is saved to storage on every keystroke, because iOS kills backgrounded PWAs. Typing updates the draft without re-rendering, so focus isn't lost. Only structural changes call `renderLog()`. Starting from a template pre-fills sets from `Store.lastSets()`.
- Exercise names match case-insensitively everywhere (Progress, last-time hints, autocomplete). Weight units are a label only; values are never converted.
- Colors are CSS variables in `src/styles.css`, with dark-mode overrides. The chart reads them at render time and re-renders when the color scheme changes. Layout uses `env(safe-area-inset-*)` for the iPhone notch and home bar.
- PWA: `vite-plugin-pwa` in `vite.config.js` generates the manifest and a Workbox service worker (`autoUpdate`) that precaches the build, so the app works offline. `base` comes from `BASE_PATH`.
- Deploy: `.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main` (repo: github.com/freddiept1/workout-tracker, live at https://freddiept1.github.io/workout-tracker/). The repo's Settings → Pages → Source must be "GitHub Actions", or the `configure-pages` step fails. Git credentials are saved by Git Credential Manager, so `git push` works from the shell. If they ever expire, the push fails with "terminal prompts disabled"; push once from a Terminal tab so the browser sign-in can appear.

## Testing notes
- The built-in browser pane can't register service workers, so offline/PWA behavior can't be checked there. Use headless Edge driven by `puppeteer-core`, installed in a scratch folder outside the repo, against `npm run preview`.
- The pane is often short. For phone-size screenshots, use puppeteer with a 390×844 viewport. Headless Edge's `--screenshot` with `--window-size` enforces a minimum width of about 500px, so its crops look cut off.
