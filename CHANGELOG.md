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

## 2026-10-16 — Rework phase 2: data model, migration, Backup/Restore (branch `rework`)
- `core/migrate.js`: old Forge data → schema 2 (built-in ids kept, edits/deletions, custom exercises, sessions + sets, steps/sleep/heart points, plan state, unfinished session; sessions left running > 4 h get a repaired end time, original kept). `core/backup.js`: v2 backup files (everything), old backups accepted (merge by id, never duplicates). `core/goals.js`: credit rules (D15–D17, D20). `core/plans.js`: plans as data + plan-file import.
- First launch copies data from the old app's storage (read-only, never deleted); fresh installs get the built-in library + 12-week plan.
- Settings: Back up now, Restore from file, plans (start/stop/start date/import), step goal, reset built-ins, bring over old data again.
- Tests: 29 pass (migration, backup round-trip, goals incl. week edges, plans, service worker). `tools/check-migration.mjs` on Jeff's real backup (14 Oct): 26/26 sessions, 179/179 entries, 259/259 sets, reps, weight volume and seconds identical, 66/66 custom exercises — "nothing lost". SW cache `forge-v5`.
- Phone check (preview): Settings shows your sessions count; Back up now downloads a file; Restore that file → same counts.
- Rollback: `git revert <this commit>`
