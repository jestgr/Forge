// Android app, Today tab: a watch workout card can be counted, the watch card's
// sync button reads Health Connect, and the History calendar shows day marks.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, byText, tick } from './helpers/fakedom.js';

const { body } = installFakeDom({ path: '/' });
const g = /** @type {any} */ (globalThis);
const realSetInterval = g.setInterval;
const handles = [];
g.setInterval = (...a) => { const id = realSetInterval(...a); handles.push(id); return id; };
after(() => handles.forEach((id) => clearInterval(id)));

let reads = 0;
let hrOn = false;
const start = Date.now() - 2 * 3600000;
g.Capacitor = {
  isNativePlatform: () => true,
  Plugins: {
    Health: {
      queryAggregated: async (o) => { if (o.dataType === 'steps') reads++; return { samples: o.dataType === 'steps' ? [{ startDate: new Date(Date.now() - 3600000).toISOString(), endDate: new Date().toISOString(), value: 12000, values: { sum: 12000 } }] : [] }; },
      // Wood chopping in the last 50 min: 40 min at 135 bpm, no workout started.
      readSamples: async (o) => ({ samples: o.dataType === 'heartRate' && hrOn
        ? Array.from({ length: 21 }, (_, i) => ({ value: 135, startDate: new Date(Date.now() - 50 * 60000 + i * 120000).toISOString() })) : [] }),
      queryWorkouts: async () => ({ workouts: [] }),
    },
  },
};

const { store } = await import('../app/js/app.js').then(() => g.forge);
await tick(60);

test('watch workout card → Zone 2 saves a session that counts', async () => {
  await store.setSetting('health', { connected: true, lastSyncAt: Date.now() });
  await store.setSetting('watchWorkouts', { abc: { id: 'abc', type: 'walking', start, end: start + 45 * 60000, durationSec: 2700, avgHr: 112, maxHr: 131 } });
  await tick(20);
  assert.ok(body.textContent.includes('what do these count as'));
  assert.ok(body.textContent.includes('avg 112 bpm'));
  byText(body, 'Zone 2', 'button').at(-1).click();
  await tick(30);
  const s = store.state.sessions.find((x) => x.id === 'w_abc');
  assert.equal(s.kind, 'watch');
  assert.equal(body.textContent.includes('what do these count as'), false, 'card gone');
  assert.ok(body.textContent.includes('Walking (watch)'), 'listed under Recent');
});

test('sync button on the watch card reads now', async () => {
  const btn = body.querySelectorAll('button').find((b) => b.attributes['aria-label'] === 'Read watch data now');
  assert.ok(btn, 'sync button');
  btn.click();
  await tick(40);
  assert.equal(reads, 1);
  assert.ok(body.textContent.includes('12,000'));
});

test('raised heart rate without a workout shows a card; Ignore hides it', async () => {
  hrOn = true;
  body.querySelectorAll('button').find((b) => b.attributes['aria-label'] === 'Read watch data now').click();
  await tick(40);
  assert.ok(body.textContent.includes('Elevated heart rate'));
  assert.ok(body.textContent.includes('No workout was started'));
  byText(body, 'Ignore', 'button').at(-1).click();
  await tick(30);
  assert.equal(body.textContent.includes('No workout was started'), false);
});

test('history calendar shows marks and a legend', async () => {
  g.setHash('#/history');
  await tick(30);
  assert.ok(body.textContent.includes('Step goal'));
  assert.ok(body.querySelectorAll('.m-zone2').length >= 2, 'day dot + legend');
  assert.ok(body.querySelectorAll('.m-steps').length >= 2);
});
