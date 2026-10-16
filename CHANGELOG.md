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

## 2026-10-16 — Rework phase 3: exercise library (branch `rework`)
- Library tab: search, filter by category / split / equipment, "Show hidden"; rows show categories, splits and targets. New / edit sheet with multi-select category, split (none = any; Upper = both upper-body days), equipment, logged fields; target sets / reps ("10" or "8-12") / rest / duration; notes; demo link. Built-ins: edit (marked "edited"), revert, hide / unhide; your own: delete (past sessions keep their records).
- Same list is the picker used later by Switch / +ADD (filters preset, removable).
- Tests: 29 pass; lint clean. SW cache `forge-v6`.
- Phone check (preview): search "squat"; filter Lower + Minimal gym; add an exercise, edit it, delete it; hide a built-in, find it under Show hidden, unhide.
- Rollback: `git revert <this commit>`

## 2026-10-16 — Rework phase 4: Begin Next Session, logging, session timer (branch `rework`)
- `core/generator.js`: sections filled by estimated time (Mobility ~10, Posture ~5, Resistance 25–45 unless Pure Cardio, Cardio 20–30 if chosen), not-done-recently first, split + equipment respected, active plan's cardio first. `core/progress.js`: last-10 summary + progression suggestion. `core/clock.js`: total / work / rest / pause from timestamps.
- Start sheet (split, cardio, equipment — remembered / suggested). Session screen: sections with +ADD, Re-roll (resistance), each exercise Switch / Remove / big "Log set"; tap for targets, notes, demo, last 10 times, suggestion. Set logging with big ± steppers pre-filled from last time (+ suggested weight); tap a logged set to edit / delete. Finish shows total / work / rest and what the session earns; Discard.
- Session bar on every tab: total time, WORK / REST countdown, Skip rest, pause / start.
- Tests: 48 pass (generator windows for every split, equipment, Pure Cardio, recency, trimming, determinism; progress; clock). SW cache `forge-v7`. UI not yet run in a browser.
- Phone check (preview): Begin next session → Lower + cardio + Full gym; check sections and times; Switch and +ADD; log 2 sets (rest countdown starts); tap an exercise (history from your migrated data); Finish → toast says what it counted as.
- Rollback: `git revert <this commit>`

## 2026-10-16 — Rework phase 5: 4×4 + fallback runners, cues, screen stays on (branch `rework`)
- Full-screen interval runner (`ui/runner.js`, `core/timeline.js`): huge countdown, auto-advance, 3-2-1 beeps, long beep + buzz on every change, pause / skip / stop; state is saved, so it survives the app being closed (reopen from the "running — open" button).
- Every cardio exercise: "Begin 4×4 protocol" (3' warm-up, 4 × 4' hard / 3' active rest); completion is saved on the exercise (→ HIIT + Zone 2); optional 3' cool-down; restart. Finishing a session settles a still-running 4×4.
- Dashboard: "6-minute fallback" (45 s / 15 s × squats, push-ups, lunges R, lunges L, inchworm, plank), repeat circuit, saved as a Fallback session (counts toward nothing); stopping early saves the moves done.
- Session rest: 3-2-1 beeps and a cue when rest ends. Screen kept on (Wake Lock) during a session or runner. Settings: sound / vibration switches + Test cue.
- Tests: 62 pass, incl. new UI smoke test (boots the real app in a fake browser with old-Forge data, builds a workout, logs / edits sets, switch / add / remove / re-roll, 4×4, finish, fallback, every tab). SW cache `forge-v8`.
- Phone check (preview): Settings → Test cue (sound + buzz); start a session, log a set → 3-2-1 beeps at the end of rest; Begin 4×4 → screen stays on, skip through segments; Dashboard → 6-minute fallback.
- Rollback: `git revert <this commit>`

## 2026-10-16 — Rework phase 6: dashboard goals, history, health data (branch `rework`)
- Today: "This week" (Sun–Sat) tiles Heavy x/2, Zone 2 x/2, HIIT x/1, Steps today (goal 8,000 + days met); split tracker (Lower, Chest/Shoulders, Back/Biceps, Core); fallback count; active plan week; backup reminder after 14 days; recent sessions. Steps & sleep entry (today / yesterday / any day from History).
- History: simple month calendar (dots per session, blue = fallback; tap a day for its sessions + steps/sleep) and session list ("Show more"). Session detail: time, work/rest, exercises + sets, 4×4 result, what it counts as (automatic, or changed by hand + back to automatic), delete.
- `platform/health.js`: health-source interface + manual source. `docs/HEALTH-DATA.md`: Garmin Venu 2 options (recommended next: homelab job → file → Forge import), file format, HR-based activity detection. No source implemented (per brief).
- Tests: 64 pass (smoke test now also covers week tiles, split tracker, steps entry, history detail + credit override). SW cache `forge-v9`.
- Phone check (preview): Today shows your migrated week; tap Steps → enter today's steps; History → older months show your April–September sessions; open one → change "counts as", then back to automatic.
- Rollback: `git revert <this commit>`

## 2026-10-16 — Rework phase 7: polish + real-data run (branch `rework`)
- Phone Back button: always closes the top sheet, also when one sheet closes and another opens right after (e.g. confirm → picker); test added.
- Log-set form never opens empty (falls back to 10 reps / 60 s); default rest for resistance exercises without a target 90 s (D28, D29).
- Real-data run (local only, nothing committed): booted the app with Jeff's real old-Forge backup as old-app storage → 26 sessions, 66 custom exercises brought over; every screen and all 26 session details render; built, logged and saved a workout for every split × a different equipment mode; no errors. `tools/check-migration.mjs` on the same backup: RESULT OK — nothing lost (26/26 sessions, 179/179 entries, 259/259 sets, totals identical).
- Tests: 66 pass. SW cache `forge-v10`.
- Rollback: `git revert <this commit>`

## 2026-10-16 — Fix: commit synthetic test fixture (branch `rework`)
- `.gitignore` rule `*backup*.json` also hid `tests/fixtures/old-backup.json` (made-up data), so GitHub's tests failed. Added `!tests/fixtures/*.json`; fixture committed. No app change.
- Rollback: `git revert <this commit>`

## 2026-10-16 — Session timing per Jeff (branch `rework`)
- Session ≈ 45 min before cardio: Mobility ~10, Posture ~5, Resistance ~30 (25–35; was 25–45). Per exercise: target sets × (duration or ~20 s per untimed set) + rest between sets (exercise's, else 90 s) + 2 min to move to the next exercise. Exercises are only added if they bring a section closer to its aim. Rest timer between sets uses the same 90 s default. (D30)
- Checked: built-ins 46–48 min per split; Jeff's real library (20 tries per split) 41–48 min before cardio; real-data run of every split still error-free. Tests: 67 pass (new: session ≈ 45 min for every split). SW cache `forge-v11`.
- Rollback: `git revert <this commit>`

## 2026-10-16 — Mobility / posture default rest 15 s (branch `rework`)
- Mobility and posture exercises without a rest use 15 s between sets (resistance stays 90 s) (D31). Jeff's real library: 3 mobility + 2 posture + ~5 resistance, 42–50 min before cardio; real-data run of every split error-free. Tests: 67 pass. SW cache `forge-v12`.
- Rollback: `git revert <this commit>`

## 2026-10-16 — One-tap demo videos (branch `rework`)
- Jeff: saved exercise video links weren't easy to open. Now a ▶ video button sits on every Library row and every exercise card in a workout (opens Instagram / YouTube / browser; tapping it doesn't open the card), plus "Watch demo" at the top of the edit sheet and in the exercise sheet. Only http(s) links open; "youtube.com/…" without https:// still works.
- Tests: 68 pass (new: link safety; smoke test taps a library video button). SW cache `forge-v13`.
- Rollback: `git revert <this commit>`

## 2026-10-16 — Garmin Venu 2 plan (branch `rework`, docs only)
- `docs/HEALTH-DATA.md` rewritten as a concrete plan: homelab job (`/root/projects/garmin-sync`, unofficial `python-garminconnect`) → daily JSON file → Forge import; heart-rate activity detection; file format; phases G1–G5 + Health Connect plan B; 5 open decisions. Sources checked 2026-10-16. Nothing built. No app change.
- Rollback: `git revert <this commit>`

## 2026-10-16 — Garmin plan v2 (branch `rework`, docs only)
- Per Jeff: no unofficial Garmin login; Android-side approach. `docs/HEALTH-DATA.md` v2: read Health Connect (Garmin writes there; Google Fit reads there; Google Fit APIs close end of 2026); recommend wrapping Forge as a native APK (Capacitor, built on GitHub Actions) instead of a throw-away helper; steps N1–N4; 4 questions. Nothing built.
- Rollback: `git revert <this commit>`

## 2026-10-16 — Android app prep (N1 part 1) (branch `rework`)
- App code ready for the Capacitor shell: `platform/native.js` (detects the Android app, reaches native plugins); in the app, Backup writes the file and opens the Share sheet (Files / Drive), screen-awake uses the KeepAwake plugin, vibration uses Haptics, no service worker. The web app behaves exactly as before.
- **Host change (outside this repo):** created the APK signing key (PKCS12, alias `forge`, RSA 4096, valid to 2056) and stored it only in `/etc/homelab/secrets.yaml` as `forge_android_key_alias`, `forge_android_keystore_password`, `forge_android_keystore_b64`. Backup of the previous file: `/etc/homelab/secrets.yaml.bak-<timestamp>`. Rollback: restore that backup (`cp -p /etc/homelab/secrets.yaml.bak-<timestamp> /etc/homelab/secrets.yaml`) — only before any APK was signed with the key.
- Tests: 71 pass (new: native paths). SW cache `forge-v14`.
- Rollback (code): `git revert <this commit>`

## 2026-10-16 — Android app build (N1 part 2) (branch `rework`)
- Capacitor 8 Android project (`android/`, app id `com.jestgr.forge`) around `app/`, with plugins: App (Back button), KeepAwake, Haptics, Filesystem, Share. Forge icon + dark splash (`tools/make-android-icons.py`). Release signing + version from environment (`android/app/build.gradle`).
- New workflow `.github/workflows/android.yml`: checks + tests, `cap sync`, signed release APK, signature check, publish to GitHub Release `android-preview` (rework) / `android-latest` (main) as `forge.apk`. Pages workflow now uses Node 22.
- **Host changes (outside this repo):** Node 22.23.3 (official tarball, SHA-256 verified) in `/opt/node22` + wrapper `/usr/local/bin/with-node22`; system Node 20 untouched. Rollback: `rm -rf /opt/node22 /usr/local/bin/with-node22`. GitHub repo secrets `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` set from `secrets.yaml` (values never shown). Rollback: `gh secret delete <name>`.
- Tests: 71 pass. Rollback (code): `git revert <this commit>`; delete the release: `gh release delete android-preview --cleanup-tag`.

## 2026-10-16 — Fix: test command for Node 22 (branch `rework`)
- `npm test` now lists the test files (`tests/*.test.js`); Node 22 no longer accepts a folder there, which failed the GitHub builds. 71 pass on Node 20 and 22.
- Rollback: `git revert <this commit>`

## 2026-10-16 — Fix: Android version number in Gradle (branch `rework`)
- `versionCode` / `versionName` written as assignments (Groovy read the old line as a method call → "Value is null").
- Rollback: `git revert <this commit>`

## 2026-10-16 — Fix: APK signature check (branch `rework`)
- Signature check now uses `keytool -printcert -jarfile` and compares the certificate's SHA-256 fingerprint with the Forge key's (public value, in the workflow).
- Rollback: `git revert <this commit>`
