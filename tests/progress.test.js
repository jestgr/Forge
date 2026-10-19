import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSets, exerciseHistory, suggest } from '../app/js/core/progress.js';

const S = (reps, weight, extra = {}) => ({ at: 1, reps, weight, ...extra });

test('summaries', () => {
  assert.equal(summarizeSets([S(8, 135), S(8, 135), S(8, 135)]), '3 × 8 @ 135 lb');
  assert.equal(summarizeSets([S(8, 135), S(6, 145)]), '135×8, 145×6 lb');
  assert.equal(summarizeSets([{ at: 1, timeSec: 60 }, { at: 2, timeSec: 60 }]), '2 × 1:00');
  assert.equal(summarizeSets([{ at: 1, timeSec: 1500, speed: 3.5, incline: 8 }]), '25:00 · 3.5 mph · 8%');
  assert.equal(summarizeSets([S(12), S(10)]), '12, 10 reps');
  assert.equal(summarizeSets([]), '—');
});

test('history: newest first, only finished sessions with sets, max 10', () => {
  const sessions = Array.from({ length: 14 }, (_, i) => ({
    id: `s${i}`, status: i === 13 ? 'active' : 'done', startedAt: 1000 * i,
    sections: [{ category: 'resistance', items: [{ exerciseId: 'lb_1', sets: i === 5 ? [] : [S(8, 100 + i)] }] }],
  }));
  const h = exerciseHistory('lb_1', sessions);
  assert.equal(h.length, 10);
  assert.equal(h[0].sessionId, 's12');
  assert.ok(!h.some((x) => x.sessionId === 's5' || x.sessionId === 's13'));
});

const T = { sets: 3, reps: 8, restSec: 120 };
test('suggest: +5 lb after hitting target twice (≥100 lb), +2.5 below', () => {
  const hit = (w) => ({ sets: [S(8, w), S(8, w), S(8, w)] });
  assert.equal(suggest([hit(135), hit(135)], T, 'resistance').weight, 140);
  assert.equal(suggest([hit(40), hit(40)], T, 'resistance').weight, 42.5);
  assert.match(suggest([hit(135), { sets: [S(6, 135)] }], T, 'resistance').text, /repeat it once more/);
  assert.match(suggest([{ sets: [S(8, 135), S(6, 135)] }], T, 'resistance').text, /Repeat 135 lb/);
});

test('suggest: hold at RPE 9+, first time, reps-only, timed', () => {
  assert.match(suggest([{ sets: [S(8, 135, { rpe: 9 })] }], T, 'resistance').text, /Hold/);
  assert.match(suggest([], T, 'resistance').text, /First time/);
  assert.match(suggest([{ sets: [S(12), S(12)] }], { sets: 2, reps: 12 }, 'posture').text, /1–2 more reps/);
  assert.match(suggest([{ sets: [{ at: 1, timeSec: 60 }, { at: 2, timeSec: 60 }] }], { sets: 2, durationSec: 60 }, 'mobility').text, /1:05/);
  assert.match(suggest([{ sets: [S(10, 50), S(10, 50), S(12, 50)] }], { sets: 3, reps: '8-12' }, 'resistance').text, /Repeat 50 lb/);
});
