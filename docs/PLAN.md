# Forge rework — plan

Status: **approved by Jeff 2026-10-16**; building on `rework`. Brief: [REWORK.md](REWORK.md). Decisions log: [DECISIONS.md](DECISIONS.md).

---

## 1. What exists today (read-only review of `main` @ 40bf60e)

**Stack.** React 19 + Vite + Tailwind + TypeScript, `motion` animations, `recharts`, `lucide-react` icons. ~790 KB JS bundle. Almost everything is in one 3,540-line component (`src/App.tsx`, ~50 `useState`s). No tests.

**Storage.** One localStorage key, `forge_workout_state`, holding: `activeSession`, `customExercises`, `exerciseOverrides` (edits to built-ins), `deletedExerciseIds` (hidden built-ins), `history`, `dailySteps`, `dailySleep`, `dailyHeartPoints` (keyed by `Date.toDateString()`, e.g. "Thu Oct 16 2026"), `activePlanId`, `planStartDate`. No schema version.

**Backup (Export).** Writes only `{history, customExercises, version: "1.0", exportedAt}`. It does **not** include built-in edits/deletions, steps/sleep, or the training-plan state. Import *replaces* history and custom exercises and nothing else.

**Real backup** (`forge_backup_2026-10-14.json`, structure only): 26 sessions (22 Apr – 23 Sep 2026; Lower Body 12, Chest/Shoulders 9, Pure Cardio 3, Back/Biceps 2), 179 exercise entries, 259 sets, 66 custom exercises (49 resistance). Every custom exercise is tagged with all three equipment modes and has no target sets/reps/rest. 3 sessions were left running for 16–64 hours (forgot to finish); 6 lasted under 5 minutes.

**Features.**
| Area | Today |
|---|---|
| Dashboard | 4 tiles: Heavy /2, Zone 2 /2, HIIT /1, Steps (days ≥7k) /7; "Begin Next Session"; "6-Min Fallback"; steps card (shows "/10,000" while goal logic uses 7,000); "Aerobic Engine" (distance, avg HR, made-up "efficiency index"); 28-day heatmap; weekly PR alerts; "Smart Progression" marketing card; "days since intervals" nudge |
| Session builder | Split (5 types) + Include cardio. Equipment mode is a header toggle (desktop only, not remembered). Picks a **fixed count** (4 mobility, 2 posture, 4 or 2 resistance at random, 0–3 cardio), not by time. Recency not considered. |
| Active session | Sections by category with +Add; per exercise Swap / Remove; tap expands trend chart (last 50 sets) + last 5 logs; "Mark set" modal pre-filled with RPE-based suggestion; Re-roll resistance; session timer with pause; count-up auto-rest after a set |
| 4×4 | Button on every cardio card: 3' warm-up, 4×4' hard / 3' rest, plus 3' cool-down. Auto-advances. **No sound, no vibration**, result not saved. |
| Fallback | 45/15 × 6: Squats, Push-ups, Bodyweight Rows, Hinges, Carry, Plank; "repeat?" at the end. **Not saved to history.** |
| Library | Manager: search, filter by category/split, add/edit/delete, built-ins can be edited ("Modified") / hidden and reverted; "Restore defaults". Single category per exercise. Tracking fields: Weight, Reps, Time, Speed, Incline, Distance, HeartRate, RPE. 50 built-ins. |
| History | Sidebar list; calendar (month grid, back max 3 months) with day summary and session detail |
| Plans | One plan: "12-Week VO2 Max Engine" (weeks 1–4 Zone 2, 5–8 hill repeats, 9–12 4×4). When active it injects that cardio into sessions. |
| Switched off | Google Fit sync (steps/sleep/heart points + matching watch workouts), AI Coach |
| Other | Units are lb / mi / mph. Week starts Sunday. Placeholder user "Alex Johnson". App icon hot-linked from flaticon.com (breaks offline). No Wake Lock. Split tracker is just `history.length % 4`. |

## 2. Conflicts between the brief and today's app

| # | Brief | Today | Proposed |
|---|---|---|---|
| C1 | Plain HTML/CSS/JS, no build | React/Vite/TS build | Rewrite as plain ES modules. Keep `typescript` as a **dev-only checker** (JSDoc types, `tsc --checkJs`, no output) and `node --test`. Nothing is compiled; the repo folder is what gets served. |
| C2 | IndexedDB | localStorage | IndexedDB, plus `navigator.storage.persist()` so Chrome won't evict it |
| C3 | Restore migrates exercises, history **and training plan** | Backups don't contain the plan (or built-in edits, steps) | On first launch at the same address the new app **reads** the old `forge_workout_state` (never writes or deletes it), which has everything. Old backup files import too (history + customs). |
| C4 | Steps 8,000/day | 7,000 (and "10,000" text) | 8,000, one setting |
| C5 | Zone 2 = other cardio ≥20 min; HIIT = completed 4×4 | Zone 2 = cardio session ≥45 min; HIIT = Pure Cardio 15–40 min | Brief's rules (see §6, to confirm) |
| C6 | Heavy = resistance split (incl. Core?) | Lower/Chest/Back ≥30 min, Core excluded | Brief's rule; Core counts — **question Q2** |
| C7 | Split tracker one each of 4 | `history.length % 4` | Real per-week tracker |
| C8 | Fallback: squats, push-ups, lunges R, lunges L, inchworm, plank; logged | Different moves; not logged | Brief's moves; logged as "Fallback", counts toward nothing |
| C9 | 4×4: warm-up + 4×4 / 3 rest | Also a 3' cool-down | End after interval 4; offer an optional cool-down timer |
| C10 | Category / split / equipment are multi-select; new split "Upper"; equipment adds "Minimal gym", "Home/Travel" | Single category; no Upper; Full Gym / Travel / Bodyweight | Migrate (see §5) |
| C11 | Sections filled by estimated time | Fixed counts, random | Time-based generator with recency (see §7) |
| C12 | Session asks equipment mode, remembered | Header toggle, not remembered | In the start sheet, remembered |
| C13 | Exercise card: last 10 times + progression | Chart of last 50 sets + last 5 | Concise last-10 list + one-line suggestion; no chart library |

**Not in the brief — defaults (tell me if you disagree):**
- **Keep (confirmed):** simpler history + simple month calendar + session detail; **Re-roll** for resistance; built-in "revert / restore defaults"; RPE and Speed / Incline / Distance / HR fields; pause on the session timer; the **12-week VO2 plan**, stored as data so more plans can be added later (Settings → Import plan file; format in §4).
- **Drop (confirmed):** efficiency index / Aerobic Engine, heatmap, PR alert card, charts. Also dropped: Smart Progression card, library-only export, "Alex Johnson", Google Fit + AI code (still on `feat/cloud-run`).
- Sleep and heart-point numbers from old data are **migrated and kept**; sleep gets manual entry; heart points are only shown in day detail if present.

## 3. Architecture

```
index.html            app shell (one page), loads js/app.js as a module
manifest.webmanifest  PWA manifest, own icons (no hot-links)
sw.js                 service worker: precache every app file, cache-first, versioned
css/app.css           dark theme, design tokens, big touch targets
icons/                app icons (SVG + PNG 192/512, maskable)
js/
  app.js              boot, hash router (#/, #/session, #/library, #/history, #/settings), update banner
  ui/                 one module per screen + small DOM helpers (h(), sheets, toasts)
    dashboard.js session.js start-sheet.js exercise-sheet.js library.js history.js settings.js runner.js
  core/               pure logic, no DOM — this is what the tests cover
    model.js          enums + JSDoc types + constants (goals, 4×4 and fallback scripts)
    builtins.js       built-in exercise library (ids kept: mob_1 … card_v3)
    generator.js      Begin Next Session (time-filled, recency-aware, seeded RNG)
    goals.js          weekly counting + per-session credit
    progress.js       last-10 summary + progression suggestion
    timeline.js       interval scripts → "where am I at time t" (4×4, fallback, rest)
    migrate.js        old backup / old localStorage / v2 → v2 (pure)
    backup.js         export / validate / restore
  platform/
    db.js             IndexedDB wrapper (stores below), one schema version
    wakelock.js       Wake Lock with re-acquire on visibilitychange
    cues.js           WebAudio beeps (no audio files) + navigator.vibrate patterns
    health.js         health-source interface + "manual" source (see §9)
tests/                node --test files + a **synthetic** fixture shaped like an old backup
tools/
  serve.sh            local dev server on :3010 (python3 http.server)
  check-migration.mjs run the migration on a real backup file and print counts only
```

- **Rendering:** plain functions that build DOM for a screen; one store module emits "changed" and the current screen re-renders. Event delegation via `data-action`. No virtual DOM.
- **Timers are wall-clock based:** everything is computed from saved start timestamps, so a phone sleep, app switch or crash never loses time. A 250 ms tick only redraws and fires cues on segment boundaries.
- **Crash-safe session:** the active session is saved to IndexedDB on every change; reopening the app resumes it (timers included).
- **Updates:** a new service worker waits; the app shows "Update ready — tap to reload" and never reloads by itself during a session.
- **Offline:** every file is precached on install; the app makes no network requests except demo-video links you tap.

## 4. Data model (schema 2)

IndexedDB database `forge` (preview build uses `forge-preview`), stores:

```js
exercises  { id, name, categories: Category[], splits: Split[], equipment: Equip[],
             tracking: Field[], targets: { sets, reps /*number|"8-12"|null*/, restSec, durationSec },
             notes, videoUrl, builtIn: bool, modified: bool, deleted: bool, updatedAt }
sessions   { id, kind: 'workout'|'fallback', split, includeCardio, equipment,
             startedAt, endedAt, pausedMs, status: 'active'|'done',
             sections: [{ category, items: [{ id, exerciseId, name /*snapshot*/, targets,
                          sets: [{ at, reps, weight, timeSec, distance, speed, incline, hr, rpe }],
                          protocol: { kind:'4x4', startedAt, completedAt|null, hardDone: 0-4 } | null }] }],
             credit: { heavy, zone2, hiit, split /*Split|null*/ },   // computed at finish
             source: 'forge'|'migrated', legacy?: { …original fields kept verbatim } }
daily      { date: 'YYYY-MM-DD', steps, sleepHours, heartPoints, source: 'manual'|'migrated'|… }
plans      { id, name, description, weeks: [{ week, focus, cardio: [exerciseId…], notes }], builtIn }
settings   { key, value }  // lastSplit, lastCardio, lastEquipment, stepGoal, weekStart,
                           // units, plan: {id, startDate}, lastBackupAt, migratedFrom
```

Enums: Category = resistance | mobility | posture | cardio. Split = lower | upper | chest-shoulders | back-biceps | core | pure-cardio. Equip = home-travel | full-gym | minimal-gym | bodyweight. Field = weight | reps | time | distance | speed | incline | hr | rpe.

**Backup file (v2):** `{ app: "forge", schema: 2, exportedAt, exercises, sessions, daily, settings }` — *everything*, so a restore is complete. Filename `forge_backup_YYYY-MM-DD.json`. The app nudges you to back up if the last export is >14 days old.

## 5. Migration

`migrate.js` accepts three inputs and always outputs schema 2:
1. **Old localStorage** `forge_workout_state` (automatic on first launch, same address) — full data incl. plan, built-in edits/deletions, steps/sleep/heart points, even an unfinished session.
2. **Old backup file** `{history, customExercises, version:"1.0"}` — via Restore.
3. **v2 backup** — validated and restored as-is.

Mapping:
- **Built-ins** keep their ids (`mob_1`, `lb_3`, …) so history still links. Old edits → applied and marked modified; old deletions → `deleted: true` (hidden, restorable).
- **Custom exercises** keep their `custom_…` ids.
- `category` → `[category]` (lower-cased). `targetSplits` "All" → for resistance: all resistance splits; for others: no split restriction. Names map ("Lower Body" → `lower`, …).
- Equipment: Full Gym → `full-gym`; Travel → `home-travel`; Bodyweight → `bodyweight`; anything tagged *both* Full Gym and Travel also gets `minimal-gym`.
- `suggestedSets/Reps/Rest/Duration` → `targets`; missing values stay empty (the generator uses defaults: 3 sets × 10, 60 s rest).
- Tracking fields lower-cased (`HeartRate` → `hr`, `Time` → `time`).
- **Sessions:** `type` → `split`; exercises grouped into sections by category; sets copied (`time` → `timeSec`, `heartRate` → `hr`, `timestamp` → `at`); zero values from the old form become empty. Original fields kept under `legacy` so nothing is lost.
- **Forgotten-to-finish sessions** (end − start > 4 h): `endedAt` becomes last-set time + 5 min; the original end is kept in `legacy`.
- **Credit** for old sessions uses the new rules; 4×4 was never recorded, so old sessions can't earn HIIT (only past weeks are affected).
- Daily maps: "Thu Oct 16 2026" keys → `2026-10-16`.
- Restore of an old backup **merges by id** (re-importing never duplicates). Restore of a v2 backup **replaces** everything after a confirm, and first offers to download a backup of the current data.

**Proof on real data:** `node tools/check-migration.mjs <backup>` prints counts only — sessions, exercise entries, sets, custom exercises, total reps / weight-volume / logged seconds — before and after, and fails if any differ. It runs in phase 2 and again right before merge, and the app's own Restore is then tested with the same file on the phone (preview build).

## 6. Weekly goals & counting (confirmed by Jeff 2026-10-16)

Week = **Sunday 00:00 → Saturday 24:00** local time.
- **Heavy** (goal ≥2): a finished workout whose split is lower, chest-shoulders or back-biceps **and** has ≥2 resistance exercises with at least one logged set each. No minimum time. **Core does not count as Heavy.**
- **Split tracker** (goal: one each of Lower Body, Chest/Shoulders, Back/Biceps, Core): a finished workout of that split with ≥2 resistance exercises logged. Core counts here. Pure Cardio doesn't.
- **HIIT** (goal 1): a session with a cardio item whose 4×4 reached the end of hard interval 4.
- **Zone 2** (goal 2): a session with ≥20 min cardio time **or** a completed 4×4. Cardio time = per logged cardio set its `time`, or the exercise's target duration if no time was entered; a 4×4 run counts its run time (whichever is larger per exercise).
- **One session can count toward several goals** (e.g. Lower Body + 4×4 = Heavy + split + HIIT + Zone 2).
- **Steps:** today vs 8,000, plus "days met this week".
- **Fallback:** its own counter ("Fallbacks this week"), counts toward none of the above.
- The session detail shows what it earned; you can override a session's credit by hand.

## 7. Begin Next Session — generator

1. Start sheet: split (5 big buttons), cardio yes/no, equipment (4) — all pre-set to last choice.
2. Time per exercise = sets × work + (sets − 1) × rest + 30 s setup. Work = `durationSec`, else reps × 4 s (a reps range like "8-12" uses its midpoint). Defaults: 3 sets, 10 reps, 60 s rest; mobility/posture default 1–2 sets, 30 s rest.
3. Sections and windows: Mobility 8–12 min (aim 10), Posture 4–6 (aim 5), Resistance 25–45 (aim 35; none for Pure Cardio), Cardio 20–30 (aim 25; if cardio = yes or Pure Cardio). A cardio exercise with no duration gets 20 min for 1 set.
4. Candidates: the category matches, equipment matches the chosen mode, and for resistance the split matches (`upper` tags count for chest-shoulders and back-biceps). Fill greedily by **score**: days since last done (never done = top), small random jitter so it isn't the same list every time, a penalty for two exercises with near-identical names. Stop when the section is inside its window.
5. If the VO2 plan is active, that week's cardio exercise goes first in Cardio.
6. Everything is editable afterwards: +ADD per section; per exercise **Switch** (library opened on the right category/split, filter removable, any exercise allowed) and **Remove**. Section headers show estimated minutes vs target.

Exercise card tap → sheet with targets, notes, demo link, **last 10 times** (date · sets × reps @ weight or time/distance), and a suggestion: if the last 2 times hit all target sets × reps at the same weight → "+5 lb" (≥100 lb) or "+2.5 lb"; if reps-only → "+1–2 reps"; if time-based → "+10 % time"; if last RPE ≥9 → "hold"; otherwise "repeat last". Set logging uses the exercise's own tracking fields, pre-filled from the last set, with big +/– steppers.

## 8. Gym-floor UX

- Dark theme only, high contrast, large numbers. Touch targets ≥56 px; primary actions in the bottom third (thumb zone); no hover-only controls.
- **Always-visible timer bar** during a session (bottom): total time · current mode **WORK** (time since last set ended) or **REST** (countdown from the exercise's target rest; cue at 0; tap to skip). Pause button.
- **4×4 runner** (full screen, huge countdown, segment name, progress dots): warm-up 3' → hard 4' / rest 3' ×4 → done; optional 3' cool-down. Cues: 3 short beeps + vibration at −3 s, long beep + long vibration at each change. Pause / skip segment / stop.
- **Fallback runner:** same component with the 45/15 × 6 script; "Repeat?" at the end; saved as a Fallback session.
- **Wake Lock** while a session or runner is open (re-acquired when you come back to the app). Audio needs one tap to unlock — starting a session counts as that tap.
- Bottom nav: Today · Library · History · Settings (Backup/Restore, step goal, plan, about/version).

## 9. Health data (later — no source built now)

`platform/health.js` defines a small interface (`getDaily(from, to)`, `getActivities(from, to)`) that returns `daily` rows and "detected activities" (start, end, avg/max HR, type). The only source built now is **manual entry** (steps, sleep). A future **file import** source (e.g. a homelab job that pulls Garmin Connect data and writes a JSON file Forge can import) slots in without touching the rest. Detected activities would appear as "Unlogged activity — count as Zone 2 / HIIT / Heavy / ignore?". Options are written up in `docs/HEALTH-DATA.md` (phase 6).

## 10. Phases (one commit + CHANGELOG entry + SW cache bump each)

| Phase | Delivers | Phone check |
|---|---|---|
| 0 | These docs; `.gitignore` covers more backup filenames | — |
| 1 | Remove React/Vite/Tailwind; static shell, dark theme, router, bottom nav, IndexedDB layer, service worker + own icons, manifest; deploy workflow without a build step; **preview deploy** (Q3); `npm run lint` (checkJs) + `npm test` | Installs, opens offline, update banner works |
| 2 | Data model, migration (old localStorage + old/v2 backups), Backup/Restore in Settings, tests, `check-migration` run on real backup | Preview shows your real counts |
| 3 | Exercise library: search, filters, add/edit/delete, multi-select fields, revert built-ins | Edit + delete + restore |
| 4 | Start sheet + generator + session screen (sections, +ADD, Switch, Remove), set logging, exercise sheet (last 10 + suggestion), Finish | Full session at the gym |
| 5 | Timer bar (work/rest), 4×4 runner, fallback runner, cues, Wake Lock | Screen stays on; beeps + buzz |
| 6 | Dashboard goals + split tracker, history + calendar + session detail + credit override, manual steps/sleep, `health.js`, `docs/HEALTH-DATA.md` | Week tiles match reality |
| 7 | Polish, accessibility pass, README + CLAUDE.md updated for the new stack, final migration run on real backup, phone checklist | Your OK → you say "merge" |

**What changes at merge:** the live app at https://jestgr.github.io/Forge/ becomes the new one. On first open it copies your data from the old storage into the new database (old storage is left untouched). Rollback = `git revert` the merge; the old app would still find its old data, but anything logged in the new app after the switch would only exist in new-app backups.

## 11. Tests

- `node --test` (built into Node 20, no new packages) on everything in `js/core/`:
  - migrate: synthetic old-backup + old-localStorage fixtures → exact expected v2; invariants (no lost sessions/sets/exercises, ids stable, idempotent re-import); forgotten-finish fix; date-key conversion.
  - backup: export → restore round-trip is identical; rejects junk files with a clear message.
  - generator: each section inside its window; equipment respected; Pure Cardio has no resistance; recency preference; deterministic with a fixed seed; small libraries don't loop forever.
  - goals: each rule above incl. week edges (Sunday 23:59 / Monday 00:00), Core, fallback counts nothing, HIIT vs Zone 2 exclusivity.
  - timeline: 4×4 = 28 min, segment at any t, pause handling; fallback = 6 min.
  - progress: last-10 summary and each suggestion branch.
- `npm run lint` = `tsc --noEmit --checkJs` over `js/`.
- Both run in GitHub Actions before deploy.
- Per-phase manual phone checklist (in the CHANGELOG entry).
- Real backup: `tools/check-migration.mjs` (prints counts only; the file is never copied into the repo).

## 12. Answers from Jeff (2026-10-16)

1. Migration test uses `forge_backup_2026-10-14.json` (the file at `/root/forge-backup.json` is not a Forge backup).
2. Counting: see §6.
3. Preview: test copy at https://jestgr.github.io/Forge/preview/; merge to `main` only when Jeff says.
4. Keep/drop: see §2.
