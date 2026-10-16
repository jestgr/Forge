// Keep the screen on while a session or interval runner is open.
// Chrome drops the lock when the app is hidden; we take it again on return.

const reasons = new Set();
/** @type {any} */
let sentinel = null;

async function acquire() {
  if (!reasons.size || sentinel || document.hidden || !('wakeLock' in navigator)) return;
  try {
    sentinel = await /** @type {any} */ (navigator).wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch { sentinel = null; }
}

export function keepAwake(reason) { reasons.add(reason); acquire(); }

export function allowSleep(reason) {
  reasons.delete(reason);
  if (!reasons.size && sentinel) { sentinel.release().catch(() => {}); sentinel = null; }
}

export const supported = () => 'wakeLock' in navigator;

document.addEventListener('visibilitychange', () => { if (!document.hidden) acquire(); });
