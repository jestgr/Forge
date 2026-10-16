# Forge rework brief

You are reworking Forge (this repo) from the ground up. Reimagine the code, UX and look; keep the concepts below. Work on branch `rework`. Never touch main until I say merge. My real backup from the current app is /root/forge-backup.json (personal data: never commit it).

## Constraints
- Stay a plain HTML/CSS/JS PWA (no framework, no build step unless you make a strong case first). Runs on my Samsung S25 Ultra (Chrome). Offline-first.
- All data on the phone only (IndexedDB preferred). Backup = export JSON file; Restore = import it.
- No data loss: Restore must accept backups from the CURRENT app and migrate them (exercises, history, the existing training plan). Test the migration against my real backup.
- Bump the service-worker cache version on every deployable change.
- Gym-floor ergonomics: big tap targets, one-hand use, dark theme, screen stays awake during sessions (Wake Lock), sound + vibration cues on timers.

## Weekly goals (dashboard trackers)
- Heavy (resistance session): ≥2/week
- Zone 2 cardio: 2/week
- HIIT: 1/week
- Steps: 8,000/day
- Split tracker: one each of Lower Body, Chest/Shoulders, Back/Biceps, Core per week (Pure Cardio does not count)
- 6-minute fallback: tracked separately, counts toward none of the above.

## Exercise library (keep all fields; add/edit/delete)
- Name; Category (multi): resistance, mobility, posture, cardio
- Split (multi): lower, upper, chest/shoulders, back/biceps, core, pure cardio
- Equipment mode (multi): home/travel, full gym, minimal gym, bodyweight
- Target sets / reps / rest / duration; notes; demo video link

## Begin Next Session (auto-generated workout)
1. Ask: split (Lower Body, Chest/Shoulders, Back/Biceps, Core, Pure Cardio), include cardio (yes/no), equipment mode (remember last choice).
2. Generate sections, filled by estimated time (sets × rep-time or duration + rest):
   - Mobility ~10 min, Posture ~5 min (always)
   - Resistance 25–45 min from the chosen split (skip for Pure Cardio)
   - Cardio 20–30 min if cardio chosen (or Pure Cardio)
   - Prefer exercises not done recently; respect equipment mode.
3. Each section: +ADD. Each exercise: Switch (opens library filtered to the right split, but can pick ANY exercise), Remove.
4. Tap an exercise card: target sets/reps/duration + concise summary of the last 10 times I did it (suggest progression when sensible).
5. Log reps / weight / duration per set as applicable.
6. Always-visible session timer: total time + work vs rest intervals.
7. Every cardio exercise: "Begin 4×4 protocol": 3 min warm-up, then 4 × 4 min hard with 3 min active rest between (auto-advancing, cues).
8. Finish Session saves and returns to dashboard.
- Counting (confirm with me): resistance split → Heavy + split tracker; cardio with completed 4×4 → HIIT; other cardio ≥20 min → Zone 2.

## 6-minute fallback (dashboard button)
Auto-timed 45 s work / 15 s rest: squats, push-ups, lunges right, lunges left, inchworm, plank. Logged as "Fallback".

## Health data
- Pluggable "health source" module: daily steps, sleep, heart-rate-based activity detection (e.g. chopping wood counts as a workout). Today: manual entry for steps/sleep.
- My watch is a Garmin Venu 2 (corrected 2026-10-16; earlier draft said Fitbit Versa). Garmin's official Health API is partner-only; the likely future path is a homelab job pulling Garmin Connect data, imported into Forge as a file. Google Fit APIs are being retired and Health Connect is native-Android only. Don't implement a source yet. Write options in docs/HEALTH-DATA.md.

## How to work
1. Read-only first: read the whole current app; summarize what exists, including anything not described here, and list conflicts with this brief.
2. Write docs/REWORK.md (this brief) and docs/PLAN.md (architecture, data model, migration, phases, tests). Stop; show me the plan summary + your questions.
3. After my OK, build phase by phase on `rework`: commit per phase, CHANGELOG.md entry per phase, bump SW cache, tell me how to preview the branch on my phone.
4. Ask only for real decisions; otherwise choose sensibly and log in docs/DECISIONS.md.
5. Before merge: run the migration on my real backup, then wait for my "merge".
