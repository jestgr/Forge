# Task: Improve bike connection (task/improve-bike-connection)

Brief: 2026-11-23 "improve bike connection" (branch made from task/echelon-bike-connection).
Previous task notes: `docs/TASK-echelon-bike-connection.md`.

## Goal
Make the bike ride richer (Jeff, 2026-11-23: first on-bike test "worked great"): live heart rate from the Garmin
watch (Broadcast Heart Rate), a scrolling live chart of watts + resistance (15 min, touch to scroll back), and more
metrics: HR zones, best efforts, live averages, work + splits.

## Done when
- [x] Jeff's answers: HR = Garmin broadcast; metrics = zones, best efforts, live averages, work + splits; chart 15 min, drag back.
- [x] Live heart rate (native `HeartRate` plugin, remembered + auto-connect, retry, simulator) — D58.
- [x] HR zones live + time in zones at the end — D59.
- [x] Best 1/5/20-min watts vs all-time; 5-min splits; work (kJ); live avg/max — D60.
- [x] Live 15-min chart, drag back in time, Live button — D61.
- [x] Tests (core + UI with simulator incl. HR dropout); screenshots in headless Chrome; `npm run check` green (130 + new asserts).
- [x] forge-v21; CHANGELOG, DECISIONS, on-bike checklist §7 in `docs/ECHELON-TEST.md`.
- [ ] Jeff: push + build a test APK (needs his OK), then try §7 on the bike.

## Progress
- [x] Core metrics + tests (6dc916f).
- [x] Heart-rate connection (7bf9783).
- [x] Ride screens + Settings (f01f239).
- [x] Docs.

## Open questions
1. Does your Garmin model broadcast heart rate over **Bluetooth** (not only ANT+)? Venu 2 / newer usually do; we'll see on the bike.
2. OK to push this branch and build a test APK?
