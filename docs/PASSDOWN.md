# Passdown — Forge

Last updated: 2026-11-12. Read this first when picking Forge up again; then `TASK.md`, `docs/DECISIONS.md` (D49–D57).

## Where things stand
- **Echelon bike connection** is built on branch `task/echelon-bike-connection` (pushed; based on `main`, not `rework`).
- Test APK from commit `0ca081d` is on release **android-preview** and **installed on Jeff's phone (2026-11-12)**.
- **Waiting for:** Jeff's on-bike test with `docs/ECHELON-TEST.md`. Nothing is merged; `main` / `android-latest` untouched.
- `npm run check` green (125 tests). Version `forge-v20` (main is v19).
- One local-only commit after the APK: `59a1b4a` (TASK/CHANGELOG note; not pushed, not needed for the APK).

## When Jeff reports back
- **Works** → ask whether to merge into `main` (his call; see CLAUDE.md). After merge, the main push builds `android-latest`.
- **Doesn't connect** → check: Echelon app still open somewhere (one connection only)? Bike asleep? Android
  "Nearby devices" permission denied? If it connects but no numbers arrive, suspect the newer-firmware
  **lock** (bike sends `F0 E0 …` frames; qdomyos-zwift has an unlock handshake — not implemented, D53).
- **Numbers wrong** → compare his Forge screenshot with the console photo. Packet offsets live in
  `decodeEchelon()` in `app/js/core/bike.js` (elapsed bytes 3–4, distance 5–8 in 0.01 km, cadence 9–10,
  resistance byte 3 of `0xD2`). Distance units are the least certain part.
- Debugging on the phone: no logs are shown in the app. If needed, add a temporary "raw packets" line to the ride
  view, or use `chrome://inspect` with the phone on USB (WebView debugging).

## How the bike code is laid out
| File | What |
|---|---|
| `android/.../EchelonBikePlugin.java` | Native BLE: scan (name `ECH…` or service `0bf669f0`), connect, notify `…f4`, write `…f2`. Protocol-free. **Only compiled in CI** (no Android SDK on the dev box). |
| `app/js/core/bike.js` | Pure, tested: Echelon + FTMS decoding, commands/checksum, ride samples, est. watts, kcal, per-second series, summary, `isBikeExercise`, `watchMatch`. |
| `app/js/core/chart.js` | SVG charts (watts, cadence) and the small saved picture (data URL). |
| `app/js/platform/bike.js` | One ride in memory; native plugin or simulator; reconnect 5 s × 2 min; `timing` is tweakable for tests. |
| `app/js/platform/bikesim.js` | Simulator (Settings → Bike simulator) sending real Echelon packets; `drop()` for dropouts. |
| `app/js/ui/ride.js` | Card panel (add-on), full-screen view (Pure Cardio), ride-done charts. Live values update elements with class `bk-<key>`. |
| `app/js/ui/session.js` | Wiring: `beginRide` / `endRide` / `logRide`; Log set takes a `preset` from the ride. |
| Tests | `tests/bike.test.js`, `tests/chart.test.js`, `tests/bike-ui.test.js` (fake plugin + simulator incl. dropout). |

## Not done / ideas parked
- Per-second data is **not** saved (Jeff's choice); only summary + picture (`item.ride`).
- No live heart rate (EX-3 has none; watch data arrives hours later). Calories compared with the watch in History only.
- No HIIT detection from rpm/resistance (D51). FTMS decoder exists but the plugin only talks to the Echelon service.
- A ride in progress lives in memory: if Android kills the app mid-ride, that ride is lost.
- CI warnings (not errors): actions on Node 20 and `setup-java@v4` are deprecated — worth bumping some day.

## Handy commands
- Preview in a browser: `python3 -m http.server 5101 --bind 0.0.0.0 --directory app` → http://192.168.68.85:5101
  (turn on Settings → Bike simulator to try the ride screens). Stop it afterwards.
- Screenshots without a phone: headless Chrome at `~/.cache/ms-playwright/chromium_headless_shell-1248/`, driven over
  the DevTools protocol with Node 22 (`/opt/node22/bin/node`, has WebSocket). `window.forge.store` is exposed.
- Build a test APK (needs Jeff's OK; in this setup Jeff runs it himself with `!`):
  `git push -u origin <branch>` then `gh workflow run android.yml --repo jestgr/Forge --ref <branch>`
  → https://github.com/jestgr/Forge/releases/download/android-preview/forge.apk
- In applab sessions `git push` and `rm -rf` are blocked by permissions — ask Jeff to run pushes with `!`.
