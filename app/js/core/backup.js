// Backup files: build, read (v2 or old format), describe.
import { BACKUP_SCHEMA } from './model.js';
import { isLegacy, migrateLegacy } from './migrate.js';
import { dateKey } from './util.js';

const STORES = ['exercises', 'sessions', 'daily', 'plans', 'settings'];

/** Full backup object from a store snapshot. */
export function makeBackup(snap, now) {
  return { app: 'forge', schema: BACKUP_SCHEMA, exportedAt: new Date(now).toISOString(), ...snap };
}

export const backupFilename = (now) => `forge_backup_${dateKey(now)}.json`;

/**
 * Parse a file the user picked.
 * @returns {{ ok: boolean, kind?: 'v2'|'legacy', data?: Record<string, any[]>, error?: string }}
 */
export function readBackup(text, now) {
  let json;
  try { json = JSON.parse(text); } catch { return { ok: false, error: 'This file is not a Forge backup (not valid JSON).' }; }
  if (json && json.app === 'forge' && json.schema === BACKUP_SCHEMA) {
    for (const s of STORES) {
      if (!Array.isArray(json[s])) return { ok: false, error: `Backup is incomplete (missing "${s}").` };
    }
    const bad = json.sessions.find((s) => !s || typeof s.id !== 'string' || !Array.isArray(s.sections));
    if (bad) return { ok: false, error: 'Backup has a damaged session.' };
    const data = Object.fromEntries(STORES.map((s) => [s, json[s]]));
    return { ok: true, kind: 'v2', data };
  }
  if (json && json.app === 'forge' && typeof json.schema === 'number' && json.schema > BACKUP_SCHEMA) {
    return { ok: false, error: 'This backup is from a newer Forge. Update the app first.' };
  }
  if (isLegacy(json)) return { ok: true, kind: 'legacy', data: migrateLegacy(json, { source: 'backup', now }) };
  return { ok: false, error: 'This file is not a Forge backup.' };
}

/** "26 sessions · 115 exercises · 12 days of steps" */
export function describe(data) {
  const sessions = (data.sessions || []).length;
  const custom = (data.exercises || []).filter((e) => !e.builtIn).length;
  const days = (data.daily || []).length;
  return `${sessions} sessions · ${custom} custom exercises · ${days} days of steps/sleep`;
}
