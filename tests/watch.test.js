// Watch workouts → cards → sessions, and the calendar's day marks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workoutLabel, fromPlugin, hrStats, suggest, pending, toSession, prune, overlapping } from '../app/js/core/watch.js';
import { creditFor, weekSummary, dayMarks } from '../app/js/core/goals.js';
import { dateKey } from '../app/js/core/util.js';

const now = new Date(2026, 9, 21, 18).getTime(); // Wed 21 Oct 2026
const H = 3600000;
const w = (o = {}) => ({ id: 'x1', type: 'walking', start: now - 5 * H, end: now - 4 * H, durationSec: 3600, ...o });

test('labels and plugin conversion', () => {
  assert.equal(workoutLabel('runningTreadmill'), 'Running treadmill');
  assert.equal(workoutLabel('other'), 'Workout');
  assert.equal(fromPlugin({ startDate: 'bad' }), null);
  const c = fromPlugin({ platformId: 'p', workoutType: 'running', duration: 1800, startDate: '2026-10-21T10:00:00Z', endDate: '2026-10-21T10:30:00Z' });
  assert.equal(c.id, 'p');
  assert.equal(c.durationSec, 1800);
  assert.deepEqual(hrStats([{ value: 90 }, { value: 0 }, { value: 150 }]), { avgHr: 120, maxHr: 150 });
  assert.deepEqual(hrStats([]), { avgHr: null, maxHr: null });
});

test('suggestion: strength → Heavy, HIIT → HIIT, ≥20 min cardio → Zone 2, else Ignore', () => {
  assert.equal(suggest(w({ type: 'strengthTraining' })), 'heavy');
  assert.equal(suggest(w({ type: 'highIntensityIntervalTraining' })), 'hiit');
  assert.equal(suggest(w()), 'zone2');
  assert.equal(suggest(w({ durationSec: 600 })), null);
  assert.equal(suggest(w({ type: 'yoga' })), null);
});

test('a workout during a Forge session suggests Ignore', () => {
  const forge = { id: 's1', kind: 'workout', status: 'done', startedAt: now - 5.5 * H, endedAt: now - 4.5 * H, sections: [] };
  assert.equal(overlapping(w(), [forge]), forge);
  assert.equal(suggest(w(), [forge]), null);
});

test('cards: this week only, gone once chosen or ignored', () => {
  const all = { a: w({ id: 'a' }), b: w({ id: 'b' }), old: w({ id: 'old', start: now - 10 * 24 * H, end: now - 10 * 24 * H + H }) };
  assert.deepEqual(pending(all, [], [], now).map((x) => x.id).sort(), ['a', 'b']);
  assert.deepEqual(pending(all, [toSession(all.a, 'zone2')], ['b'], now), []);
  assert.deepEqual(Object.keys(prune(all, now, 7)).sort(), ['a', 'b']);
});

test('a chosen workout counts toward the week', () => {
  const z = toSession(w({ id: 'z' }), 'zone2');
  const hv = toSession(w({ id: 'h', type: 'strengthTraining' }), 'heavy');
  assert.deepEqual(creditFor(/** @type {any} */ (z)), { heavy: false, zone2: true, hiit: false, split: null });
  const sum = weekSummary(/** @type {any} */ ([z, hv]), {}, now);
  assert.deepEqual([sum.zone2, sum.heavy, sum.hiit], [1, 1, 0]);
  // Changed by hand later (history) still works.
  assert.equal(creditFor(/** @type {any} */ ({ ...z, creditOverride: { hiit: true } })).hiit, true);
});

test('calendar marks per day', () => {
  const today = dateKey(now);
  const forge = { id: 's', kind: 'workout', split: 'lower', status: 'done', startedAt: now - H, endedAt: now, sections: [
    { category: 'resistance', items: [{ sets: [{ at: 1 }] }, { sets: [{ at: 2 }] }] },
    { category: 'cardio', items: [{ sets: [{ at: 3, timeSec: 600 }] }] }] };
  const fb = { id: 'f', kind: 'fallback', status: 'done', startedAt: now - 30 * H, sections: [] };
  const walk = toSession(w({ id: 'wk', start: now - 50 * H, end: now - 49 * H }), 'zone2');
  const daily = { [today]: { date: today, watch: { steps: 9000, sleepMin: 400 } }, '2026-10-19': { date: '2026-10-19', sleepHours: 8 } };
  const m = dayMarks(/** @type {any} */ ([forge, fb, walk]), daily, { stepGoal: 8000, sleepGoal: 7 });
  assert.deepEqual(m[today], ['heavy', 'cardio', 'steps']); // 10 min cardio: not Zone 2; 6.75 h sleep < 7
  assert.deepEqual(m['2026-10-20'], ['fallback']);
  assert.deepEqual(m['2026-10-19'], ['zone2', 'sleep']);
  // A session that earned nothing still shows it happened.
  const empty = { id: 'e', kind: 'workout', split: 'lower', status: 'done', startedAt: now - 75 * H, sections: [] };
  assert.deepEqual(dayMarks(/** @type {any} */ ([empty]), {})[dateKey(now - 75 * H)], ['workout']);
});

test('calendar fits every mark on one day (2 rows of 4)', async () => {
  const { MARKS } = await import('../app/js/core/goals.js');
  const css = (await import('node:fs')).readFileSync(new URL('../app/css/app.css', import.meta.url), 'utf8');
  const max = Number(css.match(/\.cal \.day \.dots \{[^}]*max-width: (\d+)px/)[1]);
  const perRow = Math.floor((max + 2) / (6 + 2));
  assert.ok(perRow * 2 >= MARKS.length, `${perRow} per row`);
});
