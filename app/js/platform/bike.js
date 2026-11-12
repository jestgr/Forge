// Echelon bike ride: talks to the native EchelonBike plugin (Android app) or the simulator (Settings → Bike
// simulator), decodes with core/bike.js and keeps one ride in memory until it is stopped or cancelled.
// A dropped connection never loses the ride: Forge retries every 5 s for 2 minutes, then offers Reconnect.
import { plugin } from './native.js';
import { keepAwake, allowSleep } from './wakelock.js';
import { createRide, decodeEchelon, ECHELON_INIT, echelonCommand } from '../core/bike.js';
import { createBikeSim } from './bikesim.js';
import { state } from '../store.js';

export const timing = {
  /** If the bike goes quiet this long while connected, ask it to start sending again. */
  quietMs: 10_000,
  /** Wait between reconnect attempts. */
  retryMs: 5_000,
  /** Give up retrying (show Reconnect) after this long. */
  retryForMs: 120_000,
  /** Simulator: real ms per simulated second. */
  simTickMs: 1000,
};

const ONE_CONNECTION = 'If the Echelon app is open on any phone or tablet, close it: the bike takes one connection at a time.';

/**
 * @typedef {{ itemId: string, status: 'scanning'|'connecting'|'connected'|'reconnecting'|'failed',
 *   name?: string, error?: string, lostAt?: number|null, ride: ReturnType<typeof createRide>,
 *   startedAt: number, lastDataAt: number, sim: boolean }} BikeRide
 */
/** @type {BikeRide|null} */
let current = null;
/** @type {any[]} */
let handles = [];
let watchdog = /** @type {any} */ (null);
let retryTimer = /** @type {any} */ (null);
/** @type {ReturnType<typeof createBikeSim>|null} */
let sim = null;
/** @type {Set<() => void>} */
const listeners = new Set();

const simOn = () => !!state.settings?.bikeSim;
/** The plugin in use: simulator when switched on, else the native one (Android app only). */
function bike() {
  if (simOn()) return (sim ||= createBikeSim({ tickMs: timing.simTickMs }));
  return plugin('EchelonBike');
}

export const bikeAvailable = () => simOn() || !!plugin('EchelonBike');
/** The ride in progress, if any. */
export const bikeRide = () => current;
/** Simulator only: drop the connection to test reconnecting. */
export const simDrop = () => { if (current?.sim) sim?.drop(); };
/** Called after every change (new data, status). @param {() => void} fn */
export function onBikeChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const changed = () => { for (const fn of listeners) fn(); };

const send = (/** @type {Uint8Array} */ b) => bike()?.write({ value: [...b] }).catch(() => {});
const message = (/** @type {any} */ e) => e?.message || String(e);

/**
 * Find the bike, connect and start recording for cardio item `itemId`.
 * @param {string} itemId
 */
export async function startRide(itemId) {
  const p = bike();
  if (!p) throw new Error('The bike connection needs the Forge Android app (or turn on Bike simulator in Settings).');
  if (current) await cancelRide();
  const ride = /** @type {BikeRide} */ ({ itemId, status: 'scanning', ride: createRide(), startedAt: Date.now(), lastDataAt: Date.now(), sim: simOn() });
  current = ride;
  keepAwake('bike');
  changed();
  handles = await Promise.all([
    p.addListener('data', (/** @type {{ value: number[] }} */ e) => {
      if (current !== ride) return;
      ride.lastDataAt = Date.now();
      const r = decodeEchelon(Uint8Array.from(e.value));
      if (r) { ride.ride.add(r, ride.lastDataAt); changed(); }
    }),
    p.addListener('state', (/** @type {{ state: string, name?: string, error?: string }} */ e) => {
      if (current !== ride) return;
      if (e.name) ride.name = e.name;
      if (e.state === 'disconnected' && ride.status === 'connected') lost(ride);
      else if (ride.status !== 'reconnecting' && (e.state === 'scanning' || e.state === 'connecting')) ride.status = /** @type {any} */ (e.state);
      changed();
    }),
  ]);
  if (current !== ride) return;
  if (!(await connectOnce(ride))) { ride.status = 'failed'; changed(); }
}

/** One connect attempt; on success the bike is told to start sending. */
async function connectOnce(/** @type {BikeRide} */ ride) {
  try {
    const res = await bike().connect();
    if (current !== ride) return false;
    ride.status = 'connected';
    ride.lostAt = null;
    ride.error = undefined;
    ride.name = res?.name || ride.name;
    for (const cmd of ECHELON_INIT) await send(cmd);
    ride.lastDataAt = Date.now();
    startWatchdog(ride);
    changed();
    return true;
  } catch (e) {
    if (current === ride) ride.error = `${message(e)}. ${ONE_CONNECTION}`;
    return false;
  }
}

function startWatchdog(/** @type {BikeRide} */ ride) {
  clearInterval(watchdog);
  watchdog = setInterval(() => {
    if (current === ride && ride.status === 'connected' && Date.now() - ride.lastDataAt > timing.quietMs) {
      ride.lastDataAt = Date.now();
      send(echelonCommand(0xb0, [0x01]));
    }
  }, timing.quietMs / 2);
}

/** Connection dropped mid-ride: keep the ride, retry quietly for a while. */
function lost(/** @type {BikeRide} */ ride) {
  ride.status = 'reconnecting';
  ride.lostAt = Date.now();
  clearTimeout(retryTimer);
  const attempt = async () => {
    if (current !== ride || ride.status !== 'reconnecting') return;
    if (await connectOnce(ride)) return;
    if (current !== ride) return;
    if (Date.now() - /** @type {number} */ (ride.lostAt) >= timing.retryForMs) { ride.status = 'failed'; changed(); return; }
    retryTimer = setTimeout(attempt, timing.retryMs);
  };
  retryTimer = setTimeout(attempt, timing.retryMs);
}

/** Reconnect by hand (after "failed"), keeping what was recorded. */
export async function reconnect() {
  const ride = current;
  if (!ride) return;
  ride.status = 'scanning';
  ride.error = undefined;
  changed();
  if (!(await connectOnce(ride)) && current === ride) { ride.status = 'failed'; changed(); }
}

async function close() {
  clearInterval(watchdog);
  clearTimeout(retryTimer);
  watchdog = retryTimer = null;
  for (const h of handles) await h?.remove?.();
  handles = [];
  await bike()?.disconnect().catch(() => {});
  sim = null;
  allowSleep('bike');
}

/** Stop and return what was recorded (the caller saves it). */
export async function stopRide() {
  const ride = current;
  current = null;
  await close();
  changed();
  return ride ? { itemId: ride.itemId, summary: ride.ride.summary(), series: ride.ride.series() } : null;
}

/** Stop and throw the ride away. */
export async function cancelRide() {
  current = null;
  await close();
  changed();
}
