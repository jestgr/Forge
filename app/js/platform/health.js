// Health data sources (steps, sleep, heart-rate-detected activities).
// Today only "manual" exists. A future source (e.g. a file written by a
// homelab job that pulls Garmin Connect data) plugs in here — see docs/HEALTH-DATA.md.
import * as store from '../store.js';

/** @typedef {import('../core/model.js').Daily} Daily */
/**
 * An activity a source noticed (e.g. long elevated heart rate while chopping wood).
 * @typedef {{ id: string, start: number, end: number, type?: string, avgHr?: number, maxHr?: number, source: string }} DetectedActivity
 */
/**
 * @typedef {{ id: string, name: string,
 *   getDaily: (fromDate: string, toDate: string) => Promise<Daily[]>,
 *   getActivities?: (from: number, to: number) => Promise<DetectedActivity[]> }} HealthSource
 */

/** @type {HealthSource} */
export const manualSource = {
  id: 'manual',
  name: 'Entered by hand',
  async getDaily(from, to) {
    return Object.values(store.state.daily).filter((d) => d.date >= from && d.date <= to);
  },
};

/** @type {HealthSource[]} */
export const sources = [manualSource];

/**
 * Save values for one day, keeping fields not given. Empty / 0 clears a field.
 * @param {string} date YYYY-MM-DD
 * @param {{ steps?: number|null, sleepHours?: number|null }} fields
 * @param {string} [source]
 */
export async function setDaily(date, fields, source = 'manual') {
  const cur = store.state.daily[date] || { date };
  const next = { ...cur, source };
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (v === null || !(Number(v) > 0)) delete next[k]; else next[k] = Number(v);
  }
  await store.saveDaily(next);
}
