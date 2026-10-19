// Phone Back button must always close the top sheet, even when one sheet
// closes and another opens straight away (e.g. confirm → picker).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, tick } from './helpers/fakedom.js';

installFakeDom();
const g = /** @type {any} */ (globalThis);
const depth = [];
const realPush = g.history.pushState;
g.history.pushState = (st) => { depth.push(st); realPush(st); };
const realBack = g.history.back;
g.history.back = () => { depth.pop(); realBack(); };
const { openSheet } = await import('../app/js/ui/dom.js');

const layers = () => g.document.getElementById('layers').childElementCount;

test('close-then-open keeps one history entry per open sheet', async () => {
  const closeA = openSheet(() => g.document.createElement('div'));
  assert.equal(depth.length, 1);
  closeA();
  openSheet(() => g.document.createElement('div'));
  await tick(20);
  assert.equal(layers(), 1);
  assert.equal(depth.length, 1, 'the new sheet has its own entry');
  // Back closes it.
  g.history.back();
  await tick(20);
  assert.equal(layers(), 0);
});

test('nested sheets close one per Back', async () => {
  openSheet(() => g.document.createElement('div'));
  openSheet(() => g.document.createElement('div'));
  assert.equal(layers(), 2);
  g.history.back();
  await tick(20);
  assert.equal(layers(), 1);
  g.history.back();
  await tick(20);
  assert.equal(layers(), 0);
});
