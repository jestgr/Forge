// Workouts recorded by the watch (Health Connect "exercise sessions"):
// shown on Today as cards; Jeff picks what each counts as (Zone 2 / HIIT /
// Heavy) or ignores it. A choice becomes a session of kind 'watch'.
import { weekStart, addDays } from './util.js';

/**
 * A watch workout as Forge keeps it (settings.watchWorkouts, by id).
 * @typedef {{ id: string, type: string, start: number, end: number, durationSec: number,
 *   kcal?: number|null, distanceM?: number|null, avgHr?: number|null, maxHr?: number|null, source?: string }} WatchWorkout
 * @typedef {'zone2'|'hiit'|'heavy'} WatchChoice
 */

const STRENGTH = ['strengthTraining', 'traditionalStrengthTraining', 'functionalStrengthTraining', 'weightlifting', 'calisthenics', 'coreTraining'];
const HIIT = ['highIntensityIntervalTraining', 'bootCamp', 'burpee', 'jumpRope'];
const NOT_CARDIO = [...STRENGTH, 'yoga', 'pilates', 'flexibility', 'stretching', 'mindAndBody', 'meditation', 'guidedBreathing', 'cooldown', 'preparationAndRecovery', 'taiChi', 'other'];

/** "runningTreadmill" → "Running treadmill". */
export function workoutLabel(type) {
  if (!type || type === 'other') return 'Workout';
  const words = type.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words[0].toUpperCase() + words.slice(1);
}

export const isCardioType = (type) => !NOT_CARDIO.includes(type);

/** Plugin result → WatchWorkout (null if unusable). */
export function fromPlugin(w) {
  const start = Date.parse(w.startDate);
  const end = Date.parse(w.endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return {
    id: String(w.platformId || `${w.workoutType}_${start}`),
    type: w.workoutType || 'other',
    start, end,
    durationSec: Math.round(w.duration || (end - start) / 1000),
    kcal: w.totalEnergyBurned ?? null,
    distanceM: w.totalDistance ?? null,
    source: w.sourceName || w.sourceId || '',
  };
}

/** Average and max of heart-rate samples. @param {{ value: number }[]} samples */
export function hrStats(samples) {
  const v = (samples || []).map((s) => s.value).filter((x) => x > 0);
  if (!v.length) return { avgHr: null, maxHr: null };
  return { avgHr: Math.round(v.reduce((a, b) => a + b, 0) / v.length), maxHr: Math.max(...v) };
}

/** Forge session (not a watch one) that overlaps this workout, if any. */
export function overlapping(w, sessions) {
  return sessions.find((s) => s.kind !== 'watch' && s.status === 'done' && s.startedAt < w.end && (s.endedAt || s.startedAt) > w.start) || null;
}

/**
 * Suggested choice, or null (= Ignore).
 * @param {WatchWorkout} w @param {any[]} sessions
 * @returns {WatchChoice|null}
 */
export function suggest(w, sessions = []) {
  if (overlapping(w, sessions)) return null; // already logged in Forge
  if (STRENGTH.includes(w.type)) return 'heavy';
  if (HIIT.includes(w.type)) return 'hiit';
  if (isCardioType(w.type) && w.durationSec >= 20 * 60) return 'zone2';
  return null;
}

export const sessionId = (w) => 'w_' + w.id;

/**
 * Workouts still waiting for a choice: this week (Sun–Sat), not chosen, not ignored.
 * @param {Record<string, WatchWorkout>} all @param {any[]} sessions @param {string[]} ignored @param {number} now
 */
export function pending(all, sessions, ignored, now) {
  const from = weekStart(now);
  const to = addDays(from, 7);
  const have = new Set(sessions.map((s) => s.id));
  return Object.values(all || {})
    .filter((w) => w.start >= from && w.start < to && !have.has(sessionId(w)) && !(ignored || []).includes(w.id))
    .sort((a, b) => b.start - a.start);
}

/**
 * The session saved when Jeff picks what a watch workout counts as.
 * @param {WatchWorkout} w @param {WatchChoice} choice
 */
export function toSession(w, choice) {
  return {
    id: sessionId(w), kind: /** @type {'watch'} */ ('watch'), name: workoutLabel(w.type), split: null, includeCardio: false, equipment: null,
    startedAt: w.start, endedAt: w.end, pausedMs: 0, status: /** @type {'done'} */ ('done'), source: /** @type {'watch'} */ ('watch'),
    sections: [], creditOverride: null,
    watch: { ...w, counts: { heavy: choice === 'heavy', zone2: choice === 'zone2', hiit: choice === 'hiit' } },
  };
}

/** Keep only workouts that started within `days` days. @param {Record<string, WatchWorkout>} all */
export function prune(all, now, days = 35) {
  const cut = now - days * 86400000;
  return Object.fromEntries(Object.entries(all || {}).filter(([, w]) => w.start >= cut));
}
