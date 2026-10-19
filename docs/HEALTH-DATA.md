# Garmin Venu 2 → Forge — plan (v2)

Status 2026-10-19: **N1, N2 done** (Jeff: installed, connected, numbers match Garmin). **N3 done**. **N4 built** — effort without a workout from all-day heart rate (`core/effort.js`, D47); watch workouts → Today cards (`core/watch.js`, D41–D42). Earlier: **N2** — Health Connect read in the app: `app/js/platform/healthconnect.js` (plugin calls) + `app/js/core/metrics.js` (which types, how they become one value per day; add a metric there). Decisions D35–D40. Web version: steps and sleep still by hand.

### N2 — what's read (types Jeff picked)
| Forge | Health Connect | Per day |
|---|---|---|
| Steps | Steps | daily total (duplicates between apps removed) |
| Sleep | Sleep session | minutes asleep, on the wake-up day |
| Active / total calories | Active / Total calories burned | total |
| Distance | Distance | total (shown in mi) |
| Heart rate | Heart rate | average / min / max |
| Resting heart rate | Resting heart rate | latest |
| HRV | Heart rate variability (RMSSD) | average — only if a source writes it |
| Weight / body fat | Weight / Body fat | latest (weight shown in lb) |
| Workouts | Exercise sessions | permission asked now; used in N3 |
| Elevation gained | Elevation gained | **not yet** — plugin lacks it |

## Jeff's decisions (2026-10-16)
- **No unofficial Garmin login** (no `python-garminconnect`, no homelab job holding Garmin tokens).
- Use an **Android helper on the phone** that reads what Google Fit already shows (Jeff's Garmin data), **until Forge becomes a native Android app** installed from an APK.
- Workouts are rarely started on the watch while logging in Forge → overlap/attach logic is low priority.
- No Garmin MFA (no longer relevant).

## Key fact: read Health Connect, not the Google Fit API
- On Android today, Garmin Connect **writes** steps, heart rate, sleep and workouts ("exercise sessions") to **Health Connect**; Google Fit **reads** them from there. That's how Jeff's Garmin data appears in Google Fit.
- The **Google Fit APIs** are closed to new apps (since May 2024) and supported only until the **end of 2026**. A new helper can't be built on them.
- So the helper reads **Health Connect** — the same data Google Fit shows, and the same thing a native Forge would use. Not available through Health Connect: Garmin-only metrics (Body Battery, stress, intensity minutes).
- Health Connect is reachable only from a native Android app (not from a web page / PWA). Reading more than 30 days back needs an extra "history" permission.

## Recommendation: make the native app now (the "helper" *is* Forge)
Instead of a throw-away helper app plus the web app, wrap the existing Forge in a thin native Android shell with **Capacitor**:
- The shell shows the same `app/` code (no rewrite); a small native part reads Health Connect.
- Result: one APK = Forge + watch data. The GitHub Pages web app stays as a backup/fallback (same code).
- Building the APK happens on **GitHub Actions** (their machines already have the Android tools) → nothing gets installed on the homelab. You download the APK and install it.
- Moving your data into the APK: Backup in the web app → Restore in the APK (existing feature).

Alternative (not recommended): a separate small helper app that reads Health Connect and exports a file for the web app to import — two apps, a daily import step, and thrown away later.

### What the native Forge would do with watch data
- **Steps & sleep** fill in automatically each time you open Forge (a value you typed by hand wins).
- **Watch workouts** (exercise sessions Garmin wrote) appear on Today as cards: **Zone 2 / HIIT / Heavy / Ignore**.
- **Unrecorded effort** (e.g. chopping wood): detected from heart-rate samples — HR at or above ~60 % of heart-rate reserve for ≥ 20 min (short dips allowed) → card "Elevated heart rate, 68 min — count as…?". *Depends on Garmin writing all-day heart rate to Health Connect, not just during workouts — to be checked on Jeff's phone.*
- Detection runs in Forge's tested core code (pure JS), so the same logic works for any future source.

### Build steps (each its own commit + CHANGELOG entry; each waits for Jeff's OK)
| # | Delivers | Jeff checks |
|---|---|---|
| N1 | Capacitor Android shell around `app/`; APK built + signed on GitHub Actions; screen-awake + sounds verified in the app; Restore your backup | Install APK, everything works like the preview |
| N2 | Health Connect permissions screen; read steps + sleep (last 30 days, optional history) → daily rows | Steps/sleep match Google Fit |
| N3 | Read exercise sessions + heart rate → "From your watch" cards on Today; choices saved as sessions that count toward goals | A watch workout shows up and counts |
| N4 | Heart-rate effort detection (tuned on a couple of real days) | Wood-chopping day shows up |

### Notes / risks
- Capacitor adds dev packages and an Android project folder to the repo (the web app itself stays build-free). The APK needs a **signing key**: kept as a GitHub Actions secret, with a backup copy in `/etc/homelab/secrets.yaml` (losing it means reinstalling the app instead of updating).
- Health-plugin choice: prefer an open-source (MIT) Capacitor health plugin, or a small own plugin using Google's Health Connect library if none fits — decided in N2.
- Screen-awake in the app uses a native "keep awake" plugin (the web Wake Lock may not work inside the app shell).
- Health Connect data is only as complete as what Garmin Connect writes, and only after the watch syncs to the phone.

## Questions for Jeff (see chat)
1. OK to go straight to a **native Forge APK** (Capacitor) instead of a separate helper?
2. OK to add the Capacitor dev tools to the repo and build/sign the APK on **GitHub Actions** (signing key as a GitHub secret + backup in `secrets.yaml`)?
3. Where should the APK be downloaded from: a **GitHub Release** (public repo → anyone could download it; it contains no personal data) or the Actions page (needs your GitHub login)?
4. Please check on the phone: **Settings → Health Connect → App permissions → Garmin Connect** — which data types are allowed to write? And **Data and access → Heart rate**: are there readings all day, or only during workouts?

## Sources (checked 2026-10-16)
- Google Fit APIs end of 2026, no new sign-ups since May 2024: https://developers.google.com/fit · https://developer.android.com/health-and-fitness/health-connect/migration/fit · https://sahha.ai/blog/google-fit-api-sunset-migration/
- Garmin Connect → Health Connect (one way; what's included): https://askvora.com/blog/does-garmin-sync-with-health-connect · https://the5krunner.com/2025/05/22/garmin-connect-and-strava-runna-new-link-to-goolge-health-connect/ · https://www.fitmesh.fit/en/blog/sync-garmin-samsung-health-guide
- Capacitor + Health Connect: https://capacitorjs.com/docs/apis/health-fitness · https://github.com/Cap-go/capacitor-health · https://capawesome.io/docs/sdks/capacitor/health/
- Garmin official API (business only) / unofficial library (not used): https://developer.garmin.com/gc-developer-program/health-api/ · https://github.com/cyberjunky/python-garminconnect
