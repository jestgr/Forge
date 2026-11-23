# Task: Echelon bike connection (task/echelon-bike-connection)

Brief: 2026-11-11 ("echelon bike connection"), full brief 2026-11-12 (live metrics on any bike exercise, own BLE
module, reconnects, simulator; done when tested in mock mode, committed, on-bike checklist given).

## Goal
In any workout with a bike exercise, connect to Jeff's Echelon EX-3 from the Forge Android app and see live
rpm / estimated watts / resistance / time / distance / speed / kcal; stop → chart → log; summary saved.

## Done when
- [x] Repo summarised and questions answered by Jeff (D52).
- [x] Bike button on bike exercises (Stationary Bike + library tag) in any workout, works mid-workout.
- [x] BLE code in its own modules (`core/bike.js` protocol, `platform/bike.js` connection, native `EchelonBikePlugin`).
- [x] Disconnects: auto-retry 5 s × 2 min, ride kept, then Reconnect.
- [x] Simulator (Settings → Bike simulator); tested in mock mode: UI tests (fake plugin + simulator incl. dropout)
      and screenshots in headless Chrome (portrait, landscape). `npm run check` green (125).
- [x] Committed; on-bike checklist in `docs/ECHELON-TEST.md`.
- [x] Pushed (Jeff, 2026-11-12); CI run 43220192459 built + signed the APK (Java compiles) → release `android-preview`.
- [ ] Jeff: on-bike test with `docs/ECHELON-TEST.md` (APK installed 2026-11-12). Passdown: `docs/PASSDOWN.md`.

## Progress
- [x] Decoder + tests; native plugin; first UI (2026-11-11).
- [x] Protocol verified against echbt + qdomyos-zwift (D53); advertised UUID fixed.
- [x] Watts estimate, kcal, per-second series, watch comparison (D54).
- [x] Charts + saved picture (D55); ride flow (D56); library tag (D57); simulator.

## Open questions
(none — waiting for the on-bike test)
