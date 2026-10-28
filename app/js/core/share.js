// What Forge shares with Preflight (Jeff's companion app on the same phone): this week's goals and today's
// steps and active calories. The Android shell keeps the latest copy where Preflight can read it
// (platform/preflight.js → PreflightShare plugin → SummaryProvider). Format version 1; Preflight ignores
// fields it doesn't know.
import { GOALS } from './model.js';
import { weekSummary } from './goals.js';
import { stepsOf } from './metrics.js';
import { dateKey } from './util.js';

/**
 * @param {import('./model.js').Session[]} sessions
 * @param {Record<string, import('./model.js').Daily>} daily
 * @param {{ stepGoal?: number }} settings
 * @param {number} now
 */
export function preflightSummary(sessions, daily, settings, now) {
  const stepGoal = settings.stepGoal || GOALS.stepsPerDay;
  const w = weekSummary(sessions, daily, now, stepGoal);
  const today = daily[dateKey(now)];
  const kcal = today?.watch?.activeKcal;
  return {
    v: 1,
    updatedAt: now,
    date: dateKey(now),
    weekFrom: dateKey(w.from),
    steps: stepsOf(today),
    stepGoal,
    stepDays: w.stepDays,
    days: w.days,
    activeKcal: kcal == null ? null : Math.round(kcal),
    heavy: w.heavy, heavyGoal: GOALS.heavy,
    zone2: w.zone2, zone2Goal: GOALS.zone2,
    hiit: w.hiit, hiitGoal: GOALS.hiit,
  };
}
