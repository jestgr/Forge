# Task: Echelon bike connection (task/echelon-bike-connection)

Brief (applab, 2026-11-11): "echelon bike connection".

## Goal
Forge connects to Jeff's Echelon bike over Bluetooth and uses its live data (time, distance, speed, cadence,
resistance, heart rate) for cardio: shown during the ride and saved as the cardio set.

## Done when
- [x] Pure decoder for the bike's Bluetooth data (Echelon's own protocol + the standard FTMS "Indoor Bike Data"),
      plus a ride summary that becomes a logged cardio set; tests green.
- [ ] Jeff answers the open questions (which bike, where it should show, what to save).
- [ ] Connection layer (Android app and/or Chrome PWA) + UI in the cardio card.
- [ ] Tested on the real bike by Jeff.

## Progress
- [x] TASK.md written. Nothing about Echelon/Bluetooth exists in the repo yet.
- [x] `core/bike.js` decoder + ride summary + tests (110 pass). Waiting on open questions before the connection + UI.

## Open questions
1. Which Echelon bike (model, e.g. Connect EX-3 / EX-5 / EX-8s)? Newer ones may also speak standard FTMS.
2. Forge on the bike: the Android app (needs native Bluetooth) or Chrome PWA (Web Bluetooth works there), or both?
3. Native Bluetooth for the Android app: small own Java plugin (no new dependency, more code) or
   `@capacitor-community/bluetooth-le` (new npm dependency, MIT, well used)?
4. What to do with the data: live numbers on the cardio card + save time/distance/avg speed/avg HR into the set?
   Also auto-mark Zone 2 / 4×4 from it?
5. Branch was created from `main`, applab notes say tasks go off `rework`. OK to stay on `main`'s base?
