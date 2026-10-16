// Keep the screen on while a session or interval runner is open.
// Chrome drops the lock when the app is hidden; we take it again on return.
// In the Android app the native KeepAwake plugin is used instead.
import { plugin } from './native.js';

const reasons = new Set();
/** @type {any} */
let sentinel = null;

async function acquire() {
  const native = plugin('KeepAwake');
  if (native) { if (reasons.size) native.keepAwake().catch(() => {}); return; }
  if (!reasons.size || sentinel || document.hidden || !('wakeLock' in navigator)) return;
  try {
    sentinel = await /** @type {any} */ (navigator).wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch { sentinel = null; }
}

export function keepAwake(reason) { reasons.add(reason); acquire(); }

export function allowSleep(reason) {
  reasons.delete(reason);
  const native = plugin('KeepAwake');
  if (native) { if (!reasons.size) native.allowSleep().catch(() => {}); return; }
  if (!reasons.size && sentinel) { sentinel.release().catch(() => {}); sentinel = null; }
}

export const supported = () => !!plugin('KeepAwake') || 'wakeLock' in navigator;

document.addEventListener('visibilitychange', () => { if (!document.hidden) acquire(); });
