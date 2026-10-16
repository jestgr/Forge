# Forge

A gym-floor workout tracker for the phone: installable, works offline, dark, big buttons.
All data stays on the device (IndexedDB). Use **Settings → Backup** to save a file and **Restore** to load one.

- Live app: https://jestgr.github.io/Forge/ — open in Chrome on the phone, then **Add to Home screen**.
- Test copy of the `rework` branch: https://jestgr.github.io/Forge/preview/ (separate data).

## Develop
Plain HTML/CSS/JS, no build step — `app/` is exactly what gets published. Requires Node.js 20+ and Python 3 for the dev server.

```
npm install      # dev tools only (TypeScript checker)
npm run dev      # serve app/ at http://<this-machine>:3010
npm run check    # type-check (JSDoc) + tests (node --test)
```

On every deployable change bump `VERSION` in `app/js/version.js` and `CACHE` in `app/sw.js` (same value).

## Docs
- `docs/REWORK.md` — the brief
- `docs/PLAN.md` — architecture, data model, migration, phases, tests
- `docs/DECISIONS.md` — choices made along the way
- `docs/HEALTH-DATA.md` — options for watch data (Garmin)
