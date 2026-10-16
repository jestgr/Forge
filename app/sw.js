// Forge service worker: offline-first.
// Every app file is precached at install; requests are answered from the cache.
// A new version installs in the background and waits until the app says
// "reload" (update banner), so a running workout is never interrupted.
// Bump CACHE on every deployable change (must equal VERSION in js/version.js).
const CACHE = 'forge-v6';

// Every file in app/ except this one (a test checks the list is complete).
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/version.js',
  './js/store.js',
  './js/setup.js',
  './js/core/model.js',
  './js/core/util.js',
  './js/core/builtins.js',
  './js/core/plans.js',
  './js/core/migrate.js',
  './js/core/goals.js',
  './js/core/backup.js',
  './js/platform/db.js',
  './js/ui/dom.js',
  './js/ui/dashboard.js',
  './js/ui/library.js',
  './js/ui/history.js',
  './js/ui/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    // First install over the old React app (its caches were "forge-cache-vN"):
    // take over right away, the old app has no update banner.
    const keys = await caches.keys();
    if (keys.some((k) => k.startsWith('forge-cache-'))) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('forge') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  // The preview copy lives under <scope>preview/ and has its own worker.
  if (!url.pathname.startsWith(scopePath) || url.pathname.startsWith(scopePath + 'preview/')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      return (await cache.match('./index.html')) || fetch(req);
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    return hit || fetch(req);
  })());
});
