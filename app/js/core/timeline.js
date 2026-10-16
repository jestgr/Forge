// Interval scripts (4×4, fallback): where are we at a given time? Pure.

/** @typedef {import('./model.js').Segment} Segment */

export const totalSec = (/** @type {Segment[]} */ script) => script.reduce((t, s) => t + s.sec, 0);

/**
 * @param {Segment[]} script
 * @param {number} sec seconds since start (pauses already removed)
 * @returns {{ index: number, segment: Segment|null, left: number, done: boolean, workDone: number, remaining: number }}
 */
export function position(script, sec) {
  let t = 0;
  let workDone = 0;
  for (let i = 0; i < script.length; i++) {
    const seg = script[i];
    if (sec < t + seg.sec) return { index: i, segment: seg, left: t + seg.sec - sec, done: false, workDone, remaining: totalSec(script) - sec };
    t += seg.sec;
    if (seg.type === 'work') workDone++;
  }
  return { index: script.length, segment: null, left: 0, done: true, workDone, remaining: 0 };
}

/**
 * Run state → seconds elapsed. A run is { startedAt, pausedMs, pausedAt, skipSec }.
 * @param {{ startedAt: number, pausedMs?: number, pausedAt?: number|null, skipSec?: number }} run
 */
export function runSeconds(run, now) {
  const t = run.pausedAt ?? now;
  return Math.max(0, (t - run.startedAt - (run.pausedMs || 0)) / 1000 + (run.skipSec || 0));
}

/** Wall-clock time when the script ends (no further pauses / skips). */
export function endTime(script, run, now) {
  return now + (totalSec(script) - runSeconds(run, now)) * 1000;
}

/**
 * Settle a run at time `now`: finished (and when it finished) or how far it got.
 * @returns {{ done: boolean, workDone: number, endAt: number }}
 */
export function settle(script, run, now) {
  const sec = runSeconds(run, now);
  const p = position(script, sec);
  return { done: p.done, workDone: p.workDone, endAt: p.done ? Math.round(now - (sec - totalSec(script)) * 1000) : now };
}
