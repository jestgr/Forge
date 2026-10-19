// Watch / health metrics: what Forge reads from Health Connect and how raw
// readings become one value per day. Pure code (no plugin calls) so it is tested.
//
// Adding a metric (e.g. a new watch measures more): add one entry to METRICS.
// `hc` is the plugin's data type name (see @capgo/capacitor-health HealthDataType).
//   read: 'aggregate' → Health Connect sums/averages per day itself (and removes
//                       duplicates between apps). `out` maps aggregation → field.
//   read: 'samples'   → raw readings, folded per day by `fold`:
//         'sum'   total per app, the app with the biggest total wins (no double counting)
//         'last'  latest reading of the day      'avg' mean of the day
//         'sleep' minutes asleep, counted on the day you woke up
// Values are stored in base units (kg, m, kcal, min, bpm, %, ms) under daily[date].watch.
import { dateKey, fmtNum, fmtMinutes } from './util.js';

const KG_TO_LB = 2.20462;
const M_TO_MI = 1 / 1609.344;

/**
 * @typedef {{ id: string, label: string, hc: string, read: 'aggregate'|'samples',
 *   out?: Record<string, string>, fold?: 'sum'|'last'|'avg'|'sleep',
 *   show?: (v: number) => string, dashboard?: boolean }} Metric
 */

/** @type {Metric[]} */
export const METRICS = [
  { id: 'steps', label: 'Steps', hc: 'steps', read: 'aggregate', out: { sum: 'steps' }, show: (v) => fmtNum(Math.round(v)) },
  { id: 'sleepMin', label: 'Sleep', hc: 'sleep', read: 'samples', fold: 'sleep', show: (v) => fmtMinutes(v), dashboard: true },
  { id: 'activeKcal', label: 'Active calories', hc: 'calories', read: 'aggregate', out: { sum: 'activeKcal' }, show: (v) => `${fmtNum(Math.round(v))} kcal`, dashboard: true },
  { id: 'totalKcal', label: 'Total calories', hc: 'totalCalories', read: 'samples', fold: 'sum', show: (v) => `${fmtNum(Math.round(v))} kcal` },
  { id: 'distanceM', label: 'Distance', hc: 'distance', read: 'aggregate', out: { sum: 'distanceM' }, show: (v) => `${(v * M_TO_MI).toFixed(1)} mi`, dashboard: true },
  { id: 'restingHr', label: 'Resting heart rate', hc: 'restingHeartRate', read: 'samples', fold: 'last', show: (v) => `${Math.round(v)} bpm`, dashboard: true },
  { id: 'hr', label: 'Heart rate', hc: 'heartRate', read: 'aggregate', out: { average: 'hrAvg', min: 'hrMin', max: 'hrMax' } },
  { id: 'hrvMs', label: 'HRV (RMSSD)', hc: 'heartRateVariability', read: 'samples', fold: 'avg', show: (v) => `${Math.round(v)} ms`, dashboard: true },
  { id: 'weightKg', label: 'Weight', hc: 'weight', read: 'samples', fold: 'last', show: (v) => `${(v * KG_TO_LB).toFixed(1)} lb` },
  { id: 'bodyFatPct', label: 'Body fat', hc: 'bodyFat', read: 'samples', fold: 'last', show: (v) => `${v.toFixed(1)} %` },
];

/** Extra permission asked for now, used later for watch workouts. */
export const EXTRA_READ = ['workouts'];

/** Every plugin data type Forge asks to read. */
export const readTypes = () => [...new Set(METRICS.map((m) => m.hc)), ...EXTRA_READ];

/** Fields that show as rows (heart rate splits into three). */
export const FIELDS = [
  ...METRICS.filter((m) => m.id !== 'hr').map((m) => ({ key: m.id, label: m.label, show: m.show, dashboard: !!m.dashboard })),
  { key: 'hrAvg', label: 'Avg heart rate', show: (v) => `${Math.round(v)} bpm`, dashboard: false },
  { key: 'hrMax', label: 'Max heart rate', show: (v) => `${Math.round(v)} bpm`, dashboard: false },
];

/** Date of a bucket/sample: the local day its middle falls on (safe across DST). */
const dayOf = (startIso, endIso) => {
  const a = Date.parse(startIso);
  const b = Date.parse(endIso || startIso);
  return dateKey(a + (b - a) / 2);
};

/**
 * Aggregated day buckets → { date: { field: value } }.
 * @param {Metric} m
 * @param {{ startDate: string, endDate: string, value: number, values?: Record<string, number> }[]} buckets
 */
export function foldAggregate(m, buckets) {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const b of buckets || []) {
    const date = dayOf(b.startDate, b.endDate);
    for (const [agg, field] of Object.entries(m.out || {})) {
      const v = b.values?.[agg] ?? (Object.keys(m.out).length === 1 ? b.value : undefined);
      if (Number.isFinite(v) && v > 0) (out[date] ||= {})[field] = v;
    }
  }
  return out;
}

/** Minutes asleep in one sleep sample (awake stages left out). */
export function asleepMinutes(s) {
  if (s.stages?.length) return s.stages.filter((x) => x.stage !== 'awake').reduce((t, x) => t + (x.durationMinutes || 0), 0);
  return s.value || 0;
}

/**
 * Raw samples → { date: { field: value } }.
 * @param {Metric} m
 * @param {{ value: number, startDate: string, endDate?: string, sourceId?: string, stages?: any[] }[]} samples
 */
export function foldSamples(m, samples) {
  /** @type {Record<string, any[]>} */
  const byDay = {};
  for (const s of samples || []) {
    if (!Number.isFinite(s.value)) continue;
    // Sleep belongs to the morning you woke up; everything else to its own day.
    const date = m.fold === 'sleep' ? dateKey(Date.parse(s.endDate || s.startDate)) : dayOf(s.startDate, s.endDate);
    (byDay[date] ||= []).push(s);
  }
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const [date, list] of Object.entries(byDay)) {
    let v;
    if (m.fold === 'last') v = list.reduce((a, b) => (Date.parse(b.startDate) > Date.parse(a.startDate) ? b : a)).value;
    else if (m.fold === 'avg') v = list.reduce((t, s) => t + s.value, 0) / list.length;
    else {
      // sum / sleep: total per app, take the biggest so two apps don't double count.
      const per = {};
      for (const s of list) per[s.sourceId || '?'] = (per[s.sourceId || '?'] || 0) + (m.fold === 'sleep' ? asleepMinutes(s) : s.value);
      v = Math.max(...Object.values(per));
    }
    if (Number.isFinite(v) && v > 0) out[date] = { [m.id]: v };
  }
  return out;
}

/** Merge several { date: fields } maps. */
export function mergeDays(...maps) {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const map of maps) for (const [d, f] of Object.entries(map)) out[d] = { ...(out[d] || {}), ...f };
  return out;
}

// ---------- reading a day (typed by hand wins over the watch) ----------
/** @param {import('./model.js').Daily|undefined} d */
export function stepsOf(d) {
  return d?.steps ?? d?.watch?.steps ?? 0;
}
/** Sleep in hours (typed or from the watch), or null. */
export function sleepHoursOf(d) {
  if (d?.sleepHours != null) return d.sleepHours;
  const m = d?.watch?.sleepMin;
  return m ? Math.round((m / 60) * 4) / 4 : null;
}
