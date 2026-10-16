// App state: loaded once from IndexedDB, kept in memory, written through on change.
// Screens read `state` and re-render when `subscribe` fires.
import * as db from './platform/db.js';

/** @typedef {import('./core/model.js').Exercise} Exercise */
/** @typedef {import('./core/model.js').Session} Session */
/** @typedef {import('./core/model.js').Daily} Daily */
/** @typedef {import('./core/model.js').Plan} Plan */

export const state = {
  /** @type {Exercise[]} */ exercises: [],
  /** @type {Session[]} */ sessions: [],
  /** @type {Record<string, Daily>} */ daily: {},
  /** @type {Plan[]} */ plans: [],
  /** @type {Record<string, any>} */ settings: {},
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit() { for (const fn of listeners) fn(); }

export async function load() {
  const [exercises, sessions, daily, plans, settings] = await Promise.all(db.STORES.map((s) => db.getAll(s)));
  state.exercises = exercises;
  state.sessions = sessions.sort((a, b) => b.startedAt - a.startedAt);
  state.daily = Object.fromEntries(daily.map((d) => [d.date, d]));
  state.plans = plans;
  state.settings = Object.fromEntries(settings.map((s) => [s.key, s.value]));
}

/** Everything, in backup/store shape. */
export function snapshot() {
  return {
    exercises: state.exercises,
    sessions: state.sessions,
    daily: Object.values(state.daily),
    plans: state.plans,
    settings: Object.entries(state.settings).map(([key, value]) => ({ key, value })),
  };
}

/** Replace all data (Restore / migration). */
export async function replaceAll(data) {
  await db.replaceAll(data);
  await load();
  emit();
}

// ---------- exercises ----------
/** @param {Exercise} ex */
export async function saveExercise(ex) {
  ex.updatedAt = Date.now();
  const i = state.exercises.findIndex((e) => e.id === ex.id);
  if (i === -1) state.exercises.push(ex); else state.exercises[i] = ex;
  emit();
  await db.put('exercises', ex);
}

/** Built-ins are hidden (restorable); custom ones are removed. */
export async function deleteExercise(id) {
  const ex = state.exercises.find((e) => e.id === id);
  if (!ex) return;
  if (ex.builtIn) return saveExercise({ ...ex, deleted: true });
  state.exercises = state.exercises.filter((e) => e.id !== id);
  emit();
  await db.del('exercises', id);
}

/** @param {string} id */
export const exerciseById = (id) => state.exercises.find((e) => e.id === id);
export const liveExercises = () => state.exercises.filter((e) => !e.deleted);

// ---------- sessions ----------
/** @param {Session} s */
export async function saveSession(s) {
  const i = state.sessions.findIndex((x) => x.id === s.id);
  if (i === -1) { state.sessions.unshift(s); state.sessions.sort((a, b) => b.startedAt - a.startedAt); }
  else state.sessions[i] = s;
  emit();
  await db.put('sessions', s);
}

export async function deleteSession(id) {
  state.sessions = state.sessions.filter((s) => s.id !== id);
  emit();
  await db.del('sessions', id);
}

export const activeSession = () => state.sessions.find((s) => s.status === 'active') || null;
export const doneSessions = () => state.sessions.filter((s) => s.status === 'done');

// ---------- daily / plans / settings ----------
/** @param {Daily} d */
export async function saveDaily(d) {
  state.daily[d.date] = d;
  emit();
  await db.put('daily', d);
}

/** @param {Plan} p */
export async function savePlan(p) {
  const i = state.plans.findIndex((x) => x.id === p.id);
  if (i === -1) state.plans.push(p); else state.plans[i] = p;
  emit();
  await db.put('plans', p);
}

export async function deletePlan(id) {
  state.plans = state.plans.filter((p) => p.id !== id);
  emit();
  await db.del('plans', id);
}

export async function setSetting(key, value) {
  state.settings[key] = value;
  emit();
  await db.put('settings', { key, value });
}
