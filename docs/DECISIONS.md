# Forge rework — decisions

Choices made without asking (brief: "ask only for real decisions"). Each can be changed; say so and it gets updated here.

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 2026-10-16 | No build step: plain ES modules. Keep `typescript` only as a dev-time checker (`tsc --checkJs`, JSDoc types) and use Node's built-in `node --test`. | Meets "no build step"; keeps type-safety and tests without any compiled output or new packages. |
| D2 | 2026-10-16 | On first launch, migrate automatically from the old app's localStorage (`forge_workout_state`), read-only; never delete it. | Old backup files don't contain the training plan, built-in edits or steps — localStorage does. Leaving it in place keeps rollback possible. |
| D3 | 2026-10-16 | Built-in exercises keep their old ids (`mob_1` …); custom ones keep `custom_…`. | History links stay intact. |
| D4 | 2026-10-16 | Equipment mapping: Travel → Home/Travel; anything tagged both Full Gym and Travel also gets Minimal gym. | Minimal gym is new; dumbbell/cable moves usually fit it, machines/barbells don't. |
| D5 | 2026-10-16 | "Upper" split tag counts for both Chest/Shoulders and Back/Biceps sessions. | The brief lists Upper in the library but not as a session choice. |
| D6 | 2026-10-16 | Week runs Monday–Sunday (old app: Sunday–Saturday). | Weekend sessions fall in the same week; common for training logs. |
| D7 | 2026-10-16 | Sessions left running > 4 h get end = last set + 5 min; original kept in `legacy`. | 3 real sessions ran 16–64 h by mistake, which would wreck durations. |
| D8 | 2026-10-16 | 4×4 ends after hard interval 4; cool-down is optional. | Brief's protocol has no cool-down; old app had one. |
| D9 | 2026-10-16 | Fallback moves follow the brief (squats, push-ups, lunges R/L, inchworm, plank), not the old list. | Brief wins. |
| D10 | 2026-10-16 | Drop charts, heatmap, efficiency index, PR card, re-roll, library-only export, placeholder user name. | Not in the brief; adds weight without gym-floor value. Code stays in git history. |
| D11 | 2026-10-16 | Keep the 12-week VO2 plan as an optional setting that only suggests the week's cardio exercise. | The brief requires migrating it; minimal footprint. |
| D12 | 2026-10-16 | Old-format backups merge by id on restore; v2 backups replace everything after a confirm and an offered safety export. | Re-importing never duplicates; full restore stays predictable. |
| D13 | 2026-10-16 | Units stay lb / mi / mph. | Matches existing data. |
| D14 | 2026-10-16 | App icons are generated into the repo (no hot-linked image). | The flaticon link breaks offline and is a third-party request. |
