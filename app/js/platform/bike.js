// Echelon bike ride: talks to the native EchelonBike plugin (Android app only), decodes with core/bike.js and
// keeps one ride in memory until it is saved into a cardio item or cancelled. Browser: not available.
import { plugin } from './native.js';
import { keepAwake, allowSleep } from './wakelock.js';
import { createRide, decodeEchelon, ECHELON_INIT, echelonCommand } from '../core/bike.js';

/** If the bike goes quiet this long, ask it to start sending again. */
const QUIET_MS = 10_000;

/**
 * @typedef {{ itemId: string, status: 'scanning'|'connecting'|'connected'|'lost'|'failed', name?: string,
 *   error?: string, ride: ReturnType<typeof createRide>, startedAt: number, lastDataAt: number }} BikeRide
 */
/** @type {BikeRide|null} */
let current = null;
/** @type {any[]} */
let handles = [];
let watchdog = /** @type {any} */ (null);
/** @type {Set<() => void>} */
const listeners = new Set();

export const bikeAvailable = () => !!plugin('EchelonBike');
/** The ride in progress (or connecting / failed), if any. */
export const bikeRide = () => current;
/** Called after every change (new data, status). @param {() => void} fn */
export function onBikeChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const changed = () => { for (const fn of listeners) fn(); };

const send = (/** @type {Uint8Array} */ b) => plugin('EchelonBike')?.write({ value: [...b] }).catch(() => {});

/**
 * Find the bike, connect and start recording for cardio item `itemId`.
 * @param {string} itemId
 * @param {() => number} [now]
 */
export async function startRide(itemId, now = Date.now) {
  const p = plugin('EchelonBike');
  if (!p) throw new Error('Bike needs the Forge Android app');
  if (current) await cancelRide();
  const ride = /** @type {BikeRide} */ ({ itemId, status: 'scanning', ride: createRide(), startedAt: now(), lastDataAt: now() });
  current = ride;
  keepAwake('bike');
  changed();
  handles = await Promise.all([
    p.addListener('data', (/** @type {{ value: number[] }} */ e) => {
      if (current !== ride) return;
      ride.lastDataAt = now();
      const r = decodeEchelon(Uint8Array.from(e.value));
      if (r) { ride.ride.add(r, ride.lastDataAt); changed(); }
    }),
    p.addListener('state', (/** @type {{ state: string, name?: string, error?: string }} */ e) => {
      if (current !== ride) return;
      if (e.state === 'disconnected' && ride.status === 'connected') ride.status = 'lost';
      else if (e.state === 'scanning' || e.state === 'connecting' || e.state === 'connected') ride.status = /** @type {any} */ (e.state);
      if (e.name) ride.name = e.name;
      changed();
    }),
  ]);
  try {
    const res = await p.connect();
    if (current !== ride) return;
    ride.status = 'connected';
    ride.name = res?.name || ride.name;
    for (const cmd of ECHELON_INIT) await send(cmd);
    ride.lastDataAt = now();
    clearInterval(watchdog);
    watchdog = setInterval(() => {
      if (current === ride && ride.status === 'connected' && now() - ride.lastDataAt > QUIET_MS) {
        ride.lastDataAt = now();
        send(echelonCommand(0xb0, [0x01]));
      }
    }, QUIET_MS / 2);
  } catch (e) {
    if (current !== ride) return;
    ride.status = 'failed';
    ride.error = /** @type {any} */ (e)?.message || String(e);
  }
  changed();
}

/** Try connecting again after "failed" / "lost", keeping what was recorded. */
export async function reconnect() {
  const ride = current;
  const p = plugin('EchelonBike');
  if (!ride || !p) return;
  ride.status = 'scanning';
  ride.error = undefined;
  changed();
  try {
    await p.connect();
    if (current !== ride) return;
    ride.status = 'connected';
    for (const cmd of ECHELON_INIT) await send(cmd);
  } catch (e) {
    if (current !== ride) return;
    ride.status = 'failed';
    ride.error = /** @type {any} */ (e)?.message || String(e);
  }
  changed();
}

async function close() {
  clearInterval(watchdog);
  watchdog = null;
  for (const h of handles) await h?.remove?.();
  handles = [];
  await plugin('EchelonBike')?.disconnect().catch(() => {});
  allowSleep('bike');
}

/** Stop and return what was recorded (the caller saves it). */
export async function stopRide() {
  const ride = current;
  current = null;
  await close();
  changed();
  return ride ? { itemId: ride.itemId, summary: ride.ride.summary() } : null;
}

/** Stop and throw the ride away. */
export async function cancelRide() {
  current = null;
  await close();
  changed();
}
