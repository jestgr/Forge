import { test } from 'node:test';
import assert from 'node:assert/strict';
import { position, runSeconds, totalSec, settle } from '../app/js/core/timeline.js';
import { PROTOCOL_4X4, FALLBACK_SCRIPT, FALLBACK_MOVES } from '../app/js/core/model.js';

test('4×4 = 3 warm-up + 4×4 hard + 3×3 rest = 28 min', () => {
  assert.equal(totalSec(PROTOCOL_4X4), 28 * 60);
  assert.equal(PROTOCOL_4X4.filter((s) => s.type === 'work').length, 4);
  assert.ok(PROTOCOL_4X4.filter((s) => s.type === 'work').every((s) => s.sec === 240));
  assert.equal(PROTOCOL_4X4[0].sec, 180);
});

test('position at any time', () => {
  assert.deepEqual(position(PROTOCOL_4X4, 0).segment.name, 'Warm-up');
  const p = position(PROTOCOL_4X4, 180 + 239);
  assert.equal(p.segment.name, 'Hard 1 of 4');
  assert.equal(p.left, 1);
  assert.equal(position(PROTOCOL_4X4, 180 + 240).segment.name, 'Active rest');
  assert.equal(position(PROTOCOL_4X4, 180 + 240).workDone, 1);
  const end = position(PROTOCOL_4X4, 28 * 60);
  assert.equal(end.done, true);
  assert.equal(end.workDone, 4);
});

test('fallback = 6 moves × (45 + 15) = 6 min, brief’s moves', () => {
  assert.equal(totalSec(FALLBACK_SCRIPT), 360);
  assert.deepEqual(FALLBACK_SCRIPT.filter((s) => s.type === 'work').map((s) => s.name), FALLBACK_MOVES);
  assert.deepEqual(FALLBACK_MOVES, ['Squats', 'Push-ups', 'Lunges (right)', 'Lunges (left)', 'Inchworm', 'Plank']);
});

test('pauses and skips', () => {
  const run = { startedAt: 0, pausedMs: 60000, pausedAt: null, skipSec: 30 };
  assert.equal(runSeconds(run, 120000), 90);
  assert.equal(runSeconds({ ...run, pausedAt: 100000 }, 500000), 70);
});

test('settle: finished run reports when it ended', () => {
  const run = { startedAt: 1000, pausedMs: 0, pausedAt: null, skipSec: 0 };
  const st = settle(PROTOCOL_4X4, run, 1000 + 40 * 60000);
  assert.equal(st.done, true);
  assert.equal(st.endAt, 1000 + 28 * 60000);
  const half = settle(PROTOCOL_4X4, run, 1000 + 10 * 60000);
  assert.deepEqual([half.done, half.workDone], [false, 1]);
});
