// Small pure helpers: ids, dates (local time), formatting, seeded random.

export function uid(prefix = '') {
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${r}`;
}

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date as 'YYYY-MM-DD'. @param {number|Date} t */
export function dateKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → local midnight (ms). */
export function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Start of the week (Sunday 00:00 local) containing t. */
export function weekStart(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

/** Same local time n days later (DST-safe). */
export function addDays(t, n) {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** 75 → "1:15", 3725 → "1:02:05" */
export function fmtClock(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}

/** Minutes, rounded: "42 min", "1 h 5 min" */
export function fmtMinutes(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

/** @param {number} t @param {Intl.DateTimeFormatOptions} [opts] */
export function fmtDate(t, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Date(t).toLocaleDateString(undefined, opts);
}

export function fmtNum(n) { return (n ?? 0).toLocaleString(); }

/** Seeded PRNG (mulberry32) → () => [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "8-12" → 10, "12" → 12, 10 → 10, else null */
export function repsNumber(reps) {
  if (typeof reps === 'number' && isFinite(reps)) return reps;
  if (typeof reps !== 'string') return null;
  const nums = reps.match(/\d+(\.\d+)?/g)?.map(Number) || [];
  if (!nums.length) return null;
  return nums.length > 1 ? (nums[0] + nums[1]) / 2 : nums[0];
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Positive finite number or undefined. */
export function pos(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && isFinite(n) && n > 0 ? n : undefined;
}

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
