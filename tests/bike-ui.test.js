// Echelon bike in the Android app: a fake EchelonBike plugin sends packets; the ride is shown live and saved
// as a cardio set that counts toward Zone 2.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, byText, tick } from './helpers/fakedom.js';
import { checksum } from '../app/js/core/bike.js';
import { computeCredit } from '../app/js/core/goals.js';

const { body } = installFakeDom({ path: '/' });
const g = /** @type {any} */ (globalThis);
const realSetInterval = g.setInterval;
const handles = [];
g.setInterval = (...a) => { const id = realSetInterval(...a); handles.push(id); return id; };
after(() => handles.forEach((id) => clearInterval(id)));

/** @type {Record<string, Function>} */
const listeners = {};
const written = [];
let connected = false;
g.Capacitor = {
  isNativePlatform: () => true,
  Plugins: {
    EchelonBike: {
      addListener: async (ev, fn) => { listeners[ev] = fn; return { remove: async () => { delete listeners[ev]; } }; },
      connect: async () => { listeners.state?.({ state: 'connected', name: 'ECH-TEST' }); connected = true; return { name: 'ECH-TEST' }; },
      write: async (o) => { written.push(o.value); },
      disconnect: async () => { connected = false; },
    },
  },
};
const pkt = (/** @type {number[]} */ b) => ({ value: [...b, checksum(b)] });
const data = (sec, km100, rpm) => pkt([0xf0, 0xd1, 0x09, sec >> 8, sec & 0xff, 0, 0, km100 >> 8, km100 & 0xff, 0, rpm, 0]);

const click = async (text, i = 0) => {
  const els = byText(body, text, 'button');
  assert.ok(els[i], `no button "${text}"`);
  els[i].click();
  await tick(30);
};
const has = (text) => body.textContent.includes(text);

const { store } = await import('../app/js/app.js').then(() => g.forge);
await tick(60);

test('ride on the Echelon bike → saved cardio set, Zone 2', async () => {
  await click('Begin next session');
  await click('Pure Cardio');
  await click('Build workout');
  await tick(50);
  assert.ok(has('Connect Echelon bike'));
  await click('Connect Echelon bike');
  await tick(30);
  assert.ok(connected);
  assert.deepEqual(written[0], [0xf0, 0xa1, 0x00, 0x91], 'init commands sent');
  assert.ok(has('Connected') && has('ECH-TEST'));

  listeners.data(data(100, 50, 0)); // console was already running: 100 s, 0.50 km
  listeners.data(pkt([0xf0, 0xd2, 0x01, 12]));
  listeners.data(data(700, 650, 85));
  listeners.data(data(1300, 1300, 88));
  await tick(20);
  assert.ok(has('20:00'), 'live time = gained since connecting');
  assert.ok(has('88') && has('12'), 'live rpm + resistance');

  await click('Stop & save ride');
  await tick(50);
  assert.equal(connected, false);
  const s = store.activeSession();
  const it = s.sections.flatMap((x) => x.items).find((i) => i.ride);
  assert.ok(it, 'ride stored on the item');
  assert.equal(it.sets[0].timeSec, 1200);
  assert.equal(it.sets[0].distance, 7.77);
  assert.equal(it.ride.avgCadence, 87);
  assert.equal(computeCredit(s).zone2, true);
  assert.ok(has('87 rpm avg'));
});
