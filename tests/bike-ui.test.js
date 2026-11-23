// Echelon bike, end to end in a fake browser:
//  A) Android app (fake native plugin), cardio add-on → small live panel in the card → stop → chart →
//     Log ride pre-filled → saved set + summary with picture → Zone 2.
//  B) Bike simulator, Pure Cardio → full-screen ride view → simulated dropout → automatic reconnect,
//     ride kept → stop → log.
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
const live = (key) => body.querySelector(`.bk-${key}`)?.textContent;

const { store } = await import('../app/js/app.js').then(() => g.forge);
const bike = await import('../app/js/platform/bike.js');
const hr = await import('../app/js/platform/hr.js');
await tick(60);

/** Put a Stationary Bike into the active session's cardio section. */
async function addBike() {
  const s = structuredClone(store.activeSession());
  let sec = s.sections.find((x) => x.category === 'cardio');
  if (!sec) { sec = { category: 'cardio', items: [] }; s.sections.push(sec); }
  sec.items.unshift({ id: 'bike1', exerciseId: 'card_2', name: 'Stationary Bike', targets: {}, sets: [] });
  await store.saveSession(s);
  await tick(30);
}

test('A: cardio add-on → live panel in the card → chart → Log ride pre-filled', async () => {
  await click('Begin next session');
  await click('Lower Body');
  await click('Yes');
  await click('Build workout');
  await addBike();
  const bikes = store.activeSession().sections.flatMap((x) => x.items).filter((i) => i.exerciseId === 'card_2').length;
  assert.equal(byText(body, 'Connect Echelon bike', 'button').length, bikes, 'only on bike exercises');
  await click('Connect Echelon bike');
  await tick(30);
  assert.ok(connected);
  assert.deepEqual(written[0], [0xf0, 0xa1, 0x00, 0x91], 'init commands sent');
  assert.ok(body.querySelector('.bike-panel'), 'small panel in the card');
  assert.ok(!has('Echelon ride'), 'no full-screen view for an add-on');
  assert.ok(has('Connected') && has('ECH-TEST'));

  // Packets as the bike sends them, one per (fake) second of a 20-minute ride.
  const realNow = Date.now;
  const t0 = realNow();
  Date.now = () => t0;
  listeners.data(data(100, 50, 0)); // console was already running: 100 s, 0.50 km
  listeners.data(pkt([0xf0, 0xd2, 0x01, 12]));
  for (let s = 101; s <= 1300; s++) {
    Date.now = () => t0 + (s - 100) * 1000;
    listeners.data(data(s, 50 + Math.round((s - 100) * 1250 / 1200), 88));
  }
  Date.now = realNow;
  await tick(20);
  assert.equal(live('cadence'), '88');
  assert.equal(live('resistance'), '12');
  assert.equal(live('watts'), String(Math.round(1.090112 ** 12 * 1.015343 ** 88 * 7.228958)));
  assert.equal(live('time'), '20:00', 'time gained since connecting');
  assert.equal(live('avgCadence'), '88', 'live averages');
  assert.ok(body.querySelector('.bk-chart'), 'live chart');
  assert.ok(!has('Connect heart rate'), 'no heart-rate button without the HeartRate plugin');

  await click('Stop ride');
  await tick(50);
  assert.equal(connected, false);
  assert.ok(has('Ride done'));
  assert.ok(body.querySelector('.ride-chart'), 'chart shown');
  assert.ok(has('Best efforts') && has('20 min') && has('first one'), 'best efforts, nothing to compare with yet');
  assert.ok(has('Splits (5 min)') && has('15–20'), 'splits');
  assert.ok(has('Work ') && has(' kJ'), 'work');
  const it0 = store.activeSession().sections.flatMap((x) => x.items).find((i) => i.id === 'bike1');
  assert.ok(it0.ride && !it0.ride.logged, 'ride kept before logging');
  assert.ok(it0.ride.chart.startsWith('data:image/svg+xml,'));
  assert.equal(it0.sets.length, 0, 'nothing logged without checking first');

  await click('Log this ride');
  assert.ok(has('Log ride'));
  assert.ok(has('Distance'), 'distance offered even though Stationary Bike doesn’t track it');
  await click('Save set');
  await tick(40);
  const s = store.activeSession();
  const it = s.sections.flatMap((x) => x.items).find((i) => i.id === 'bike1');
  assert.equal(it.sets[0].timeSec, 1200);
  assert.equal(it.sets[0].distance, 7.77);
  assert.equal(it.ride.logged, true);
  assert.equal(it.ride.avgCadence, 88);
  assert.ok(it.ride.kcal > 0);
  assert.equal(computeCredit(s).zone2, true);
  assert.ok(body.querySelector('.ride-thumb'), 'saved picture on the card');
  assert.ok(has('Ride again'));

  await click('Finish session');
  await click('Save session');
  await tick(40);
  assert.equal(store.activeSession(), null);
});

test('B: simulator, Pure Cardio → full-screen view, heart rate, dropout → reconnects, ride kept', async () => {
  Object.assign(bike.timing, { simTickMs: 15, retryMs: 40, quietMs: 1000 });
  Object.assign(hr.hrTiming, { simTickMs: 15, retryMs: 40, staleMs: 1000 });
  await store.setSetting('bikeSim', true);
  await click('Begin next session');
  await click('Pure Cardio');
  await click('Build workout');
  await addBike();
  await click('Connect Echelon bike');
  await tick(150);
  assert.ok(has('Echelon ride'), 'full-screen ride view');
  assert.ok(has('ECH-SIM'));
  assert.equal(bike.bikeRide()?.status, 'connected');
  await tick(300);
  const before = bike.bikeRide()?.ride.summary().timeSec || 0;
  assert.ok(before > 5, `time is counting (${before})`);

  await click('Connect heart rate');
  await tick(200);
  assert.equal(hr.hrLink()?.status, 'connected');
  assert.ok(Number(live('hr')) > 80, `heart rate shown (${live('hr')})`);
  assert.equal(store.state.settings.hrDevice?.name, 'HR-SIM', 'remembered for next time');
  assert.ok(hr.hrAuto(), 'connects on its own next ride');
  await click('Simulate HR dropout');
  assert.equal(hr.hrLink()?.status, 'reconnecting');
  await tick(300);
  assert.equal(hr.hrLink()?.status, 'connected', 'heart rate reconnected by itself');

  await click('Simulate dropout');
  assert.equal(bike.bikeRide()?.status, 'reconnecting');
  assert.ok(has('reconnecting'));
  assert.ok(has('Your ride is kept'));
  await tick(500);
  assert.equal(bike.bikeRide()?.status, 'connected', 'reconnected by itself');
  const after = bike.bikeRide()?.ride.summary().timeSec || 0;
  assert.ok(after > before, 'kept counting from where it was');

  await click('Stop ride');
  await tick(50);
  assert.equal(hr.hrLink(), null, 'heart rate stopped with the ride');
  assert.ok(has('Ride done'));
  assert.ok(has('Time in heart-rate zones'), 'zones');
  assert.ok(has('Heart rate (avg'), 'heart-rate chart');
  await click('Log this ride');
  await click('Save set');
  await tick(40);
  const it = store.activeSession().sections.flatMap((x) => x.items).find((i) => i.id === 'bike1');
  assert.equal(it.sets.length, 1);
  assert.ok(it.ride.avgHr > 80 && it.ride.maxHr >= it.ride.avgHr, 'heart rate saved with the ride');
  assert.ok(it.ride.zones.reduce((a, b) => a + b, 0) > 0);
  assert.ok(it.sets[0].timeSec >= after);
  assert.ok(it.ride.maxWatts > 0);
});

test('C: 4×4 on the bike → one combined screen, hard intervals tagged, per-interval table at the end', async () => {
  Object.assign(bike.timing, { simTickMs: 15, retryMs: 40, quietMs: 1000 });
  const old = store.activeSession();
  if (old) await store.deleteSession(old.id);
  location.hash = '#/';
  await tick(50);
  await click('Begin next session');
  await click('Pure Cardio');
  await click('Build workout');
  await addBike();
  await click('Connect Echelon bike');
  await tick(200);
  assert.ok(has('Echelon ride'));
  await click('Begin 4×4 protocol');
  await tick(50);
  assert.ok(has('4×4 ride'), 'combined screen');
  assert.equal(body.querySelectorAll('.ride-full').length, 1, 'no second ride screen');
  assert.ok(has('Warm-up'), 'countdown in the ride screen');
  assert.ok(bike.bikeRide()?.ride.samples().slice(-1)[0].hard === 0, 'warm-up tagged 0');

  // Jump into hard interval 1 (warm-up is 3 min): later packets are tagged 1, the screen follows.
  const s = structuredClone(store.activeSession());
  s.sections.flatMap((x) => x.items).find((i) => i.id === 'bike1').protocol.startedAt = Date.now() - 200_000;
  await store.saveSession(s);
  (await import('../app/js/ui/dom.js')).refreshSheets();
  await tick(400);
  assert.ok(has('Hard 1 of 4'), 'in hard 1');
  assert.ok(has('Target '), 'heart-rate target during hard');
  const tagged = bike.bikeRide()?.ride.samples().filter((x) => x.hard === 1).length || 0;
  assert.ok(tagged > 3, `samples tagged hard 1 (${tagged})`);

  await click('Stop ride');
  await tick(50);
  assert.ok(has('4×4 hard intervals') && has('#1'), 'per-interval table');
  const saved = store.activeSession().sections.flatMap((x) => x.items).find((i) => i.id === 'bike1');
  assert.equal(saved.ride.intervals[0].n, 1);
  assert.ok(!saved.protocol.completedAt && !saved.protocol.endedAt, '4×4 keeps running after the ride stops');
  assert.ok(has('4×4 running — open'));
});

test('D: Lower Body + cardio add-on, 4×4 on the bike completed → session earns Heavy, Lower, Zone 2 and HIIT', async () => {
  const old = store.activeSession();
  if (old) await store.deleteSession(old.id);
  location.hash = '#/';
  await tick(50);
  await click('Begin next session');
  await click('Lower Body');
  await click('Yes');
  await click('Build workout');
  await addBike();
  await click('Connect Echelon bike');
  await tick(200);
  assert.ok(!has('Echelon ride'), 'add-on: small panel, no full screen yet');
  await click('Begin 4×4 protocol');
  await tick(50);
  assert.ok(has('4×4 ride'), 'add-on + 4×4 → combined screen');

  // Fast-forward past the end of the 4×4 (28 min): the ride screen completes it.
  const s = structuredClone(store.activeSession());
  s.sections.flatMap((x) => x.items).find((i) => i.id === 'bike1').protocol.startedAt = Date.now() - 1690_000;
  // Two resistance exercises with a logged set (Heavy needs 2).
  for (const it of s.sections.find((x) => x.category === 'resistance').items.slice(0, 2)) it.sets.push({ at: Date.now(), reps: 10, weight: 50 });
  await store.saveSession(s);
  (await import('../app/js/ui/dom.js')).refreshSheets();
  await tick(400);
  const bk = store.activeSession().sections.flatMap((x) => x.items).find((i) => i.id === 'bike1');
  assert.ok(bk.protocol.completedAt, '4×4 completed from the ride screen');
  assert.ok(bike.bikeRide(), 'ride keeps going after the 4×4');

  await click('Stop ride');
  await tick(50);
  await click('Log this ride');
  await click('Save set');
  await tick(40);
  const credit = computeCredit(store.activeSession());
  assert.deepEqual(credit, { heavy: true, split: 'lower', hiit: true, zone2: true });
  await click('Finish session');
  assert.ok(has('HIIT'), 'finish screen shows HIIT');
  await click('Save session');
  await tick(40);
  assert.equal(store.activeSession(), null);
});
