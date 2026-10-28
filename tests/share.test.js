import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preflightSummary } from '../app/js/core/share.js';

const T = (y, m, d, hh = 10) => new Date(y, m - 1, d, hh).getTime();
const item = () => ({ id: Math.random().toString(36), exerciseId: 'x', name: 'x', targets: {}, sets: [{ at: 0, reps: 10 }] });
/** @returns {any} */
const heavy = (day) => ({
  id: `s${day}`, kind: 'workout', split: 'lower', includeCardio: false, equipment: null,
  startedAt: T(2026, 10, day), endedAt: T(2026, 10, day, 11), pausedMs: 0, status: 'done', source: 'forge',
  sections: [{ category: 'resistance', items: [item(), item()] }],
});

test('Preflight summary: week goals, today steps and calories', () => {
  const now = T(2026, 10, 28, 14); // Wed
  const daily = /** @type {any} */ ({
    '2026-10-26': { date: '2026-10-26', steps: 9100 },
    '2026-10-28': { date: '2026-10-28', watch: { steps: 6240, activeKcal: 412.6 } },
  });
  const s = preflightSummary([heavy(26), heavy(27)], daily, {}, now);
  assert.equal(s.v, 1);
  assert.equal(s.date, '2026-10-28');
  assert.equal(s.steps, 6240);
  assert.equal(s.activeKcal, 413);
  assert.equal(s.stepGoal, 8000);
  assert.equal(s.stepDays, 1);
  assert.deepEqual([s.heavy, s.heavyGoal, s.zone2, s.zone2Goal, s.hiit, s.hiitGoal], [2, 2, 0, 2, 0, 1]);
});

test('Preflight summary: no watch calories → null, own step goal', () => {
  const s = preflightSummary([], {}, { stepGoal: 10000 }, T(2026, 10, 28));
  assert.equal(s.activeKcal, null);
  assert.equal(s.steps, 0);
  assert.equal(s.stepGoal, 10000);
});
