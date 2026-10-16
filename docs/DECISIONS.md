# Forge rework — decisions

Choices made without asking (brief: "ask only for real decisions"). Each can be changed; say so and it gets updated here.

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 2026-10-16 | No build step: plain ES modules. Keep `typescript` only as a dev-time checker (`tsc --checkJs`, JSDoc types) and use Node's built-in `node --test`. | Meets "no build step"; keeps type-safety and tests without any compiled output or new packages. |
| D2 | 2026-10-16 | On first launch, migrate automatically from the old app's localStorage (`forge_workout_state`), read-only; never delete it. | Old backup files don't contain the training plan, built-in edits or steps — localStorage does. Leaving it in place keeps rollback possible. |
| D3 | 2026-10-16 | Built-in exercises keep their old ids (`mob_1` …); custom ones keep `custom_…`. | History links stay intact. |
| D4 | 2026-10-16 | Equipment mapping: Travel → Home/Travel; anything tagged both Full Gym and Travel also gets Minimal gym. | Minimal gym is new; dumbbell/cable moves usually fit it, machines/barbells don't. |
| D5 | 2026-10-16 | "Upper" split tag counts for both Chest/Shoulders and Back/Biceps sessions. | The brief lists Upper in the library but not as a session choice. |
| D6 | 2026-10-16 | Week runs **Sunday–Saturday** (Jeff's answer). | Jeff. |
| D7 | 2026-10-16 | Sessions left running > 4 h get end = last set + 5 min; original kept in `legacy`. | 3 real sessions ran 16–64 h by mistake, which would wreck durations. |
| D8 | 2026-10-16 | 4×4 ends after hard interval 4; cool-down is optional. | Brief's protocol has no cool-down; old app had one. |
| D9 | 2026-10-16 | Fallback moves follow the brief (squats, push-ups, lunges R/L, inchworm, plank), not the old list. | Brief wins. |
| D10 | 2026-10-16 | Drop charts, heatmap, efficiency index, PR card (Jeff), plus library-only export and placeholder user name. Re-roll stays (Jeff). | Code stays in git history. |
| D11 | 2026-10-16 | Plans are data (`plans` store). The 12-week VO2 plan is built in; more can be added by importing a plan JSON file in Settings. An active plan puts that week's cardio first in the Cardio section. | Jeff: keep the plan, make a way to add plans later. A file import is the smallest working way; an in-app editor can come later. |
| D12 | 2026-10-16 | Old-format backups merge by id on restore; v2 backups replace everything after a confirm and an offered safety export. | Re-importing never duplicates; full restore stays predictable. |
| D13 | 2026-10-16 | Units stay lb / mi / mph. | Matches existing data. |
| D14 | 2026-10-16 | App icons are generated into the repo (no hot-linked image). | The flaticon link breaks offline and is a third-party request. |
| D15 | 2026-10-16 | Heavy = lower / chest-shoulders / back-biceps workout with ≥2 resistance exercises logged; Core excluded; no minimum time. | Jeff. |
| D16 | 2026-10-16 | Split tracker uses the same "≥2 resistance exercises logged" rule; Core counts there. | Brief lists Core in the split tracker; Jeff excluded it only from Heavy. |
| D17 | 2026-10-16 | Zone 2 = ≥20 min cardio **or** a completed 4×4; a 4×4 therefore earns both HIIT and Zone 2. Sessions can earn several goals. | Jeff ("at least 20 minutes and/or a 4×4"; "one session can count as multiple"). |
| D18 | 2026-10-16 | Preview at /Forge/preview/ uses its own database (`forge-preview`); it reads the live app's old localStorage only to test migration and never writes to it. | Same web address = shared browser storage; keeps real data safe. |
| D19 | 2026-10-16 | An exercise with no split tags is usable in any split (old "All" → no tags). | Simpler than listing every split; same behaviour as the old app. |
| D20 | 2026-10-16 | Zone 2 cardio time: a logged cardio set without a time counts as the exercise's target duration; no "time with section open" tracking. | Old data rarely has cardio times logged; avoids a hidden timer that's hard to trust. |
| D21 | 2026-10-16 | Credit (Heavy / Zone 2 / HIIT / split) is computed from the session's logged data every time, not stored; only a manual override is stored. | Changing a session later (or the rules) never leaves stale counts. |
| D22 | 2026-10-16 | Restoring a file that is not a Forge backup is refused with a message (e.g. the current `/root/forge-backup.json`). | No silent partial restores. |
