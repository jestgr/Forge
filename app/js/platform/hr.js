// Live heart rate during a bike ride: the native HeartRate plugin (Android app; a Garmin watch with
// "Broadcast Heart Rate" on, or a chest strap) or the simulator (Settings → Bike simulator).
// The device is remembered (settings.hrDevice) so the next ride reconnects straight to it, and heart rate
// connects on its own when a ride starts once it has worked before. A lost link retries every 5 s for 2 minutes.
import { plugin } from './native.js';
import { createHrSim } from './bikesim.js';
import { decodeHr } from '../core/hr.js';
import { state, setSetting } from '../store.js';

export const hrTiming = {
  retryMs: 5_000,
  retryForMs: 120_000,
  /** No reading for this long → heart rate shown as "–" (watch stopped broadcasting, out of range). */
  staleMs: 5_000,
  simTickMs: 1000,
};

/**
 * @typedef {{ status: 'scanning'|'connecting'|'connected'|'reconnecting'|'failed', name?: string, error?: string,
 *   bpm: number|null, lastAt: number, lostAt: number|null, sim: boolean }} HrLink
 */
/** @type {HrLink|null} */
let link = null;
/** @type {any[]} */
let handles = [];
let retryTimer = /** @type {any} */ (null);
let staleTimer = /** @type {any} */ (null);
/** @type {ReturnType<typeof createHrSim>|null} */
let sim = null;
/** @type {{ onBpm: (bpm: number|null) => void, changed: () => void }|null} */
let hooks = null;

const simOn = () => !!state.settings?.bikeSim;
function hr() {
  if (simOn()) return (sim ||= createHrSim({ tickMs: hrTiming.simTickMs }));
  return plugin('HeartRate');
}
const message = (/** @type {any} */ e) => e?.message || String(e);

export const hrAvailable = () => simOn() || !!plugin('HeartRate');
/** The heart-rate link of the ride in progress, if any. */
export const hrLink = () => link;
/** Connect on its own when a ride starts? (after it has worked once, until switched off) */
export const hrAuto = () => hrAvailable() && !!state.settings?.hrDevice && state.settings?.hrAuto !== false;
/** Simulator only: stop broadcasting to test reconnecting. */
export const simHrDrop = () => { if (link?.sim) sim?.drop(); };

/**
 * Start heart rate for the ride in progress. `onBpm` gets every reading (null when it goes stale or is lost).
 * @param {{ onBpm: (bpm: number|null) => void, changed: () => void }} h
 */
export async function startHr(h) {
  const p = hr();
  if (!p) return;
  await stopHr();
  hooks = h;
  const me = /** @type {HrLink} */ ({ status: 'scanning', bpm: null, lastAt: 0, lostAt: null, sim: simOn() });
  link = me;
  h.changed();
  handles = await Promise.all([
    p.addListener('data', (/** @type {{ value: number[] }} */ e) => {
      if (link !== me) return;
      const bpm = decodeHr(e.value);
      if (bpm == null) return;
      me.lastAt = Date.now();
      me.bpm = bpm;
      hooks?.onBpm(bpm);
    }),
    p.addListener('state', (/** @type {{ state: string, name?: string }} */ e) => {
      if (link !== me) return;
      if (e.name) me.name = e.name;
      if (e.state === 'disconnected' && me.status === 'connected') lost(me);
      else if (me.status !== 'reconnecting' && (e.state === 'scanning' || e.state === 'connecting')) me.status = /** @type {any} */ (e.state);
      hooks?.changed();
    }),
  ]);
  if (link !== me) return;
  clearInterval(staleTimer);
  staleTimer = setInterval(() => {
    if (link === me && me.bpm != null && Date.now() - me.lastAt > hrTiming.staleMs) { me.bpm = null; hooks?.onBpm(null); }
  }, 1000);
  if (!(await connectOnce(me))) { me.status = 'failed'; hooks?.changed(); }
}

async function connectOnce(/** @type {HrLink} */ me) {
  try {
    const remembered = state.settings?.hrDevice;
    const res = await hr().connect(remembered?.address && !me.sim ? { address: remembered.address } : {});
    if (link !== me) return false;
    me.status = 'connected';
    me.lostAt = null;
    me.error = undefined;
    me.name = res?.name || me.name;
    if (!me.sim && res?.address) await setSetting('hrDevice', { address: res.address, name: me.name || '' });
    else if (me.sim && !state.settings?.hrDevice) await setSetting('hrDevice', { address: 'SIM', name: 'HR-SIM' });
    hooks?.changed();
    return true;
  } catch (e) {
    if (link === me) me.error = message(e);
    return false;
  }
}

function lost(/** @type {HrLink} */ me) {
  me.status = 'reconnecting';
  me.lostAt = Date.now();
  me.bpm = null;
  hooks?.onBpm(null);
  clearTimeout(retryTimer);
  const attempt = async () => {
    if (link !== me || me.status !== 'reconnecting') return;
    if (await connectOnce(me)) return;
    if (link !== me) return;
    if (Date.now() - /** @type {number} */ (me.lostAt) >= hrTiming.retryForMs) { me.status = 'failed'; hooks?.changed(); return; }
    retryTimer = setTimeout(attempt, hrTiming.retryMs);
  };
  retryTimer = setTimeout(attempt, hrTiming.retryMs);
}

/** Connect again by hand (after "failed"). */
export async function reconnectHr() {
  const me = link;
  if (!me) return;
  me.status = 'scanning';
  me.error = undefined;
  hooks?.changed();
  if (!(await connectOnce(me)) && link === me) { me.status = 'failed'; hooks?.changed(); }
}

/** Disconnect heart rate (ride stopped, or switched off). */
export async function stopHr() {
  const had = link;
  link = null;
  clearTimeout(retryTimer);
  clearInterval(staleTimer);
  retryTimer = staleTimer = null;
  for (const h of handles) await h?.remove?.();
  handles = [];
  if (had) await hr()?.disconnect().catch(() => {});
  sim = null;
  const h = hooks;
  hooks = null;
  if (had) h?.changed();
}
