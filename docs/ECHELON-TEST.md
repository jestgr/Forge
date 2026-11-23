# Echelon bike — on-bike test checklist

Before you start: install the test APK, **close the Echelon app** (also on any tablet), and make sure Bluetooth is on.

## 1. Connect (cardio add-on)
- [ ] Start a session with cardio (e.g. Lower Body + Yes). A **Stationary Bike** card shows **Connect Echelon bike**.
- [ ] Pedal a few turns to wake the bike, tap Connect. First time: Android asks for **Nearby devices** → Allow.
- [ ] Within ~15 s the small panel says **Connected** and the bike's name (starts with "ECH").
- [ ] Pedal: **rpm** follows your pedalling; turn the knob: **resistance** changes (1–32).
- [ ] **Watts** goes up with rpm and resistance; it's marked "est.".
- [ ] **Time** and **miles** count up from 0 (not from what the bike console shows).
- [ ] The screen stays on.

## 2. Compare with the bike console (after ~5 minutes)
- [ ] rpm on Forge ≈ rpm on the console.
- [ ] resistance on Forge = resistance on the console.
- [ ] Distance: Forge (miles) vs console — note both (the console may show km).
If something is clearly off, take a screenshot of Forge and a photo of the console at the same moment.

## 3. Dropout
- [ ] Mid-ride, turn the phone's Bluetooth off for ~10 s, then back on.
- [ ] Forge shows **Connection lost — reconnecting…** and reconnects on its own within a minute; time/miles continue.
- [ ] (Optional) Leave Bluetooth off for 2+ minutes → **Not connected** + **Reconnect** button works.

## 4. Stop and log
- [ ] **Stop ride** → **Ride done** with watts and cadence charts; touching a chart shows the values at that moment.
- [ ] **Log this ride** → time, distance, speed pre-filled; change something, **Save set**.
- [ ] The card shows the small chart picture and the summary line.

## 5. Pure Cardio (full screen)
- [ ] New session → Pure Cardio. Connect on the bike exercise → **full-screen** ride view.
- [ ] Turn the phone sideways: everything fits, Stop / Cancel side by side.
- [ ] The back arrow minimises; "Ride running — open" brings it back.
- [ ] Ride 20+ minutes, stop, log, finish → session counts as **Zone 2**.

## 6. Afterwards
- [ ] History → the session shows the ride picture and line.
- [ ] If the watch recorded the same workout: after it syncs (Health Connect can take hours), the session shows
      "Calories: Forge estimate … · watch …".

## If it doesn't connect
- Echelon app open somewhere? Close it (the bike takes one connection at a time).
- Bike asleep? Pedal, then tap Reconnect.
- Still nothing: note what the status line says. (Some newer Echelon firmware locks the data to the Echelon app;
  a 4-year-old EX-3 most likely isn't affected.)

## 7. Heart rate, live chart, new metrics (forge-v21)
- [ ] On the Garmin, turn on **Broadcast Heart Rate** (controls menu, or Settings → Wrist Heart Rate).
- [ ] Start a ride → tap **Connect heart rate** → within ~15 s: "Heart rate", the watch's name, red **bpm** + zone.
- [ ] bpm on Forge ≈ bpm on the watch. Zone colour changes as you work harder.
- [ ] Next ride: heart rate connects **on its own** (Settings → Echelon bike shows the remembered watch).
- [ ] Turn broadcast off for ~10 s → "Heart rate lost — reconnecting…", then back by itself.
- [ ] Live row: **W avg / W max / rpm avg** update.
- [ ] Live chart: orange watts, purple resistance steps, last 15 minutes. **Drag it right** → it shows earlier
      minutes and stops moving, with the values under your finger; **Live ▸** jumps back.
- [ ] Ride 20+ min, stop → **Ride done**: heart-rate chart, **time in zones**, **best efforts** (1/5/20 min;
      second ride shows "best ever" / "New best"), **splits** every 5 min, **work (kJ)**.
If heart rate never shows up: the watch may only broadcast over ANT+ (phones can't hear that) — tell me the
watch model + firmware and what the status line said.
