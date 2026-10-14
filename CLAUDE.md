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
- Static React 19 + Vite 6 + Tailwind 4 PWA. No backend; all data in browser localStorage (Export/Import for backups).
- Dev: `npm run dev` (port 3010; Karakeep owns 3000 on LXC 100). Type-check: `npm run lint`. Build: `npm run build` → `dist/`.
- Deploy: merge to `main` → GitHub Actions (`.github/workflows/deploy.yml`) → GitHub Pages at https://jestgr.github.io/Forge/. Paths must stay relative (`./`) because the site lives under `/Forge/`.
- Google Fit + AI Coach are switched off (`FIT_ENABLED` / `AI_ENABLED` in `src/App.tsx`); server code is on branch `feat/cloud-run`.
- Never commit Forge backup JSON files (personal workout data).
