// Forge boot: open the database, load data, route between screens,
// keep the service worker up to date (with a banner, never a surprise reload).
import { VERSION } from './version.js';
import * as store from './store.js';
import { persist, dbName } from './platform/db.js';
import { h, icon, refreshSheets, toast } from './ui/dom.js';
import * as dashboard from './ui/dashboard.js';
import * as library from './ui/library.js';
import * as history from './ui/history.js';
import * as settings from './ui/settings.js';
import { ensureData } from './setup.js';

/** Routes: hash → screen module with render(root). */
const ROUTES = {
  '': dashboard,
  library,
  history,
  settings,
};
const NAV = [
  ['', 'Today', 'home'],
  ['library', 'Library', 'list'],
  ['history', 'History', 'clock'],
  ['settings', 'Settings', 'gear'],
];

const screenEl = /** @type {HTMLElement} */ (document.getElementById('screen'));
const navEl = /** @type {HTMLElement} */ (document.getElementById('nav'));

export function route() {
  return location.hash.replace(/^#\/?/, '').split('/')[0];
}

let lastRoute = null;
function render() {
  const r = route();
  const mod = ROUTES[r] || dashboard;
  const keepScroll = r === lastRoute;
  const y = window.scrollY;
  screenEl.replaceChildren();
  mod.render(screenEl);
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  lastRoute = r;
  navEl.replaceChildren(...NAV.map(([hash, text, ic]) => h('a', {
    href: `#/${hash}`, 'aria-current': (ROUTES[r] ? r : '') === hash ? 'page' : null,
  }, icon(/** @type {any} */ (ic)), text)));
  refreshSheets();
}

// ---------- service worker updates ----------
function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  let asked = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (asked && !reloading) { reloading = true; location.reload(); }
  });
  const offer = (worker) => {
    document.querySelector('.banner')?.remove();
    const bar = h('div', { class: 'banner', role: 'status' },
      h('span', null, 'Update ready'),
      h('button', { class: 'btn', onclick: () => { asked = true; worker.postMessage('skipWaiting'); bar.remove(); } }, 'Reload'));
    document.body.append(bar);
  };
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
    // Check for updates when the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch((e) => console.warn('SW registration failed', e));
}

async function boot() {
  if (dbName() !== 'forge') document.body.classList.add('is-preview');
  try {
    await store.load();
  } catch (e) {
    screenEl.replaceChildren(h('div', { class: 'card stack' },
      h('h2', null, 'Could not open storage'),
      h('p', { class: 'muted' }, String(e?.message || e)),
      h('button', { class: 'btn', onclick: () => location.reload() }, 'Try again')));
    return;
  }
  let message = null;
  try { message = await ensureData(); } catch (e) { console.error('setup failed', e); toast('Could not bring over old data: ' + (e?.message || e), 6000); }
  store.subscribe(render);
  window.addEventListener('hashchange', render);
  render();
  if (message) toast(message, 6000);
  setupServiceWorker();
  persist().then((ok) => store.state.settings.persisted !== ok && store.setSetting('persisted', ok));
}

/** Expose for debugging in the browser console. */
Object.assign(window, { forge: { store, VERSION, dbName, toast } });

boot();
