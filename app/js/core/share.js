// What Forge shares with Preflight (Jeff's companion app on the same phone): this week's goals and today's
// steps, active calories and last night's sleep (stored on the wake-up day). The Android shell keeps the latest copy where Preflight can read it
// (platform/preflight.js → PreflightShare plugin → SummaryProvider). Format version 1; Preflight ignores
// fields it doesn't know.
import { GOALS } from './model.js';
import { weekSummary } from './goals.js';
import { stepsOf } from './metrics.js';
import { dateKey } from './util.js';

/**
 * @param {import('./model.js').Session[]} sessions
 * @param {Record<string, import('./model.js').Daily>} daily
 * @param {{ stepGoal?: number, sleepGoal?: number }} settings
 * @param {number} now
 */
export function preflightSummary(sessions, daily, settings, now) {
  const stepGoal = settings.stepGoal || GOALS.stepsPerDay;
  const w = weekSummary(sessions, daily, now, stepGoal);
  const today = daily[dateKey(now)];
  const kcal = today?.watch?.activeKcal;
  const typed = today?.sleepHours;
  const sleepMin = typed != null ? Math.round(typed * 60) : today?.watch?.sleepMin ? Math.round(today.watch.sleepMin) : null;
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
    sleepMin, // minutes asleep last night (typed hours win over the watch); null when unknown
    sleepGoal: settings.sleepGoal || GOALS.sleepHours, // hours
    heavy: w.heavy, heavyGoal: GOALS.heavy,
    zone2: w.zone2, zone2Goal: GOALS.zone2,
    hiit: w.hiit, hiitGoal: GOALS.hiit,
  };
}
