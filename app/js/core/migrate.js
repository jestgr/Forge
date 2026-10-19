// Old Forge data (React app, "version 1.0") → schema 2. Pure functions.
// Inputs: an old backup file {history, customExercises, version} or the old
// app's full localStorage state (adds overrides, deletions, steps, plan, …).
import { CATEGORIES, EQUIPMENT, FIELDS, SPLITS } from './model.js';
import { LEGACY_BUILTINS } from './builtins.js';
import { BUILTIN_PLANS } from './plans.js';
import { dateKey, pos } from './util.js';

/** @typedef {import('./model.js').Exercise} Exercise */
/** @typedef {import('./model.js').Session} Session */
/** @typedef {import('./model.js').Daily} Daily */

const SPLIT_NAMES = {
  'Lower Body': 'lower', 'Upper': 'upper', 'Upper Body': 'upper', 'Chest/Shoulders': 'chest-shoulders',
  'Back/Biceps': 'back-biceps', 'Core': 'core', 'Pure Cardio': 'pure-cardio',
};
const EQUIP_NAMES = { 'Full Gym': 'full-gym', 'Travel': 'home-travel', 'Bodyweight': 'bodyweight' };
const FIELD_NAMES = { Weight: 'weight', Reps: 'reps', Time: 'time', Speed: 'speed', Incline: 'incline', Distance: 'distance', HeartRate: 'hr', RPE: 'rpe' };
/** @type {string[]} */
const CAT_IDS = CATEGORIES.map((c) => c[0]);
const FORGOTTEN_MS = 4 * 3600 * 1000;
const AFTER_LAST_SET_MS = 5 * 60 * 1000;

/** Old split label → new id (or null). */
export const splitId = (name) => SPLIT_NAMES[name] || null;

/** Sorted by the order in a reference list. */
const ordered = (vals, ref) => ref.map((r) => r[0]).filter((v) => vals.includes(v));

/** "10" → 10, "8-12" stays, '' → null */
function normReps(r) {
  if (r === undefined || r === null || r === '') return null;
  if (typeof r === 'number') return r > 0 ? r : null;
  const s = String(r).trim();
  return /^\d+$/.test(s) ? Number(s) : s || null;
}

/**
 * Old exercise template → Exercise.
 * "All" in old splits (or none) = usable in any split → [].
 * @returns {Exercise}
 */
export function convertTemplate(t, builtIn = false) {
  const cat = String(t.category || '').toLowerCase();
  const oldSplits = Array.isArray(t.targetSplits) ? t.targetSplits : [];
  const splits = oldSplits.includes('All') ? [] : ordered(oldSplits.map(splitId).filter(Boolean), SPLITS);
  const eq = (Array.isArray(t.equipment) ? t.equipment : []).map((e) => EQUIP_NAMES[e]).filter(Boolean);
  if (eq.includes('full-gym') && eq.includes('home-travel')) eq.push('minimal-gym');
  const tracking = (Array.isArray(t.trackingFields) ? t.trackingFields : []).map((f) => FIELD_NAMES[f]).filter(Boolean);
  /** @type {Exercise} */
  const ex = {
    id: String(t.id),
    name: String(t.name || 'Unnamed exercise'),
    categories: CAT_IDS.includes(cat) ? [/** @type {any} */ (cat)] : ['resistance'],
    splits: /** @type {any} */ (splits),
    equipment: /** @type {any} */ (eq.length ? ordered(eq, EQUIPMENT) : EQUIPMENT.map((e) => e[0])),
    tracking: /** @type {any} */ (tracking.length ? ordered(tracking, FIELDS) : ['reps']),
    targets: {
      sets: pos(t.suggestedSets) ?? null,
      reps: normReps(t.suggestedReps),
      restSec: pos(t.suggestedRest) ?? null,
      durationSec: pos(t.suggestedDuration) ?? null,
    },
    notes: t.notes || t.description || '',
    videoUrl: t.videoUrl || '',
    builtIn,
  };
  return ex;
}

/** Built-ins in the current format (fresh install / defaults). */
export function builtinExercises() {
  return LEGACY_BUILTINS.map((t) => convertTemplate(t, true));
}

/** Old set → logged set (zeros from the old form become empty). */
function convertSet(s, fallbackAt) {
  /** @type {import('./model.js').LoggedSet} */
  const out = { at: Number(s.timestamp) || fallbackAt };
  const map = { reps: 'reps', weight: 'weight', time: 'timeSec', distance: 'distance', speed: 'speed', incline: 'incline', heartRate: 'hr', rpe: 'rpe' };
  for (const [from, to] of Object.entries(map)) {
    const v = pos(s[from]);
    if (v !== undefined) out[to] = v;
  }
  return out;
}

const BUCKET_CREDIT = {
  Heavy: { heavy: true, zone2: false, hiit: false },
  'Zone 2': { heavy: false, zone2: true, hiit: false },
  HIIT: { heavy: false, zone2: false, hiit: true },
  Other: { heavy: false, zone2: false, hiit: false },
};

/**
 * Old WorkoutSession → Session.
 * @returns {Session}
 */
export function convertSession(s, status = /** @type {'done'|'active'} */ ('done')) {
  const startedAt = Number(s.startTime) || 0;
  const sections = CAT_IDS.map((cat) => ({
    category: cat,
    items: (s.exercises || [])
      .filter((e) => String(e.category || '').toLowerCase() === cat)
      .map((e) => {
        const item = {
          id: String(e.id),
          exerciseId: String(e.templateId),
          name: String(e.name || ''),
          targets: {
            sets: pos(e.targetSets) ?? null,
            reps: normReps(e.targetReps),
            restSec: pos(e.targetRest) ?? null,
            durationSec: pos(e.targetDuration) ?? null,
          },
          sets: (e.sets || []).map((x) => convertSet(x, startedAt)),
          protocol: null,
        };
        if (e.notes || e.videoUrl) item.legacy = { notes: e.notes, videoUrl: e.videoUrl };
        return item;
      }),
  })).filter((sec) => sec.items.length);
  // Exercises with an unknown category are kept, as resistance.
  const unknown = (s.exercises || []).filter((e) => !CAT_IDS.includes(String(e.category || '').toLowerCase()));
  if (unknown.length) {
    const target = sections.find((x) => x.category === 'resistance') || (sections.push({ category: 'resistance', items: [] }), sections[sections.length - 1]);
    for (const e of unknown) target.items.push({ id: String(e.id), exerciseId: String(e.templateId), name: String(e.name || ''), targets: {}, sets: (e.sets || []).map((x) => convertSet(x, startedAt)), protocol: null });
  }

  let endedAt = status === 'done' ? (Number(s.endTime) || startedAt) : null;
  const { exercises, ...rest } = s;
  const legacy = { ...rest };
  if (endedAt !== null && endedAt - startedAt > FORGOTTEN_MS) {
    const lastSet = Math.max(0, ...sections.flatMap((x) => x.items.flatMap((i) => i.sets.map((st) => st.at))));
    const fixed = lastSet > startedAt ? lastSet + AFTER_LAST_SET_MS : startedAt + (pos(s.estimatedDuration) || 60) * 60000;
    if (fixed < endedAt) { legacy.endTimeFixed = true; endedAt = fixed; }
  }
  /** @type {Session} */
  const out = {
    id: String(s.id),
    kind: 'workout',
    name: s.name ? String(s.name).trim() : undefined,
    split: /** @type {any} */ (splitId(s.type)),
    includeCardio: !!s.hasCardio,
    equipment: null,
    startedAt,
    endedAt,
    pausedMs: 0,
    status,
    sections: /** @type {any} */ (sections),
    creditOverride: s.fitnessBucket && BUCKET_CREDIT[s.fitnessBucket]
      ? { ...BUCKET_CREDIT[s.fitnessBucket], split: null } : null,
    source: 'migrated',
    legacy,
  };
  return out;
}

/** "Thu Oct 16 2026" (Date.toDateString) → "2026-10-16"; ISO keys pass through. */
export function convertDayKey(k) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(k)) return k;
  const t = Date.parse(k);
  return isNaN(t) ? null : dateKey(t);
}

/** Old daily maps → Daily rows. */
function convertDaily(old) {
  /** @type {Record<string, Daily>} */
  const out = {};
  const add = (map, field) => {
    for (const [k, v] of Object.entries(map || {})) {
      const date = convertDayKey(k);
      const n = Number(v);
      if (!date || !isFinite(n) || n <= 0) continue;
      out[date] = out[date] || { date, source: 'migrated' };
      out[date][field] = n;
    }
  };
  add(old.dailySteps, 'steps');
  add(old.dailySleep, 'sleepHours');
  add(old.dailyHeartPoints, 'heartPoints');
  return Object.values(out);
}

/** Is this an old-format Forge file/state? */
export function isLegacy(json) {
  return !!json && typeof json === 'object' && json.schema === undefined &&
    (Array.isArray(json.history) || Array.isArray(json.customExercises));
}

/**
 * Old data → complete schema-2 data set (all stores).
 * @param {any} old  old backup or old localStorage state
 * @param {{ source: 'localStorage'|'backup', now: number }} o
 */
export function migrateLegacy(old, o) {
  const overrides = old.exerciseOverrides || {};
  const deleted = new Set(old.deletedExerciseIds || []);
  const exercises = LEGACY_BUILTINS.map((t) => {
    const ex = overrides[t.id]
      ? { ...convertTemplate({ ...t, ...overrides[t.id], id: t.id }, true), modified: true }
      : convertTemplate(t, true);
    if (deleted.has(t.id)) ex.deleted = true;
    return ex;
  });
  const builtinIds = new Set(exercises.map((e) => e.id));
  for (const c of old.customExercises || []) {
    if (!c || builtinIds.has(String(c.id))) continue;
    exercises.push(convertTemplate(c, false));
  }

  const sessions = (old.history || []).map((s) => convertSession(s, 'done'));
  if (old.activeSession && Array.isArray(old.activeSession.exercises)) {
    const active = convertSession(old.activeSession, 'active');
    if (!sessions.some((s) => s.id === active.id)) sessions.push(active);
  }

  /** @type {{key: string, value: any}[]} */
  const settings = [
    { key: 'migratedFrom', value: o.source },
    { key: 'migratedAt', value: o.now },
  ];
  if (old.activePlanId && old.planStartDate) {
    settings.push({ key: 'plan', value: { id: String(old.activePlanId), startDate: Number(old.planStartDate) } });
  }

  return { exercises, sessions, daily: convertDaily(old), plans: [...BUILTIN_PLANS], settings };
}

/**
 * Merge incoming data into existing data by id: adds what's missing,
 * never overwrites or duplicates (the newer app's copy wins).
 * @returns {{ data: any, added: Record<string, number> }}
 */
export function mergeById(existing, incoming) {
  const keyOf = { exercises: 'id', sessions: 'id', daily: 'date', plans: 'id', settings: 'key' };
  /** @type {Record<string, any[]>} */
  const data = {};
  /** @type {Record<string, number>} */
  const added = {};
  for (const [store, key] of Object.entries(keyOf)) {
    const have = new Map((existing[store] || []).map((x) => [x[key], x]));
    added[store] = 0;
    for (const x of incoming[store] || []) {
      if (have.has(x[key])) continue;
      if (store === 'settings' && x.key.startsWith('migrated')) continue;
      have.set(x[key], x);
      added[store]++;
    }
    data[store] = [...have.values()];
  }
  return { data, added };
}
