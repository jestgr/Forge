// Effort you didn't record (e.g. chopping wood): found in the all-day heart-rate
// readings Garmin writes to Health Connect (about one every 2 minutes).
// A stretch counts when heart rate stays at or above the effort threshold for
// at least 20 minutes; dips below it of up to 6 minutes don't break it.
// Pure code, tested; the cards reuse the watch-workout ones (core/watch.js).
import { weekStart, addDays } from './util.js';

export const EFFORT = { minMinutes: 20, maxDipMin: 6, reservePct: 0.6, defaultRest: 60, defaultMax: 180, minMax: 160 };
export const EFFORT_TYPE = 'elevatedHeartRate';

/**
 * Effort threshold in bpm: 60 % of heart-rate reserve (Karvonen), unless set by hand.
 * Max heart rate: set by hand, else the highest seen recently (at least 160), else 180.
 * @param {{ restingHr?: number|null, seenMax?: number|null, maxHr?: number|null, threshold?: number|null }} o
 */
export function effortThreshold({ restingHr, seenMax, maxHr, threshold } = {}) {
  const rest = restingHr || EFFORT.defaultRest;
  const max = maxHr || (seenMax ? Math.max(seenMax, EFFORT.minMax) : EFFORT.defaultMax);
  const auto = Math.round(rest + EFFORT.reservePct * (max - rest));
  return { bpm: threshold || auto, auto, rest, max };
}

/**
 * Stretches of raised heart rate.
 * @param {{ t: number, bpm: number }[]} samples any order
 * @param {number} threshold bpm
 * @returns {import('./watch.js').WatchWorkout[]}
 */
export function findEfforts(samples, threshold) {
  const s = (samples || []).filter((x) => x.bpm > 0 && Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
  const out = [];
  let run = null;
  const close = () => {
    if (run && (run.end - run.start) / 60000 >= EFFORT.minMinutes) {
      const inside = s.filter((x) => x.t >= run.start && x.t <= run.end).map((x) => x.bpm);
      out.push({ id: `hr_${run.start}`, type: EFFORT_TYPE, start: run.start, end: run.end, durationSec: Math.round((run.end - run.start) / 1000),
        avgHr: Math.round(inside.reduce((a, b) => a + b, 0) / inside.length), maxHr: Math.max(...inside), source: 'heart rate' });
    }
    run = null;
  };
  for (const x of s) {
    if (x.bpm < threshold) continue;
    if (run && x.t - run.end <= EFFORT.maxDipMin * 60000) run.end = x.t;
    else { close(); run = { start: x.t, end: x.t }; }
  }
  close();
  return out;
}

/** Share of [a0, a1] covered by [b0, b1]. */
const covered = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(1, a1 - a0);

/**
 * Effort cards to show: this week, not mostly inside a session, a watch workout or an ignored stretch.
 * (Choosing one saves a watch session over the same time, so it disappears too.)
 * @param {import('./watch.js').WatchWorkout[]} efforts
 * @param {any[]} sessions
 * @param {Record<string, import('./watch.js').WatchWorkout>} workouts
 * @param {[number, number][]} ignored time ranges
 * @param {number} now
 */
export function pendingEfforts(efforts, sessions, workouts, ignored, now) {
  const from = weekStart(now);
  const to = addDays(from, 7);
  const busy = [
    ...sessions.filter((s) => s.status === 'done').map((s) => [s.startedAt, s.endedAt || s.startedAt]),
    ...Object.values(workouts || {}).map((w) => [w.start, w.end]),
    ...(ignored || []),
  ];
  return (efforts || [])
    .filter((e) => e.start >= from && e.start < to)
    .filter((e) => !busy.some(([b0, b1]) => covered(e.start, e.end, b0, b1) >= 0.5))
    .sort((a, b) => b.start - a.start);
}
