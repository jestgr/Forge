// Training plans are data. Built-in: the original 12-week VO2 Max plan.
// More plans can be imported as JSON files (see validatePlan for the format).
import { addDays } from './util.js';

/** @typedef {import('./model.js').Plan} Plan */

/** @type {Plan} */
export const VO2_PLAN = {
  id: 'vo2_max_12w',
  name: '12-Week VO2 Max Engine',
  description: 'Aerobic base (weeks 1–4, Zone 2), threshold (5–8, hill repeats), max capacity (9–12, 4×4 intervals).',
  builtIn: true,
  weeks: Array.from({ length: 12 }, (_, i) => {
    const week = i + 1;
    if (week <= 4) return { week, focus: 'Aerobic base', cardio: ['card_v3'] };
    if (week <= 8) return { week, focus: 'Threshold intro', cardio: ['card_v2'] };
    return { week, focus: 'Max consumption', cardio: ['card_v1'] };
  }),
};

export const BUILTIN_PLANS = [VO2_PLAN];

/**
 * Which week of the active plan is it? null if no plan, not started, or finished.
 * @param {Plan|undefined} plan @param {number|undefined} startDate @param {number} now
 */
export function planWeek(plan, startDate, now) {
  if (!plan || !startDate) return null;
  let i = 0;
  while (i < plan.weeks.length && addDays(startDate, (i + 1) * 7) <= now) i++;
  if (now < startDate || i >= plan.weeks.length) return null;
  return { index: i, week: plan.weeks[i], total: plan.weeks.length };
}

/**
 * Check an imported plan file. Format:
 * { "id": "my_plan", "name": "…", "description": "…",
 *   "weeks": [ { "week": 1, "focus": "…", "cardio": ["card_v3"], "notes": "…" }, … ] }
 * @returns {{ ok: boolean, plan?: Plan, error?: string }}
 */
export function validatePlan(p) {
  if (!p || typeof p !== 'object') return { ok: false, error: 'Not a plan file.' };
  if (typeof p.id !== 'string' || !/^[\w-]{1,60}$/.test(p.id)) return { ok: false, error: 'Plan needs an "id" (letters, numbers, - or _).' };
  if (typeof p.name !== 'string' || !p.name.trim()) return { ok: false, error: 'Plan needs a "name".' };
  if (!Array.isArray(p.weeks) || !p.weeks.length) return { ok: false, error: 'Plan needs a non-empty "weeks" list.' };
  const weeks = p.weeks.map((w, i) => ({
    week: i + 1,
    focus: String(w?.focus || ''),
    cardio: Array.isArray(w?.cardio) ? w.cardio.map(String) : [],
    notes: w?.notes ? String(w.notes) : undefined,
  }));
  return { ok: true, plan: { id: p.id, name: p.name.trim(), description: String(p.description || ''), weeks, builtIn: false } };
}
