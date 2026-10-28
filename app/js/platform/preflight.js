// Hands the Preflight summary (core/share.js) to the Android shell, which keeps it for Preflight to read
// (PreflightSharePlugin → SummaryProvider). Browser: nothing to do. Runs after each data change, at most
// every few seconds, and only when the summary actually changed.
import { plugin } from './native.js';
import { state } from '../store.js';
import { preflightSummary } from '../core/share.js';

const WAIT_MS = 3000;
let timer = /** @type {any} */ (null);
let lastJson = '';

/** Publish now (skips if nothing changed). Errors are logged, never shown: Preflight is a nice-to-have. */
export async function publishNow() {
  const p = plugin('PreflightShare');
  if (!p) return;
  const { updatedAt, ...rest } = preflightSummary(state.sessions, state.daily, state.settings, Date.now());
  const key = JSON.stringify(rest);
  if (key === lastJson) return;
  try {
    await p.publish({ json: JSON.stringify({ updatedAt, ...rest }) });
    lastJson = key;
  } catch (e) {
    console.warn('Preflight share failed', e);
  }
}

/** Store listener: publish a few seconds after the last change. */
export function schedulePublish() {
  if (!plugin('PreflightShare')) return;
  clearTimeout(timer);
  timer = setTimeout(publishNow, WAIT_MS);
}
