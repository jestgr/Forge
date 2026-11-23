# Task: Improve bike connection (task/improve-bike-connection)

Brief: 2026-11-23 "improve bike connection" (branch made from task/echelon-bike-connection).
Previous task notes: `docs/TASK-echelon-bike-connection.md`.

## Goal
Make connecting to the Echelon EX-3 faster and more reliable, and make problems visible on the phone.

## Done when
- [ ] Jeff says what went wrong on the bike (if he tested) — see Open questions.
- [ ] Connect can't hang forever (timeouts on connect / service discovery / notifications).
- [ ] Android's common GATT error 133 is retried automatically.
- [ ] The bike is remembered: reconnects go straight to it (no 15 s scan).
- [ ] Stale callbacks from an old connection can't fake a "connection lost".
- [ ] A "Bike details" diagnostics line (packets received, last packet, status codes) to debug on the phone.
- [ ] `npm run check` green; version bumped; CHANGELOG, DECISIONS, committed.

## Progress

## Open questions
1. Did you try the bike yet? What went wrong (didn't find it / connected but no numbers / numbers wrong / dropped / slow)?
