// Health Connect (Android app only): reads what Garmin Connect writes there —
// steps, sleep, calories, distance, heart rate, weight… — into daily rows.
// Plugin: @capgo/capacitor-health (window.Capacitor.Plugins.Health).
// What is read and how it becomes one value per day lives in core/metrics.js.
import * as store from '../store.js';
import { plugin } from './native.js';
import { METRICS, readTypes, foldAggregate, foldSamples, mergeDays } from '../core/metrics.js';
import { addDays, dateKey, fromDateKey } from '../core/util.js';
import { fromPlugin, hrStats, prune } from '../core/watch.js';

const { state } = store;
const AUTO_EVERY_MS = 15 * 60 * 1000;
const FIRST_DAYS = 30; // Health Connect allows 30 days back without the history permission
const LATER_DAYS = 7;  // Garmin syncs late, so re-read the last week each time

/** @returns {any|null} */
const hc = () => plugin('Health');

/** Settings saved for this source. */
export const settings = () => state.settings.health || {};
const saveSettings = (patch) => store.setSetting('health', { ...settings(), ...patch });

export const nativeAvailable = () => !!hc();

/** Is Health Connect on this phone? @returns {Promise<{ ok: boolean, reason?: string }>} */
export async function availability() {
  const p = hc();
  if (!p) return { ok: false, reason: 'Only in the Forge Android app' };
  try {
    const r = await p.isAvailable();
    return { ok: !!r.available, reason: r.reason };
  } catch (e) { return { ok: false, reason: String(e?.message || e) }; }
}

/** Ask for read access (Health Connect's own permission screen), then read. */
export async function connect() {
  const p = hc();
  if (!p) throw new Error('Only in the Forge Android app');
  const r = await p.requestAuthorization({ read: readTypes(), write: [], requestHistoryAccess: true });
  const granted = r.readAuthorized || [];
  await saveSettings({ connected: granted.length > 0, granted, history: !!r.historyAccessAuthorized });
  if (!granted.length) return { granted: 0, days: 0, read: [], failed: [] };
  const res = await pull({ days: FIRST_DAYS });
  return { granted: granted.length, ...res };
}

export async function disconnect() {
  await saveSettings({ connected: false });
}

export function openHealthConnect() {
  return hc()?.openHealthConnectSettings().catch(() => {});
}

const localMidnight = (t) => fromDateKey(dateKey(t));

let running = null;

/**
 * Read the last `days` days and save them under daily[date].watch.
 * @param {{ days?: number }} [opt]
 * @returns {Promise<{ days: number, read: string[], failed: string[], workouts?: number }>}
 */
export function pull(opt = {}) {
  if (!running) {
    running = doPull(opt).finally(() => { running = null; store.emit(); });
    store.emit();
  }
  return running;
}

/** Is a read running right now? */
export const reading = () => !!running;

/**
 * Watch workouts in [from, now] (with average / max heart rate) → settings.watchWorkouts.
 * @returns {Promise<number>} how many workouts were found
 */
async function pullWorkouts(p, from, now) {
  const iso = (t) => new Date(t).toISOString();
  const r = await p.queryWorkouts({ startDate: iso(from), endDate: iso(now), limit: 200, ascending: true });
  const known = state.settings.watchWorkouts || {};
  const next = { ...known };
  let n = 0;
  for (const raw of r.workouts || []) {
    const w = fromPlugin(raw);
    if (!w) continue;
    n++;
    const old = known[w.id];
    if (old?.avgHr != null) { next[w.id] = { ...w, avgHr: old.avgHr, maxHr: old.maxHr }; continue; }
    // Heart rate reaches Health Connect late, so try again on later reads until it's there.
    try {
      const hr = await p.readSamples({ dataType: 'heartRate', startDate: iso(w.start), endDate: iso(w.end), limit: 0 });
      Object.assign(w, hrStats(hr.samples));
    } catch { /* no heart-rate access */ }
    next[w.id] = w;
  }
  await store.setSetting('watchWorkouts', prune(next, now));
  return n;
}

/** @param {{ days?: number }} opt */
async function doPull({ days } = {}) {
  const p = hc();
  if (!p) return { days: 0, read: [], failed: [] };
  const now = Date.now();
  const n = days ?? (settings().lastSyncAt ? LATER_DAYS : FIRST_DAYS);
  const from = localMidnight(addDays(now, -(n - 1)));
  const fromKey = dateKey(from);
  const endDate = new Date(now).toISOString();
  const maps = [];
  const read = [];
  const failed = [];
  for (const m of METRICS) {
    try {
      if (m.read === 'aggregate') {
        const r = await p.queryAggregated({ dataType: m.hc, startDate: new Date(from).toISOString(), endDate, bucket: 'day', aggregation: Object.keys(m.out) });
        maps.push(foldAggregate(m, r.samples));
      } else {
        // Sleep that started the evening before the first day still counts for it.
        const start = m.fold === 'sleep' ? from - 12 * 3600 * 1000 : from;
        const r = await p.readSamples({ dataType: m.hc, startDate: new Date(start).toISOString(), endDate, limit: 0 });
        maps.push(foldSamples(m, r.samples));
      }
      read.push(m.id);
    } catch (e) {
      failed.push(m.label);
    }
  }
  const fields = mergeDays(...maps);
  const keysOf = (id) => { const m = METRICS.find((x) => x.id === id); return m.out ? Object.values(m.out) : [m.id]; };
  const replaced = read.flatMap(keysOf);
  const changed = [];
  for (let d = from; d <= now; d = addDays(d, 1)) {
    const date = dateKey(d);
    if (date < fromKey) continue;
    const cur = state.daily[date];
    const watch = { ...(cur?.watch || {}) };
    for (const k of replaced) delete watch[k];
    Object.assign(watch, fields[date] || {});
    const empty = !Object.keys(watch).length;
    if (!cur && empty) continue;
    if (JSON.stringify(watch) === JSON.stringify(cur?.watch || {})) continue;
    const next = { ...(cur || { date }), watch, watchAt: now };
    if (empty) { delete next.watch; delete next.watchAt; }
    changed.push(next);
  }
  await store.saveDailies(changed);
  let workouts;
  try { workouts = await pullWorkouts(p, from, now); } catch { failed.push('Workouts'); }
  await saveSettings({ lastSyncAt: now, lastError: read.length ? null : 'Nothing could be read — check Forge’s access in Health Connect', failed });
  return { days: n, read, failed, workouts };
}

/** Read again when the app opens or comes back, at most every 15 minutes. */
export function autoPull() {
  const s = settings();
  if (!hc() || !s.connected) return;
  if (s.lastSyncAt && Date.now() - s.lastSyncAt < AUTO_EVERY_MS) return;
  pull().catch(() => {});
}

export function startAutoPull() {
  autoPull();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) autoPull(); });
}
