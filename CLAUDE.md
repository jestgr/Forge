# Forge — Claude Code rules for this project

## Git
- You may commit and push **to this repo only** (github.com/jestgr/Forge).
- Always work on a branch (e.g. `feat/...`, `fix/...`, `chore/...`) — never commit directly to `main`.
- Merge to `main` **only when Jeff says so**.
- Commit before and after each change with a clear message, so anything can be undone with `git revert`.

## Change log
- Log every change in `CHANGELOG.md`: date, what changed, branch/commit, and the rollback command.

## Secrets
- Never commit real keys/secrets (`.env*` is gitignored except `.env.example`, which must hold placeholders only).
- Never print secret values — mask them.

## Project quick facts
- Plain HTML/CSS/JS PWA, **no build step**: the `app/` folder is published as-is. No backend; data in IndexedDB on the phone (Backup = export JSON, Restore = import). Plan: `docs/PLAN.md`; decisions: `docs/DECISIONS.md`.
- Dev: `npm run dev` (serves `app/` on port 3010; Karakeep owns 3000 on LXC 100). Checks: `npm run check` (= `npm run lint` type-check via JSDoc + `npm test` with `node --test`).
- **Bump the version on every deployable change**: `VERSION` in `app/js/version.js` and `CACHE` in `app/sw.js` (must match; a test checks it). New files in `app/` must be added to `ASSETS` in `app/sw.js` (a test checks this too).
- Deploy: `.github/workflows/deploy.yml` publishes `main` to https://jestgr.github.io/Forge/ and `rework` (if it exists) to https://jestgr.github.io/Forge/preview/ (own database `forge-preview`). Paths must stay relative (`./`).
- **Android app**: Capacitor 8 shell in `android/` around `app/`. Capacitor CLI needs Node 22 → run it as `with-node22 npx cap sync android` (Node 22 in `/opt/node22`; system Node stays 20). After `cap add`/icon changes: `python3 tools/make-android-icons.py`. GitHub Actions (`.github/workflows/android.yml`) builds + signs the APK (secrets `ANDROID_KEYSTORE_B64` / `_PASSWORD` / `ANDROID_KEY_ALIAS`; copy in `/etc/homelab/secrets.yaml`) and publishes it: rework → release `android-preview`, main → `android-latest` (asset `forge.apk`). Never commit keystores or APKs.
- Old React app + Google Fit/AI server code: in git history / branch `feat/cloud-run`.
- Never commit Forge backup JSON files (personal data).
