// Forge data model: enums, labels, goals and fixed workout scripts.
// Pure data, no DOM — shared by the app and the tests.

/**
 * @typedef {'resistance'|'mobility'|'posture'|'cardio'} Category
 * @typedef {'lower'|'upper'|'chest-shoulders'|'back-biceps'|'core'|'pure-cardio'} Split
 * @typedef {'home-travel'|'full-gym'|'minimal-gym'|'bodyweight'} Equip
 * @typedef {'weight'|'reps'|'time'|'distance'|'speed'|'incline'|'hr'|'rpe'} Field
 *
 * @typedef {{ sets?: number|null, reps?: number|string|null, restSec?: number|null, durationSec?: number|null }} Targets
 * @typedef {{ id: string, name: string, categories: Category[], splits: Split[], equipment: Equip[],
 *   tracking: Field[], targets: Targets, notes?: string, videoUrl?: string,
 *   builtIn: boolean, modified?: boolean, deleted?: boolean, updatedAt?: number }} Exercise
 *
 * @typedef {{ at: number, reps?: number, weight?: number, timeSec?: number, distance?: number,
 *   speed?: number, incline?: number, hr?: number, rpe?: number }} LoggedSet
 * @typedef {{ kind: '4x4', startedAt: number, completedAt: number|null, hardDone: number, endedAt?: number|null,
 *   pausedMs?: number, pausedAt?: number|null, cooldown?: boolean }} Protocol
 * @typedef {{ id: string, exerciseId: string, name: string, targets: Targets, tracking?: Field[],
 *   sets: LoggedSet[], protocol?: Protocol|null, legacy?: any }} SessionItem
 * @typedef {{ category: Category, items: SessionItem[] }} Section
 * @typedef {{ heavy: boolean, zone2: boolean, hiit: boolean, split: Split|null }} Credit
 * @typedef {{ id: string, kind: 'workout'|'fallback', name?: string, split: Split|null, includeCardio: boolean,
 *   equipment: Equip|null, startedAt: number, endedAt: number|null, pausedMs: number, pausedAt?: number|null,
 *   status: 'active'|'done', sections: Section[], creditOverride?: Partial<Credit>|null,
 *   clockStartedAt?: number|null, workSince?: number|null, workMs?: number, restMs?: number,
 *   rest?: { startedAt: number, targetSec: number }|null, lastSetAt?: number|null,
 *   planWeek?: number|null,
 *   source: 'forge'|'migrated', legacy?: any }} Session
 * @typedef {{ date: string, steps?: number|null, sleepHours?: number|null, heartPoints?: number|null, source?: string }} Daily
 * @typedef {{ week: number, focus: string, cardio: string[], notes?: string }} PlanWeek
 * @typedef {{ id: string, name: string, description: string, weeks: PlanWeek[], builtIn: boolean }} Plan
 */

/** @type {[Category, string][]} */
export const CATEGORIES = [
  ['mobility', 'Mobility'],
  ['posture', 'Posture'],
  ['resistance', 'Resistance'],
  ['cardio', 'Cardio'],
];

/** @type {[Split, string][]} */
export const SPLITS = [
  ['lower', 'Lower Body'],
  ['upper', 'Upper'],
  ['chest-shoulders', 'Chest / Shoulders'],
  ['back-biceps', 'Back / Biceps'],
  ['core', 'Core'],
  ['pure-cardio', 'Pure Cardio'],
];

/** Splits you can choose for a session (Upper is a library tag only). @type {Split[]} */
export const SESSION_SPLITS = ['lower', 'chest-shoulders', 'back-biceps', 'core', 'pure-cardio'];
/** Splits that earn "Heavy". @type {Split[]} */
export const HEAVY_SPLITS = ['lower', 'chest-shoulders', 'back-biceps'];
/** Splits in the weekly split tracker. @type {Split[]} */
export const TRACKER_SPLITS = ['lower', 'chest-shoulders', 'back-biceps', 'core'];
/** Resistance splits ("All" in old data maps to these). @type {Split[]} */
export const RESISTANCE_SPLITS = ['lower', 'upper', 'chest-shoulders', 'back-biceps', 'core'];

/** @type {[Equip, string][]} */
export const EQUIPMENT = [
  ['full-gym', 'Full gym'],
  ['minimal-gym', 'Minimal gym'],
  ['home-travel', 'Home / travel'],
  ['bodyweight', 'Bodyweight'],
];

/** Tracking fields: label, unit, key used on a logged set. @type {[Field, string, string, keyof LoggedSet][]} */
export const FIELDS = [
  ['weight', 'Weight', 'lb', 'weight'],
  ['reps', 'Reps', '', 'reps'],
  ['time', 'Time', 'sec', 'timeSec'],
  ['distance', 'Distance', 'mi', 'distance'],
  ['speed', 'Speed', 'mph', 'speed'],
  ['incline', 'Incline', '%', 'incline'],
  ['hr', 'Heart rate', 'bpm', 'hr'],
  ['rpe', 'RPE', '1–10', 'rpe'],
];
/** @param {Field} f */
export const fieldKey = (f) => FIELDS.find((x) => x[0] === f)?.[3];

export const label = (/** @type {[string,string][]} */ list, /** @type {string} */ v) => list.find((x) => x[0] === v)?.[1] || v;

/** Weekly goals. */
export const GOALS = { heavy: 2, zone2: 2, hiit: 1, stepsPerDay: 8000, zone2Minutes: 20, heavyMinExercises: 2 };

/** Section time windows for the generator, in minutes. */
export const SECTION_WINDOWS = {
  mobility: { min: 8, aim: 10, max: 12 },
  posture: { min: 4, aim: 5, max: 6 },
  resistance: { min: 25, aim: 35, max: 45 },
  cardio: { min: 20, aim: 25, max: 30 },
};

/** Defaults when an exercise has no targets. */
export const DEFAULT_TARGETS = {
  resistance: { sets: 3, reps: 10, restSec: 60, durationSec: null },
  mobility: { sets: 1, reps: null, restSec: 15, durationSec: 60 },
  posture: { sets: 2, reps: 12, restSec: 30, durationSec: null },
  cardio: { sets: 1, reps: null, restSec: 0, durationSec: 20 * 60 },
};
export const SECONDS_PER_REP = 4;
export const SETUP_SEC = 30;

/**
 * @typedef {{ name: string, sec: number, type: 'work'|'rest', label?: string }} Segment
 */

/** 4×4 protocol: 3' warm-up, 4 × (4' hard), 3' active rest between. @type {Segment[]} */
export const PROTOCOL_4X4 = [
  { name: 'Warm-up', sec: 180, type: 'rest' },
  { name: 'Hard 1 of 4', sec: 240, type: 'work' },
  { name: 'Active rest', sec: 180, type: 'rest' },
  { name: 'Hard 2 of 4', sec: 240, type: 'work' },
  { name: 'Active rest', sec: 180, type: 'rest' },
  { name: 'Hard 3 of 4', sec: 240, type: 'work' },
  { name: 'Active rest', sec: 180, type: 'rest' },
  { name: 'Hard 4 of 4', sec: 240, type: 'work' },
];
export const COOLDOWN = /** @type {Segment[]} */ ([{ name: 'Cool-down', sec: 180, type: 'rest' }]);

export const FALLBACK_MOVES = ['Squats', 'Push-ups', 'Lunges (right)', 'Lunges (left)', 'Inchworm', 'Plank'];
/** 6-minute fallback: 45 s work / 15 s rest × 6. @type {Segment[]} */
export const FALLBACK_SCRIPT = FALLBACK_MOVES.flatMap((m, i) => [
  { name: m, sec: 45, type: /** @type {const} */ ('work') },
  { name: i < FALLBACK_MOVES.length - 1 ? `Next: ${FALLBACK_MOVES[i + 1]}` : 'Done!', sec: 15, type: /** @type {const} */ ('rest') },
]);

export const BACKUP_SCHEMA = 2;
