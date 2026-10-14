# Forge: Workout Builder

A phone-friendly workout tracker (installable PWA) with a 12-week VO2 Max progression plan.
All data is stored on the device (browser `localStorage`); use **Export** / **Import** in the app to back up or move it.

Live app: https://jestgr.github.io/Forge/ — on your phone, open it in Chrome and use **Add to Home screen**.

## Develop
Requires Node.js 20+.

```
npm install
npm run dev      # http://<this-machine>:3010
npm run lint     # type-check
npm run build    # static site in dist/
npm run preview  # serve dist/ on :3010
```

## Deploy
Merging to `main` runs `.github/workflows/deploy.yml`, which builds the site and publishes it to GitHub Pages.

## Switched off for now
Google Fit sync and the AI Coach need a backend server, which GitHub Pages doesn't provide.
They're behind `FIT_ENABLED` / `AI_ENABLED` in `src/App.tsx`; the server code is kept on the `feat/cloud-run` branch.
