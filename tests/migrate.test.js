import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateLegacy, convertTemplate, convertDayKey, mergeById, builtinExercises, isLegacy } from '../app/js/core/migrate.js';
import { LEGACY_BUILTINS } from '../app/js/core/builtins.js';

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const NOW = Date.UTC(2026, 9, 16);

const allSets = (sessions) => sessions.flatMap((s) => s.sections.flatMap((x) => x.items.flatMap((i) => i.sets)));
const oldSets = (history) => history.flatMap((s) => s.exercises.flatMap((e) => e.sets));

test('old backup: every session, exercise entry and set survives', () => {
  const old = load('old-backup.json');
  const v2 = migrateLegacy(old, { source: 'backup', now: NOW });
  assert.equal(v2.sessions.length, old.history.length);
  assert.deepEqual(v2.sessions.map((s) => s.id).sort(), old.history.map((s) => s.id).sort());
  const items = v2.sessions.flatMap((s) => s.sections.flatMap((x) => x.items));
  assert.equal(items.length, old.history.flatMap((s) => s.exercises).length);
  assert.equal(allSets(v2.sessions).length, oldSets(old.history).length);
  const sum = (arr, k) => arr.reduce((t, x) => t + (x[k] || 0), 0);
  assert.equal(sum(allSets(v2.sessions), 'reps'), sum(oldSets(old.history), 'reps'));
  assert.equal(sum(allSets(v2.sessions), 'weight'), sum(oldSets(old.history), 'weight'));
  assert.equal(sum(allSets(v2.sessions), 'timeSec'), sum(oldSets(old.history), 'time'));
});

test('old backup: library = all built-ins + every custom exercise', () => {
  const old = load('old-backup.json');
  const v2 = migrateLegacy(old, { source: 'backup', now: NOW });
  assert.equal(v2.exercises.filter((e) => e.builtIn).length, LEGACY_BUILTINS.length);
  const custom = v2.exercises.filter((e) => !e.builtIn);
  assert.deepEqual(custom.map((e) => e.id), old.customExercises.map((e) => e.id));
  const hack = custom.find((e) => e.id === 'custom_1700000000001');
  assert.deepEqual(hack.categories, ['resistance']);
  assert.deepEqual(hack.splits, ['lower']);
  assert.deepEqual(hack.equipment, ['full-gym', 'minimal-gym', 'home-travel', 'bodyweight']);
  assert.equal(hack.notes, 'Feet high');
  assert.equal(hack.videoUrl, 'https://example.com/v1');
  const row = custom.find((e) => e.id === 'custom_1700000000003');
  assert.deepEqual(row.targets, { sets: 4, reps: '8-12', restSec: 90, durationSec: null });
  assert.deepEqual(row.tracking, ['weight', 'reps', 'rpe']);
  assert.deepEqual(row.equipment, ['full-gym']);
  assert.deepEqual(row.splits, ['back-biceps', 'core']);
});

test('session mapping: split, sections, set fields, legacy kept', () => {
  const v2 = migrateLegacy(load('old-backup.json'), { source: 'backup', now: NOW });
  const s = v2.sessions.find((x) => x.id === '1776000000000');
  assert.equal(s.split, 'lower');
  assert.equal(s.includeCardio, true);
  assert.equal(s.status, 'done');
  assert.deepEqual(s.sections.map((x) => x.category), ['mobility', 'resistance', 'cardio']);
  const tread = s.sections[2].items[0];
  assert.deepEqual(tread.sets[0], { at: 1776003000000, timeSec: 1500, speed: 3.5, incline: 8, rpe: 6 });
  assert.equal(s.sections[0].items[0].sets[0].reps, undefined, 'zero reps from the old form are dropped');
  assert.equal(s.sections[1].items[1].legacy.notes, 'Feet high');
  assert.equal(s.legacy.hasCardio, true);
  assert.equal(s.endedAt, 1776003600000);
});

test('forgotten-to-finish session ends 5 min after its last set; original kept', () => {
  const v2 = migrateLegacy(load('old-backup.json'), { source: 'backup', now: NOW });
  const s = v2.sessions.find((x) => x.id === '1776500000000');
  assert.equal(s.endedAt, 1776501000000 + 5 * 60000);
  assert.equal(s.legacy.endTime, 1776730000000);
  assert.equal(s.legacy.endTimeFixed, true);
});

test('old fitnessBucket becomes a credit override', () => {
  const v2 = migrateLegacy(load('old-backup.json'), { source: 'backup', now: NOW });
  const s = v2.sessions.find((x) => x.id === '1776900000000');
  assert.deepEqual(s.creditOverride, { heavy: false, zone2: true, hiit: false, split: null });
});

test('old localStorage state: overrides, deletions, active session, daily, plan', () => {
  const v2 = migrateLegacy(load('old-state.json'), { source: 'localStorage', now: NOW });
  const squat = v2.exercises.find((e) => e.id === 'lb_1');
  assert.equal(squat.name, 'Back Squat (high bar)');
  assert.equal(squat.targets.sets, 5);
  assert.equal(squat.modified, true);
  assert.equal(v2.exercises.find((e) => e.id === 'cs_7').deleted, true);
  const active = v2.sessions.find((s) => s.status === 'active');
  assert.equal(active.id, '1777000000000');
  assert.equal(active.endedAt, null);
  const daily = Object.fromEntries(v2.daily.map((d) => [d.date, d]));
  assert.deepEqual(daily['2026-10-15'], { date: '2026-10-15', source: 'migrated', steps: 9100, sleepHours: 7.5 });
  assert.equal(daily['2026-10-16'].heartPoints, 22);
  assert.equal(daily['2026-10-17'], undefined, 'zero steps are not stored');
  const plan = v2.settings.find((s) => s.key === 'plan');
  assert.deepEqual(plan.value, { id: 'vo2_max_12w', startDate: 1775000000000 });
  assert.equal(v2.plans[0].id, 'vo2_max_12w');
  assert.equal(v2.settings.find((s) => s.key === 'migratedFrom').value, 'localStorage');
});

test('built-ins: ids kept, "All" means any split, equipment mapped', () => {
  const b = builtinExercises();
  assert.equal(b.length, LEGACY_BUILTINS.length);
  const mob = b.find((e) => e.id === 'mob_1');
  assert.deepEqual(mob.splits, []);
  assert.deepEqual(mob.tracking, ['time', 'rpe']);
  assert.deepEqual(mob.targets, { sets: 2, reps: null, restSec: null, durationSec: 60 });
  const goblet = b.find((e) => e.id === 'lb_2');
  assert.deepEqual(goblet.equipment, ['full-gym', 'minimal-gym', 'home-travel']);
  const vo2 = b.find((e) => e.id === 'card_v1');
  assert.deepEqual(vo2.splits, []);
  assert.deepEqual(vo2.tracking, ['time', 'speed', 'hr', 'rpe']);
});

test('convertTemplate copes with junk', () => {
  const ex = convertTemplate({ id: 7, name: '', category: 'Weird', trackingFields: ['Nope'] });
  assert.equal(ex.id, '7');
  assert.deepEqual(ex.categories, ['resistance']);
  assert.deepEqual(ex.tracking, ['reps']);
  assert.equal(ex.equipment.length, 4);
});

test('day keys', () => {
  assert.equal(convertDayKey('Thu Oct 15 2026'), '2026-10-15');
  assert.equal(convertDayKey('2026-01-02'), '2026-01-02');
  assert.equal(convertDayKey('nonsense'), null);
});

test('merge by id: adds missing, never duplicates or overwrites', () => {
  const v2 = migrateLegacy(load('old-backup.json'), { source: 'backup', now: NOW });
  const edited = structuredClone(v2);
  edited.sessions[0].name = 'Edited in new app';
  const { data, added } = mergeById(edited, v2);
  assert.equal(data.sessions.length, v2.sessions.length);
  assert.equal(added.sessions, 0);
  assert.equal(data.sessions[0].name, 'Edited in new app');
  const partial = { ...edited, sessions: edited.sessions.slice(1) };
  const again = mergeById(partial, v2);
  assert.equal(again.added.sessions, 1);
  assert.equal(again.data.sessions.length, v2.sessions.length);
});

test('isLegacy', () => {
  assert.equal(isLegacy(load('old-backup.json')), true);
  assert.equal(isLegacy({ app: 'forge', schema: 2, sessions: [] }), false);
  assert.equal(isLegacy({ foo: 1 }), false);
});
