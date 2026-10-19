// First launch: bring data over from the old Forge (same web address, its
// localStorage) or start fresh with the built-in library. Also adds any
// built-in exercises/plans that a newer version introduced.
import * as store from './store.js';
import { putMany } from './platform/db.js';
import { builtinExercises, migrateLegacy } from './core/migrate.js';
import { BUILTIN_PLANS } from './core/plans.js';

export const OLD_KEY = 'forge_workout_state';

/** The old app's saved state, read-only. Never written or deleted. */
export function readOldState() {
  try {
    const raw = localStorage.getItem(OLD_KEY);
    if (!raw) return null;
    const old = JSON.parse(raw);
    return old && typeof old === 'object' ? old : null;
  } catch { return null; }
}

/** @returns {Promise<string|null>} message for the user, if any */
export async function ensureData() {
  const { settings, exercises } = store.state;
  let message = null;
  if (!settings.migratedFrom && exercises.length === 0) {
    const old = readOldState();
    if (old) {
      const data = migrateLegacy(old, { source: 'localStorage', now: Date.now() });
      await store.replaceAll(data);
      message = `Brought over ${data.sessions.length} sessions and ${data.exercises.filter((e) => !e.builtIn).length} custom exercises from the old Forge.`;
    } else {
      await store.replaceAll({
        exercises: builtinExercises(), sessions: [], daily: [], plans: [...BUILTIN_PLANS],
        settings: [{ key: 'migratedFrom', value: 'fresh' }, { key: 'migratedAt', value: Date.now() }],
      });
    }
  }
  // Built-ins added by a later version (never overwrites your edits).
  const haveEx = new Set(store.state.exercises.map((e) => e.id));
  const newEx = builtinExercises().filter((e) => !haveEx.has(e.id));
  const havePlan = new Set(store.state.plans.map((p) => p.id));
  const newPlans = BUILTIN_PLANS.filter((p) => !havePlan.has(p.id));
  if (newEx.length || newPlans.length) {
    if (newEx.length) await putMany('exercises', newEx);
    if (newPlans.length) await putMany('plans', newPlans);
    await store.load();
  }
  return message;
}
