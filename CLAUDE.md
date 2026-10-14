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
- Stack: React 19 + Vite 6 + Tailwind 4 front end, Express server (`server.ts`) for Google Fit OAuth/sync, Gemini via `@google/genai`.
- Dev: `npm install && npm run dev` (tsx server.ts --dev, port 3000, Vite middleware).
- Build/run: `npm run build` → `dist/` + `dist/server.cjs`; `npm start`.
- Type-check: `npm run lint`.
- Env vars: `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`.
- Note: port 3000 is already used by Karakeep on LXC 100.
