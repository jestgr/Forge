# Garmin Venu 2 → Forge — plan

Status 2026-10-16: **plan for Jeff's review — nothing built yet.** Steps and sleep are entered by hand today (Today → Steps & sleep). Forge has a plug-in point for sources: `app/js/platform/health.js`.

## Goal
1. Steps and sleep arrive in Forge without typing (steps goal 8,000/day).
2. **Watch-recorded workouts** (anything you start on the Venu 2: walk, strength, cardio…) show up in Forge.
3. **Unrecorded effort** — e.g. an hour of chopping wood — is spotted from heart rate and offered as "Count as Zone 2 / HIIT / Heavy / ignore?".
4. Your data stays yours: no paid third-party service in the middle.

## What's possible (checked 2026-10-16)
| Route | Verdict |
|---|---|
| **Garmin official API** (Connect Developer Program: Health / Activity API) | ✗ Approved businesses only; personal applications are rejected, and new applications may be paused. |
| **Unofficial Garmin Connect library** (`python-garminconnect`, run on the homelab) | ✓ **Recommended.** Reads everything Garmin Connect shows you: steps, sleep, resting HR, all-day heart rate, intensity minutes, recorded activities. Logs in as you. **Risk:** Garmin changed its login in March 2026 and these tools broke for a while (the older `garth` library is now deprecated; `python-garminconnect` rebuilt its own login and works again). Expect occasional breakage; it may conflict with Garmin's terms of use. |
| **Health Connect** (Android) | ◐ Since mid-2025 the Garmin Connect app can write steps, heart rate, sleep and workouts to Health Connect (one way; not intensity minutes, Body Battery, etc.). A web app like Forge **cannot read it** — it would need a small native Android app. **Plan B** if the unofficial library stops working for good. |
| Garmin Connect file export (CSV/FIT per activity, or full account export) | ◐ Official but manual and slow; activities only. Fallback for one-off backfills. |
| Google Fit | ✗ Being retired. |

## Recommended design

```
 Venu 2 ──Bluetooth──▶ Garmin Connect app ──▶ Garmin cloud
                                                  │  (unofficial library, your login)
                                                  ▼
 LXC 100 (homelab): garmin-sync job  (systemd timer, ~06:30 daily + every 3 h)
   1. pull: daily summary (steps, resting HR, intensity minutes), sleep,
            all-day heart rate, activities recorded on the watch
   2. detect: unrecorded effort from heart rate (see below)
   3. write: forge-health-YYYY-MM-DD.json  (format below)
   4. deliver: send the file to you on Telegram (Hermes bot), keep a copy on LXC 100
                                                  │
                                                  ▼
 Phone: Forge  → Settings → Import health file   (later: "Share → Forge" from Telegram)
   • steps / sleep fill the day (a value you typed wins)
   • watch activities + detected effort appear on Today as cards:
       [Zone 2]  [HIIT]  [Heavy]  [Ignore]
     – a watch workout that overlaps a Forge session is attached to it
       (adds avg / max HR, calories) instead of showing a card
```

Why a file and not live sync: Forge lives on `https://jestgr.github.io` and works offline. It can't reach `http://` addresses on the home network, and opening an HTTPS route into the homelab would mean touching the Cloudflare tunnel on LXC 101 (off-limits). A daily file keeps Forge offline-first with no new network exposure. If the daily import gets tedious, a later step can make it one tap (Android "Share → Forge"), still without opening anything to the internet.

### Homelab side: new local-only project `/root/projects/garmin-sync`
- Python 3 + `python-garminconnect` (pinned version) in its own virtualenv; own git repo, CHANGELOG, not on GitHub.
- **Login once, by hand**: you run a login command (`! …`) that asks for your Garmin password and MFA code. Only the resulting **tokens** are saved (root-only); your password is not stored. If Garmin expires the tokens, the job stops and tells you to log in again.
- **Alerts**: Uptime Kuma push monitor ("garmin-sync ran OK"); a Telegram message if login is needed.
- **Backfill**: first run can pull the last 90 days (to see past weeks in Forge).
- Raw pulls kept on LXC 100 for 30 days (for debugging), never committed.

### Activity detection (on the homelab, from all-day heart rate)
- Inputs: the day's heart-rate series (the Venu 2 samples every ~1–2 min all day), resting HR and max HR from your Garmin profile (fallback: 220 − age).
- **Zone 2 floor** = resting + 0.5 × (max − resting) (≈ 60 % of heart-rate reserve).
- A **candidate** = HR at or above the floor for ≥ 20 min, allowing short dips (≤ 3 min); candidates < 10 min apart are merged.
- Ignore candidates that overlap a watch-recorded activity (that's already a card) — Forge also hides ones that overlap a Forge session.
- Suggested label: repeated bursts above ~80 % of reserve → "HIIT?"; long steady block → "Zone 2?"; you decide on the card.
- Garmin's own **vigorous intensity minutes** are shown on the card as a sanity check.
- Tuning: thresholds are settings in the job; we'll check them against a few real days (e.g. the wood-chopping day) before trusting them.

### Forge side (when built)
- Settings → **Import health file** (validates, shows "12 days of steps, 3 activities", merges by date / id — importing twice never duplicates).
- Daily rows: steps / sleep / resting HR from the watch; a value you typed by hand is kept unless you choose "use watch values".
- Today: "From your watch" cards for new activities → **Zone 2 / HIIT / Heavy / Ignore**. The choice is saved as an *activity* session (counts toward that goal; shows in History with a watch badge). Ignored ones never come back.
- A watch workout that overlaps a Forge session (≥ 50 % of its time) is attached to that session (avg / max HR, calories) — no card.
- History day sheet shows resting HR and the watch's activities.
- Tests with made-up files; checked against a real file locally (not committed).

### File format (Forge health import, schema 1)
```json
{
  "app": "forge-health", "schema": 1, "source": "garmin", "device": "Venu 2",
  "generatedAt": "2026-10-16T06:30:00-04:00",
  "daily": [
    { "date": "2026-10-15", "steps": 9123, "sleepHours": 7.4, "restingHr": 52,
      "intensityMinutes": { "moderate": 34, "vigorous": 12 } }
  ],
  "activities": [
    { "id": "garmin-activity-1234567890", "kind": "recorded", "type": "strength_training",
      "start": "2026-10-15T07:02:00-04:00", "end": "2026-10-15T07:51:00-04:00",
      "avgHr": 104, "maxHr": 141, "calories": 310 },
    { "id": "detected-2026-10-15-1402", "kind": "detected", "suggest": "zone2",
      "start": "2026-10-15T14:02:00-04:00", "end": "2026-10-15T15:10:00-04:00",
      "avgHr": 118, "maxHr": 151, "label": "Elevated heart rate, 68 min" }
  ]
}
```

## Phases (each its own commit + CHANGELOG entry; each waits for your OK)
| # | Where | Delivers | You check |
|---|---|---|---|
| G1 | garmin-sync | Project + venv; one-time login; pull yesterday; print **counts only** (steps, sleep h, activities, HR samples) | Numbers match the Garmin Connect app |
| G2 | garmin-sync | Detection + JSON file for the last 14 days; tuned on real days | Detected blocks match what you did |
| G3 | Forge (`rework`) | Import health file; steps/sleep fill in; Today cards; attach to overlapping sessions; tests | Import a file on the preview |
| G4 | garmin-sync | systemd timer, Telegram delivery, Uptime Kuma monitor, 90-day backfill | A file arrives each morning |
| G5 (optional) | Forge | "Share → Forge" from Telegram (installed app receives the file) | One-tap import |
| Plan B | — | If the unofficial login breaks for good: small Android app reading Health Connect → same file format | — |

## Decisions needed from Jeff (see chat)
1. OK to use the unofficial Garmin library, knowing it can break and is a grey area with Garmin's terms?
2. Where may the Garmin login **tokens** live? Rules say secrets only in `/etc/homelab/secrets.yaml` — store the tokens there (job updates them), or allow a root-only token file next to it?
3. Delivery: OK for the job to send the file via the **Hermes bot** (touches the hermes-bot setup / its token), or just keep files on LXC 100 and you download them another way?
4. Do you start workouts on the watch (e.g. Strength) while also logging in Forge? (Decides how much the overlap/attach logic matters.)
5. Is Garmin two-step verification (MFA) on for your account? (Only affects the one-time login.)

## Sources (2026-10-16)
- python-garminconnect: https://github.com/cyberjunky/python-garminconnect (login rebuilt after Garmin's March 2026 change; PR #448 https://github.com/cyberjunky/python-garminconnect/pull/448)
- garth deprecated: https://github.com/matin/garth
- Garmin Connect Developer Program (business only): https://developer.garmin.com/gc-developer-program/health-api/ · https://openwearables.io/docs/providers/garmin-api-integration · https://tryterra.co/blog/garmin-connect-developer-program-pause
- Garmin → Health Connect (one-way, what's included): https://askvora.com/blog/does-garmin-sync-with-health-connect · https://tech.yahoo.com/wearables/articles/garmin-wont-share-data-google-173520201.html · https://www.phonearena.com/news/garmin-smartwatch-google-health-connect-support_id171891
