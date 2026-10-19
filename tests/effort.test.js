// Effort without a workout: raised heart rate found in all-day readings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effortThreshold, findEfforts, pendingEfforts, EFFORT_TYPE } from '../app/js/core/effort.js';
import { suggest, toSession, workoutLabel } from '../app/js/core/watch.js';

const now = new Date(2026, 9, 21, 18).getTime(); // Wed
const M = 60000;
const t0 = now - 6 * 60 * M; // noon
/** Readings every 2 min: [minutes from t0, bpm][] → samples */
const series = (from, to, bpm) => Array.from({ length: Math.floor((to - from) / 2) + 1 }, (_, i) => ({ t: t0 + (from + i * 2) * M, bpm: typeof bpm === 'function' ? bpm(from + i * 2) : bpm }));

test('threshold: 60 % of heart-rate reserve; hand-set values win', () => {
  assert.deepEqual(effortThreshold({ restingHr: 60, seenMax: 170 }), { bpm: 126, auto: 126, rest: 60, max: 170 });
  assert.equal(effortThreshold({ restingHr: 60, seenMax: 130 }).max, 160, 'low recent max is raised to 160');
  assert.equal(effortThreshold({}).bpm, 132, 'defaults: rest 60, max 180');
  assert.equal(effortThreshold({ restingHr: 60, maxHr: 190 }).bpm, 138);
  assert.equal(effortThreshold({ restingHr: 60, threshold: 110 }).bpm, 110);
});

test('finds a long stretch, allowing short dips', () => {
  const s = [...series(0, 30, 80), ...series(32, 100, (m) => (m === 60 || m === 62 ? 100 : 130)), ...series(102, 140, 80)];
  const e = findEfforts(s, 120);
  assert.equal(e.length, 1);
  assert.equal(e[0].type, EFFORT_TYPE);
  assert.equal(e[0].start, t0 + 32 * M);
  assert.equal(e[0].durationSec, 68 * 60);
  assert.deepEqual([e[0].maxHr > 120, e[0].avgHr > 120], [true, true]);
});

test('too short, or broken by a long dip → nothing', () => {
  assert.deepEqual(findEfforts(series(0, 16, 140), 120), []);
  const s = [...series(0, 14, 140), ...series(16, 30, 90), ...series(32, 46, 140)];
  assert.deepEqual(findEfforts(s, 120), []);
});

test('cards hide stretches inside sessions, watch workouts or ignored ranges', () => {
  const e = findEfforts(series(0, 60, 135), 120)[0];
  assert.equal(pendingEfforts([e], [], {}, [], now).length, 1);
  assert.equal(pendingEfforts([e], [{ status: 'done', startedAt: e.start - 5 * M, endedAt: e.end }], {}, [], now).length, 0);
  assert.equal(pendingEfforts([e], [], { w: { ...e, id: 'w', type: 'walking' } }, [], now).length, 0);
  assert.equal(pendingEfforts([e], [], {}, [[e.start, e.end]], now).length, 0);
  // Re-detected a bit longer after more data arrives: still hidden once chosen.
  const chosen = toSession(e, 'zone2');
  const longer = { ...e, id: 'hr_x', end: e.end + 10 * M };
  assert.equal(pendingEfforts([longer], [chosen], {}, [], now).length, 0);
});

test('an effort card suggests Zone 2 and is labelled', () => {
  const e = findEfforts(series(0, 60, 135), 120)[0];
  assert.equal(suggest(e), 'zone2');
  assert.equal(workoutLabel(e.type), 'Elevated heart rate');
});
