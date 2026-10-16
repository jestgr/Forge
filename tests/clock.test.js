import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as clock from '../app/js/core/clock.js';

const s0 = { id: 's', clockStartedAt: null, pausedMs: 0, endedAt: null };
const sec = (n) => n * 1000;

test('idle until started; elapsed excludes pauses', () => {
  assert.equal(clock.interval(s0, 0).mode, 'idle');
  let s = clock.start(s0, sec(100));
  assert.equal(clock.elapsedMs(s, sec(160)), sec(60));
  s = clock.pause(s, sec(160));
  assert.equal(clock.elapsedMs(s, sec(400)), sec(60));
  assert.equal(clock.interval(s, sec(400)).mode, 'paused');
  s = clock.resume(s, sec(400));
  assert.equal(clock.elapsedMs(s, sec(430)), sec(90));
  assert.equal(Math.round(clock.interval(s, sec(430)).sec), 90, 'work interval shifted by the pause');
});

test('rest counts down, then flips to work', () => {
  let s = clock.start(s0, 0);
  s = clock.afterSet(s, sec(40), 90);
  let iv = clock.interval(s, sec(70));
  assert.equal(iv.mode, 'rest');
  assert.equal(iv.sec, 60);
  iv = clock.interval(s, sec(140));
  assert.equal(iv.mode, 'work');
  assert.equal(iv.sec, 10);
  assert.equal(iv.restOver, true);
});

test('skip rest; totals split work vs rest', () => {
  let s = clock.start(s0, 0);
  s = clock.afterSet(s, sec(40), 90);       // work 40
  s = clock.closeRest(s, sec(70));          // rest 30 (skipped)
  s = clock.afterSet(s, sec(100), 60);      // work 30
  const t = clock.totals(s, sec(200));      // rest 60 (ran out), then work 40
  assert.equal(t.totalSec, 200);
  assert.equal(t.restSec, 90);
  assert.equal(t.workSec, 110);
});

test('pause during rest keeps the remaining rest', () => {
  let s = clock.start(s0, 0);
  s = clock.afterSet(s, sec(10), 60);
  s = clock.pause(s, sec(30));
  s = clock.resume(s, sec(300));
  const iv = clock.interval(s, sec(310));
  assert.equal(iv.mode, 'rest');
  assert.equal(iv.sec, 30);
});
