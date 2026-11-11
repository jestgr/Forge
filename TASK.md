# Task: Echelon bike connection (task/echelon-bike-connection)

Brief (applab, 2026-11-11): "echelon bike connection".

## Goal
Forge (Android app) connects to Jeff's Echelon Connect EX-3/EX-4 over Bluetooth, shows the ride live on the cardio
card and saves it as the cardio set, so it counts toward the weekly goals.

## Done when
- [x] Pure decoder for the bike's data (Echelon protocol + standard FTMS) and ride summary → cardio set; tests.
- [x] Jeff answered (2026-11-11): EX-3/EX-4, Android app with own plugin, live + save + goals, keep `main` base.
- [x] Android `EchelonBike` plugin + `platform/bike.js` + UI on the cardio card; `npm run check` green (113).
- [ ] APK built by CI (needs Jeff's OK to push; no Android SDK here, so the Java is not compiled locally).
- [ ] Tested on the real bike by Jeff.

## Progress
- [x] TASK.md written. Nothing about Echelon/Bluetooth existed in the repo.
- [x] `core/bike.js` decoder + ride summary + tests.
- [x] Questions answered (D50, D51).
- [x] Native `EchelonBike` plugin + manifest Bluetooth permissions.
- [x] Counters (time, distance) count only what was gained after connecting; console reset handled.
- [x] Cardio card: Connect Echelon bike → live sheet → Stop & save ride; UI test with a fake bike.

## Open questions
1. OK to push `task/echelon-bike-connection` and start the Android workflow on it by hand? It would build the APK and
   put it on the `android-preview` release (replacing the current preview APK); main / android-latest untouched.
2. The Echelon packet layout comes from community reverse engineering; if numbers look wrong on the bike, a short
   screen recording of the ride sheet helps me fix the offsets.
