// "Begin Next Session": fill each section by estimated time, preferring
// exercises not done recently, respecting split and equipment mode. Pure.
import { CATEGORIES, DEFAULT_TARGETS, SECONDS_PER_REP, SECTION_WINDOWS, SETUP_SEC } from './model.js';
import { repsNumber, rng, uid } from './util.js';

/** @typedef {import('./model.js').Exercise} Exercise */
/** @typedef {import('./model.js').Session} Session */
/** @typedef {import('./model.js').SessionItem} SessionItem */
/** @typedef {import('./model.js').Category} Category */
/** @typedef {import('./model.js').Split} Split */
/** @typedef {import('./model.js').Equip} Equip */

const DAY = 86400000;

/** Exercise targets with category defaults filled in. */
export function effectiveTargets(targets, category) {
  const d = DEFAULT_TARGETS[category] || DEFAULT_TARGETS.resistance;
  const t = targets || {};
  const timed = !!t.durationSec;
  return {
    sets: t.sets || d.sets,
    reps: timed ? (t.reps ?? null) : (t.reps ?? d.reps),
    restSec: t.restSec ?? d.restSec,
    durationSec: t.durationSec || (t.reps ? null : d.durationSec),
  };
}

/** Estimated seconds for one exercise: sets × (work + rest) + setup. */
export function estimateSec(targets, category) {
  const t = effectiveTargets(targets, category);
  const work = t.durationSec || (repsNumber(t.reps) ?? 10) * SECONDS_PER_REP;
  return t.sets * (work + (t.restSec || 0)) + SETUP_SEC;
}

/** Does an exercise fit the session split? Empty splits = any split; Upper = both upper-body days. */
export function fitsSplit(ex, split) {
  if (!ex.splits.length) return true;
  if (ex.splits.includes(split)) return true;
  return ex.splits.includes('upper') && (split === 'chest-shoulders' || split === 'back-biceps');
}

/** Last time (ms) each exercise was done, from finished sessions. */
export function lastDone(sessions) {
  /** @type {Record<string, number>} */
  const last = {};
  for (const s of sessions) {
    if (s.status !== 'done') continue;
    for (const sec of s.sections) for (const it of sec.items) {
      if (it.sets.length && (last[it.exerciseId] || 0) < s.startedAt) last[it.exerciseId] = s.startedAt;
    }
  }
  return last;
}

const normName = (n) => n.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * New session item from a library exercise (targets copied; library unchanged).
 * @param {Exercise} ex @param {Category} category
 * @returns {SessionItem}
 */
export function makeItem(ex, category, maxSec = Infinity) {
  const targets = { ...ex.targets };
  if (targets.durationSec && (targets.sets || 1) === 1 && targets.durationSec > maxSec) targets.durationSec = maxSec;
  return { id: uid('i_'), exerciseId: ex.id, name: ex.name, targets, tracking: [...ex.tracking], sets: [], protocol: null };
}

/**
 * Pick exercises for one section.
 * @param {{ category: Category, exercises: Exercise[], split: Split, equipment: Equip, last: Record<string, number>,
 *   now: number, random: () => number, exclude?: Set<string>, first?: string[] }} o
 * @returns {SessionItem[]}
 */
export function fillSection(o) {
  const w = SECTION_WINDOWS[o.category];
  const maxSec = w.max * 60;
  const aimSec = w.aim * 60;
  const pool = o.exercises.filter((ex) => !ex.deleted && ex.categories.includes(o.category) &&
    ex.equipment.includes(o.equipment) && !(o.exclude?.has(ex.id)) &&
    (o.category !== 'resistance' || fitsSplit(ex, o.split)));
  const score = (ex) => {
    const days = o.last[ex.id] ? Math.min(60, (o.now - o.last[ex.id]) / DAY) : 60;
    const splitBonus = o.category !== 'resistance' && ex.splits.includes(o.split) ? 5 : 0;
    return days + splitBonus + o.random() * 4;
  };
  const ranked = pool.map((ex) => ({ ex, s: score(ex) })).sort((a, b) => b.s - a.s).map((x) => x.ex);
  const firstIds = (o.first || []).filter((id) => o.exercises.some((e) => e.id === id && !e.deleted));
  const ordered = [...firstIds.map((id) => o.exercises.find((e) => e.id === id)), ...ranked.filter((e) => !firstIds.includes(e.id))];

  /** @type {SessionItem[]} */
  const items = [];
  const names = new Set();
  let total = 0;
  for (const ex of ordered) {
    if (total >= aimSec) break;
    if (names.has(normName(ex.name))) continue;
    const item = makeItem(ex, o.category, o.category === 'cardio' ? maxSec : Infinity);
    const est = estimateSec(item.targets, o.category);
    if (total + est > maxSec + SETUP_SEC && items.length) continue;
    items.push(item);
    names.add(normName(ex.name));
    total += est;
  }
  return items;
}

/**
 * Build all sections for a new session. Every category gets a section (maybe empty) so +ADD is always there.
 * @param {{ exercises: Exercise[], sessions: Session[], split: Split, includeCardio: boolean, equipment: Equip,
 *   now: number, seed?: number, planCardio?: string[] }} o
 */
export function generate(o) {
  const random = rng(o.seed ?? o.now);
  const last = lastDone(o.sessions);
  const cardio = o.includeCardio || o.split === 'pure-cardio';
  return CATEGORIES.map(([category]) => {
    const want = category === 'mobility' || category === 'posture' ||
      (category === 'resistance' && o.split !== 'pure-cardio') || (category === 'cardio' && cardio);
    return {
      category,
      items: want ? fillSection({ category, exercises: o.exercises, split: o.split, equipment: o.equipment, last, now: o.now, random,
        first: category === 'cardio' ? o.planCardio : undefined }) : [],
    };
  });
}

/** Estimated minutes for a section's items. */
export function sectionMinutes(items, category) {
  return items.reduce((t, it) => t + estimateSec(it.targets, category), 0) / 60;
}
