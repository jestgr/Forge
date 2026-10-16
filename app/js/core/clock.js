// Session clock: total time, work vs rest, pause. Wall-clock based, so a
// sleeping phone or a reopened app never loses time. Pure (state in, state out).

/** @typedef {import('./model.js').Session} Session */

/** Total active milliseconds (excludes pauses). 0 before the clock starts. */
export function elapsedMs(s, now) {
  if (s.clockStartedAt == null) return 0;
  const end = s.endedAt ?? s.pausedAt ?? now;
  return Math.max(0, end - s.clockStartedAt - (s.pausedMs || 0));
}

export const isPaused = (s) => s.pausedAt != null;
export const isRunning = (s) => s.clockStartedAt != null && s.pausedAt == null && s.endedAt == null;

/** Start the clock (first set or ▶). */
export function start(s, now) {
  if (s.clockStartedAt != null) return resume(s, now);
  return { ...s, clockStartedAt: now, startedAt: now, workSince: now };
}

export function pause(s, now) {
  if (!isRunning(s)) return s;
  return { ...s, pausedAt: now };
}

export function resume(s, now) {
  if (s.pausedAt == null) return s;
  const d = now - s.pausedAt;
  const shift = (t) => (t != null ? t + d : t);
  return {
    ...s, pausedAt: null, pausedMs: (s.pausedMs || 0) + d,
    workSince: shift(s.workSince),
    rest: s.rest ? { ...s.rest, startedAt: s.rest.startedAt + d } : null,
  };
}

/**
 * Current interval. Rest counts down from the target and then flips to work.
 * @returns {{ mode: 'idle'|'paused'|'work'|'rest', sec: number, restOver?: boolean }}
 */
export function interval(s, now) {
  if (s.clockStartedAt == null) return { mode: 'idle', sec: 0 };
  const t = s.pausedAt ?? now;
  if (s.rest) {
    const left = s.rest.targetSec - (t - s.rest.startedAt) / 1000;
    if (left > 0) return { mode: s.pausedAt != null ? 'paused' : 'rest', sec: left };
    const workFrom = s.rest.startedAt + s.rest.targetSec * 1000;
    return { mode: s.pausedAt != null ? 'paused' : 'work', sec: (t - workFrom) / 1000, restOver: true };
  }
  return { mode: s.pausedAt != null ? 'paused' : 'work', sec: (t - (s.workSince ?? s.clockStartedAt)) / 1000 };
}

/** After a set is logged: start a rest (if any) and add the finished work. */
export function afterSet(s, now, restSec) {
  const base = closeRest(s, now);
  const workMs = (base.workMs || 0) + Math.max(0, now - (base.workSince ?? base.clockStartedAt ?? now));
  return { ...base, workMs, rest: restSec > 0 ? { startedAt: now, targetSec: restSec } : null, workSince: restSec > 0 ? null : now, lastSetAt: now };
}

/** End a rest now (skip) or account for an expired one. */
export function closeRest(s, now) {
  if (!s.rest) return s;
  const restEnd = Math.min(now, s.rest.startedAt + s.rest.targetSec * 1000);
  return { ...s, rest: null, restMs: (s.restMs || 0) + Math.max(0, restEnd - s.rest.startedAt), workSince: restEnd };
}

/** Totals for the summary: work vs rest (seconds). */
export function totals(s, now) {
  const closed = closeRest(s, s.endedAt ?? now);
  const end = closed.endedAt ?? closed.pausedAt ?? now;
  const work = (closed.workMs || 0) + (closed.clockStartedAt != null ? Math.max(0, end - (closed.workSince ?? end)) : 0);
  return { totalSec: elapsedMs(s, now) / 1000, workSec: work / 1000, restSec: (closed.restMs || 0) / 1000 };
}
