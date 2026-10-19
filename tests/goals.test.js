import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCredit, creditFor, weekSummary } from '../app/js/core/goals.js';

const T = (y, m, d, hh = 10) => new Date(y, m - 1, d, hh).getTime();
let n = 0;
const item = (sets = 1, extra = {}) => ({ id: `i${n++}`, exerciseId: 'x', name: 'x', targets: {}, sets: Array.from({ length: sets }, (_, i) => ({ at: i, reps: 10 })), ...extra });
/** @returns {any} */
const session = (split, sections, extra = {}) => ({
  id: `s${n++}`, kind: 'workout', split, includeCardio: false, equipment: null, startedAt: T(2026, 10, 14), endedAt: T(2026, 10, 14, 11),
  pausedMs: 0, status: 'done', source: 'forge', sections, ...extra,
});
const res = (...items) => ({ category: 'resistance', items });
const cardio = (...items) => ({ category: 'cardio', items });

test('Heavy needs 2 resistance exercises logged', () => {
  assert.equal(computeCredit(session('lower', [res(item())])).heavy, false);
  assert.equal(computeCredit(session('lower', [res(item(), item(0))])).heavy, false, 'an exercise with no sets does not count');
  const c = computeCredit(session('lower', [res(item(), item())]));
  assert.equal(c.heavy, true);
  assert.equal(c.split, 'lower');
});

test('Core: split tracker yes, Heavy no', () => {
  const c = computeCredit(session('core', [res(item(), item())]));
  assert.equal(c.heavy, false);
  assert.equal(c.split, 'core');
});

test('Pure Cardio never earns Heavy or a split', () => {
  const c = computeCredit(session('pure-cardio', [res(item(), item())]));
  assert.equal(c.heavy, false);
  assert.equal(c.split, null);
});

test('Zone 2 at 20 min of cardio; set without time uses target duration', () => {
  const short = computeCredit(session('pure-cardio', [cardio(item(0, { sets: [{ at: 1, timeSec: 19 * 60 }] }))]));
  assert.equal(short.zone2, false);
  const ok = computeCredit(session('pure-cardio', [cardio(item(0, { sets: [{ at: 1, timeSec: 12 * 60 }, { at: 2, timeSec: 8 * 60 }] }))]));
  assert.equal(ok.zone2, true);
  const target = computeCredit(session('pure-cardio', [cardio(item(0, { targets: { durationSec: 1500 }, sets: [{ at: 1 }] }))]));
  assert.equal(target.zone2, true);
});

test('completed 4×4 earns HIIT and Zone 2; unfinished earns neither', () => {
  const p = (completed) => ({ kind: '4x4', startedAt: 0, completedAt: completed ? 25 * 60000 : null, endedAt: completed ? null : 9 * 60000, hardDone: completed ? 4 : 1 });
  const done = computeCredit(session('pure-cardio', [cardio(item(0, { protocol: p(true) }))]));
  assert.equal(done.hiit, true);
  assert.equal(done.zone2, true);
  const half = computeCredit(session('pure-cardio', [cardio(item(0, { protocol: p(false) }))]));
  assert.equal(half.hiit, false);
  assert.equal(half.zone2, false);
});

test('one session can earn several goals', () => {
  const c = computeCredit(session('back-biceps', [res(item(), item()), cardio(item(0, { sets: [{ at: 1, timeSec: 1500 }] }))]));
  assert.deepEqual(c, { heavy: true, split: 'back-biceps', hiit: false, zone2: true });
});

test('fallback earns nothing; override wins', () => {
  assert.deepEqual(computeCredit(session('lower', [res(item(), item())], { kind: 'fallback' })), { heavy: false, zone2: false, hiit: false, split: null });
  const s = session('lower', [res(item())], { creditOverride: { heavy: true } });
  assert.equal(creditFor(s).heavy, true);
});

test('week is Sunday–Saturday', () => {
  const sat = session('lower', [res(item(), item())], { startedAt: T(2026, 10, 17, 23) }); // Saturday
  const sun = session('chest-shoulders', [res(item(), item())], { startedAt: T(2026, 10, 18, 0) }); // next Sunday
  const fb = session(null, [], { kind: 'fallback', startedAt: T(2026, 10, 12) });
  const active = session('core', [res(item(), item())], { status: 'active', startedAt: T(2026, 10, 13) });
  const w = weekSummary([sat, sun, fb, active], {}, T(2026, 10, 17, 12));
  assert.equal(w.heavy, 1);
  assert.deepEqual(w.splits, ['lower']);
  assert.equal(w.fallback, 1);
  assert.equal(new Date(w.from).getDay(), 0);
  const next = weekSummary([sat, sun], {}, T(2026, 10, 18, 9));
  assert.equal(next.heavy, 1);
  assert.deepEqual(next.splits, ['chest-shoulders']);
});

test('steps: today and days met so far this week', () => {
  const daily = { '2026-10-11': { date: '2026-10-11', steps: 9000 }, '2026-10-12': { date: '2026-10-12', steps: 7999 }, '2026-10-14': { date: '2026-10-14', steps: 8000 } };
  const w = weekSummary([], daily, T(2026, 10, 14, 18));
  assert.equal(w.stepsToday, 8000);
  assert.equal(w.stepDays, 2);
  assert.equal(w.days, 4);
});
