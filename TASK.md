# Task: share a weekly summary with Preflight (task/preflight-link)

Brief: Jeff in chat, 2026-10-28: Forge and Preflight are both on the phone — make them talk directly. Preflight shows
a small row (steps, active calories, goal counts) that opens Forge.

## Goal
Forge's Android app publishes this week's goals + today's steps/calories where Preflight can read them, on the phone.

## Done when
- [x] `core/share.js` summary (same `weekSummary` as the dashboard) + tests; `npm run check` green (102).
- [x] Published after every data change (debounced) via app-local plugin `PreflightShare`; served by `SummaryProvider`.
- [ ] APK built by CI (workflow_dispatch on this branch → release `android-preview`) and installed by Jeff.
- [ ] Preflight shows the row (Preflight branch `task/forge-link`).

## Open questions
(none)
