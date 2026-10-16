# Health data for Forge — options (Garmin Venu 2)

Status 2026-10-16: **nothing is connected.** Steps and sleep are entered by hand (Today → Steps & sleep). The app has a small plug-in point for future sources: `app/js/platform/health.js`.

## What we want
- Daily **steps** (goal 8,000) and **sleep** without typing them.
- **Activity detection** from heart rate: e.g. an hour of chopping wood shows up as "Unlogged activity — count as Zone 2 / HIIT / Heavy / ignore?".

## Constraints
- Forge is a web app (PWA) on GitHub Pages: it can only read files you give it, or call **HTTPS** web addresses that allow it (CORS). It cannot read Android-only stores (Health Connect) or talk to `http://` addresses on the home network from the `https://` site.
- All data stays yours: no third-party service in the middle; secrets only in `/etc/homelab/secrets.yaml`.

## Options

| # | Option | How | Pros | Cons |
|---|---|---|---|---|
| 1 | **Manual entry** (today) | Type steps/sleep in Forge | Works now, no accounts | Typing; no activity detection |
| 2 | **Homelab job → file → Forge import** (recommended next step) | A small Python job on LXC 100 (systemd timer, e.g. every morning) logs in to Garmin Connect with an unofficial library (e.g. `python-garminconnect`), pulls steps, sleep, resting HR, recorded activities and the day's heart-rate series, detects activities, and writes `forge-health-YYYY-MM-DD.json`. The file reaches the phone (e.g. sent by the Hermes Telegram bot, or downloaded), and Forge imports it (Settings → Import health file). | Full data incl. HR series; detection runs on the server; Forge stays offline-only; fits the homelab | Unofficial API: can break when Garmin changes its login, and may conflict with Garmin's terms; Garmin password/tokens must be stored (in `secrets.yaml`); MFA can complicate login; one manual import step a day |
| 3 | Homelab job → **HTTPS endpoint** → Forge fetches | Same job, but Forge downloads the file itself from an HTTPS address | No manual import | Needs a public HTTPS route into the homelab (the Cloudflare tunnel lives on LXC 101 — off-limits without your OK) and auth; more moving parts |
| 4 | **Garmin Connect export** files | Export activities (CSV / FIT) from connect.garmin.com and import into Forge | Official, no password stored | Manual; activities only (no steps/sleep series); no HR-based detection |
| 5 | **Garmin official APIs** (Health / Activity API) | Garmin Connect Developer Program | Official, push-based | Partner-only (business approval) — not available for a personal app |
| 6 | **Health Connect** (Android) | Garmin Connect app may write some data to Health Connect | On-phone | Native Android only — a web app can't read it; would need a separate Android helper app |
| 7 | Google Fit APIs | — | — | Being retired by Google; not worth building on |

**Recommendation:** stay on manual entry for now; when you want automation, build option 2 as a separate homelab project (its own repo, local-only), and add "Import health file" to Forge. Option 3 only if the daily import gets annoying, and only with your OK for any tunnel change.

## Proposed file format (Forge health import, schema 1)

```json
{
  "app": "forge-health",
  "schema": 1,
  "source": "garmin",
  "generatedAt": "2026-10-16T06:00:00-04:00",
  "daily": [
    { "date": "2026-10-15", "steps": 9123, "sleepHours": 7.4, "restingHr": 52 }
  ],
  "activities": [
    { "id": "garmin-1234567890", "start": "2026-10-15T14:02:00-04:00", "end": "2026-10-15T15:10:00-04:00",
      "type": "detected", "avgHr": 118, "maxHr": 151, "label": "Elevated HR 68 min" }
  ]
}
```

Forge would: upsert `daily` rows by date (source `garmin`, never overwriting a value you typed unless you choose to), and show new `activities` (by `id`, never twice) as "Unlogged activity" cards on Today with buttons **Zone 2 / HIIT / Heavy / Ignore** — the choice is saved as a session with that credit (no exercises).

## Activity detection (in the homelab job)
- Input: the day's heart-rate series (Garmin gives a reading every ~2 min all day, more often during recorded activities) and resting HR.
- Zone 2 floor ≈ resting HR + 0.5 × (max HR − resting HR); max HR from your profile or 220 − age as a fallback.
- Candidate = HR at or above the floor for ≥ 20 minutes, allowing short dips (≤ 3 min). Merge candidates < 10 min apart. Skip ones that overlap an activity you recorded on the watch or a Forge session (Forge does the overlap check on import).
- Suggest a label: mostly above 80 % HRR in 3–5-min bursts → "HIIT?", otherwise "Zone 2?". You decide in Forge.

## Interface in Forge today
`platform/health.js` defines `HealthSource { id, name, getDaily(from, to), getActivities?(from, to) }`; only `manualSource` exists, plus `setDaily(date, fields, source)` used by manual entry. The file importer above would add a `garmin-file` source and the Today cards.
