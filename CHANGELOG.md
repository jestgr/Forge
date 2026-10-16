# Changelog

## 2026-10-14 — Add CLAUDE.md and CHANGELOG.md
- Branch: `chore/claude-md`
- Added project rules for Claude Code (branch-only commits, merge to main only on request, log changes here).
- Rollback: `git revert <commit>` (or delete the branch if not merged: `git branch -D chore/claude-md`)

## 2026-10-14 — Make Forge build and run locally (branch `fix/local-dev`)
- `22ce1ca` Restore `/src/main.tsx` entry in `index.html` (upload had replaced it with built-asset links, breaking dev/build). Rollback: `git revert 22ce1ca`
- `7f4f27f` Server port reads `PORT` env (default 3000; use e.g. `PORT=3010` here since Karakeep owns 3000). Rollback: `git revert 7f4f27f`
- `926c72f` Gemini calls (workout generator + AI Coach advice) moved to server routes `/api/ai/workout` and `/api/ai/advice`; key no longer bundled into browser JS. Rollback: `git revert 926c72f`
- Host change (not in git): installed Debian `nodejs` 20.19 + `npm` 9.2 on LXC 100. Rollback: `apt remove nodejs npm`

## 2026-10-14 — Prepare Cloud Run deploy (branch `feat/cloud-run`)
- `8519b6c` Add `Dockerfile`, `.dockerignore`, `.gcloudignore`; service worker now network-first (cache `forge-cache-v2`, old caches deleted) so updates reach the phone. Tested locally: built image, ran on port 3010, removed image afterwards. Rollback: `git revert 8519b6c`

## 2026-10-14 — Switch to GitHub Pages deploy (branch `feat/github-pages`, from `feat/cloud-run`)
- `fb996f2` Static Vite app published by GitHub Actions to https://jestgr.github.io/Forge/ on merge to `main`. Google Fit and AI Coach switched off (`FIT_ENABLED`/`AI_ENABLED` in `src/App.tsx`); `server.ts`, Dockerfile and server deps removed (still on `feat/cloud-run`). Manifest/SW paths made relative for the `/Forge/` sub-path. `.env.example` removed. Tested: lint + build pass; built site served under `/Forge/` returns 200 for page, SW, manifest, JS, CSS. Not yet tested in a phone browser. Rollback: `git revert fb996f2`
- Cloud Run plan dropped in favour of GitHub Pages; `feat/cloud-run` kept for reference.

## 2026-10-16 — Rework phase 0: brief, plan, decisions (branch `rework`)
- Added `docs/REWORK.md` (Jeff's brief, watch corrected to Garmin Venu 2), `docs/PLAN.md` (review of current app, conflicts, architecture, data model, migration, phases, tests), `docs/DECISIONS.md`.
- `.gitignore`: also ignore `forge-backup*.json` and `*backup*.json` (personal data).
- Docs only; no app change, no SW bump needed.
- Rollback: `git revert <this commit>` (or, before merge, `git branch -D rework`)

## 2026-10-16 — Rework phase 1: plain-JS app shell + preview deploy (branch `rework`)
- Removed the React/Vite/Tailwind app (`src/`, `public/`, `index.html`, `vite.config.ts`, `metadata.json`) and its packages; dev tools left: TypeScript (type-check only) + `node --test`.
- New `app/` folder (published as-is): dark theme, bottom nav (Today / Library / History / Settings), IndexedDB layer (`forge`, or `forge-preview` for the test copy), in-memory store, offline-first service worker with "Update ready" banner (takes over from the old app's worker on first open), own icons, manifest keeps the old install id.
- Deploy workflow now publishes `main` at `/Forge/` and `rework` at `/Forge/preview/` (preview has its own install name "Forge Preview").
- README and CLAUDE.md updated for the new setup. SW cache: `forge-v4`.
- Tested: `npm run check` (lint + 3 tests) pass; workflow assemble step simulated locally on a clone (old main builds as before, preview copied + renamed); all preview files served with correct types. Not yet opened in a phone browser.
- Phone check: open https://jestgr.github.io/Forge/preview/ → PREVIEW ribbon, 4 tabs, Settings shows version `forge-v4`; install it; turn on airplane mode and reopen → still works.
- Rollback: `git revert <this commit>`
