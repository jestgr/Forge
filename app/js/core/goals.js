// Weekly goals and what each session earns (rules confirmed by Jeff, PLAN.md §6).
import { GOALS, HEAVY_SPLITS, TRACKER_SPLITS } from './model.js';
import { addDays, dateKey, weekStart } from './util.js';
import { stepsOf, sleepHoursOf } from './metrics.js';
import { isCardioType } from './watch.js';

/** @typedef {import('./model.js').Session} Session */
/** @typedef {import('./model.js').Credit} Credit */

/** Resistance exercises in a session with at least one logged set. */
export function resistanceLogged(s) {
  return s.sections.filter((x) => x.category === 'resistance')
    .reduce((n, x) => n + x.items.filter((i) => i.sets.length > 0).length, 0);
}

/** Did this item complete the 4×4 (end of hard interval 4)? */
export const did4x4 = (item) => !!item.protocol?.completedAt;

/** Seconds of cardio: logged time per set (else the item's target duration), or the 4×4 run if longer. */
export function cardioSeconds(s) {
  let total = 0;
  for (const sec of s.sections) {
    if (sec.category !== 'cardio') continue;
    for (const item of sec.items) {
      const logged = item.sets.reduce((t, st) => t + (st.timeSec || item.targets?.durationSec || 0), 0);
      const p = item.protocol;
      const run = p ? Math.max(0, ((p.completedAt || p.endedAt || p.startedAt) - p.startedAt - (p.pausedMs || 0)) / 1000) : 0;
      total += Math.max(logged, run);
    }
  }
  return total;
}

/**
 * What a finished session earns. Fallbacks earn nothing. A session can earn several.
 * @param {Session} s
 * @returns {Credit}
 */
export function computeCredit(s) {
  if (s.kind === 'fallback') return { heavy: false, zone2: false, hiit: false, split: null };
  // Watch workout: counts as what Jeff picked on its card.
  if (s.kind === 'watch') { const c = /** @type {any} */ (s.watch?.counts || {}); return { heavy: !!c.heavy, zone2: !!c.zone2, hiit: !!c.hiit, split: null }; }
  const res = resistanceLogged(s);
  const hiit = s.sections.some((x) => x.category === 'cardio' && x.items.some(did4x4));
  return {
    heavy: HEAVY_SPLITS.includes(s.split) && res >= GOALS.heavyMinExercises,
    split: TRACKER_SPLITS.includes(s.split) && res >= GOALS.heavyMinExercises ? s.split : null,
    hiit,
    zone2: hiit || cardioSeconds(s) >= GOALS.zone2Minutes * 60,
  };
}

/** Credit with any manual override applied. @param {Session} s */
export function creditFor(s) {
  return s.creditOverride ? { ...computeCredit(s), ...s.creditOverride } : computeCredit(s);
}

/**
 * Totals for the week (Sunday–Saturday) containing `now`.
 * @param {Session[]} sessions
 * @param {Record<string, import('./model.js').Daily>} daily
 * @param {number} now
 * @param {number} [stepGoal]
 */
export function weekSummary(sessions, daily, now, stepGoal = GOALS.stepsPerDay) {
  const from = weekStart(now);
  const to = addDays(from, 7);
  const inWeek = sessions.filter((s) => s.status === 'done' && s.startedAt >= from && s.startedAt < to);
  const out = { heavy: 0, zone2: 0, hiit: 0, fallback: 0, splits: /** @type {string[]} */ ([]), stepsToday: 0, stepDays: 0, days: 0, from, to };
  for (const s of inWeek) {
    if (s.kind === 'fallback') { out.fallback++; continue; }
    const c = creditFor(s);
    if (c.heavy) out.heavy++;
    if (c.zone2) out.zone2++;
    if (c.hiit) out.hiit++;
    if (c.split && !out.splits.includes(c.split)) out.splits.push(c.split);
  }
  for (let d = from; d < to && d <= now; d = addDays(d, 1)) {
    out.days++;
    if (stepsOf(daily[dateKey(d)]) >= stepGoal) out.stepDays++;
  }
  out.stepsToday = stepsOf(daily[dateKey(now)]);
  return out;
}

/** Marks shown on the calendar, in this order. */
export const MARKS = [
  ['heavy', 'Heavy'], ['zone2', 'Zone 2'], ['hiit', 'HIIT'], ['cardio', 'Cardio'],
  ['workout', 'Other workout'], ['steps', 'Step goal'], ['sleep', 'Sleep goal'], ['fallback', 'Fallback'],
];

/**
 * What was accomplished each day → { 'YYYY-MM-DD': ['heavy', 'steps', …] } (MARKS order).
 * "cardio" = some cardio done that earned neither Zone 2 nor HIIT; "workout" = a session that earned no other mark.
 * @param {Session[]} sessions
 * @param {Record<string, import('./model.js').Daily>} daily
 * @param {{ stepGoal?: number, sleepGoal?: number }} [goals]
 */
export function dayMarks(sessions, daily, { stepGoal = GOALS.stepsPerDay, sleepGoal = GOALS.sleepHours } = {}) {
  /** @type {Record<string, Set<string>>} */
  const by = {};
  const add = (date, m) => (by[date] ||= new Set()).add(m);
  for (const s of sessions) {
    if (s.status !== 'done') continue;
    const date = dateKey(s.startedAt);
    if (s.kind === 'fallback') { add(date, 'fallback'); continue; }
    const c = creditFor(s);
    if (c.heavy) add(date, 'heavy');
    if (c.zone2) add(date, 'zone2');
    if (c.hiit) add(date, 'hiit');
    const cardio = s.kind === 'watch' ? isCardioType(s.watch?.type) : cardioSeconds(s) > 0;
    if (cardio && !c.zone2 && !c.hiit) add(date, 'cardio');
    else if (!c.heavy && !c.zone2 && !c.hiit) add(date, 'workout');
  }
  for (const [date, d] of Object.entries(daily || {})) {
    if (stepsOf(d) >= stepGoal) add(date, 'steps');
    const sl = sleepHoursOf(d);
    if (sl != null && sl >= sleepGoal) add(date, 'sleep');
  }
  return Object.fromEntries(Object.entries(by).map(([d, set]) => [d, MARKS.map(([k]) => k).filter((k) => set.has(k))]));
}
