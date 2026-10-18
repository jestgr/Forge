// Health Connect reading (Android app) with a fake plugin: values land in
// daily[date].watch, typed numbers stay, a type that can't be read keeps its old values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakedom.js';

installFakeDom({ path: '/' });
const g = /** @type {any} */ (globalThis);
const today = new Date(); today.setHours(0, 0, 0, 0);
const day = (n) => new Date(today.getTime() + n * 86400000);
const iso = (n, h = 0) => new Date(day(n).getTime() + h * 3600000).toISOString();
let steps = 9812;
let failWeight = false;
const asked = [];
g.Capacitor = {
  isNativePlatform: () => true,
  Plugins: {
    Health: {
      isAvailable: async () => ({ available: true }),
      requestAuthorization: async (o) => { asked.push(o); return { readAuthorized: o.read, historyAccessAuthorized: false }; },
      queryAggregated: async (o) => {
        if (o.dataType === 'steps') return { samples: [{ startDate: iso(0), endDate: iso(1), value: steps, values: { sum: steps } }] };
        if (o.dataType === 'heartRate') return { samples: [{ startDate: iso(-1), endDate: iso(0), value: 70, values: { average: 70, min: 50, max: 140 } }] };
        return { samples: [] };
      },
      readSamples: async (o) => {
        if (o.dataType === 'weight') { if (failWeight) throw new Error('denied'); return { samples: [{ value: 80, startDate: iso(-1, 7) }] }; }
        if (o.dataType === 'sleep') return { samples: [{ value: 420, startDate: iso(-1, 23), endDate: iso(0, 6), sourceId: 'g' }] };
        return { samples: [] };
      },
      openHealthConnectSettings: async () => {},
    },
  },
};

const store = await import('../app/js/store.js');
const hc = await import('../app/js/platform/healthconnect.js');
const { dateKey } = await import('../app/js/core/util.js');
await store.load();
const key = (n) => dateKey(day(n));

test('connect asks read-only, with history, then reads 30 days', async () => {
  await store.saveDaily({ date: key(0), steps: 5000, source: 'manual' });
  const r = await hc.connect();
  assert.equal(asked[0].write.length, 0);
  assert.equal(asked[0].requestHistoryAccess, true);
  assert.equal(r.days, 30);
  assert.equal(r.failed.length, 0);
  const d0 = store.state.daily[key(0)];
  assert.equal(d0.steps, 5000, 'typed steps kept');
  assert.equal(d0.watch.steps, 9812);
  assert.equal(d0.watch.sleepMin, 420);
  assert.deepEqual([store.state.daily[key(-1)].watch.hrAvg, store.state.daily[key(-1)].watch.weightKg], [70, 80]);
  assert.ok(hc.settings().connected && hc.settings().lastSyncAt);
});

test('later reads cover a week; a type that fails keeps its old values', async () => {
  steps = 10400;
  failWeight = true;
  const r = await hc.pull();
  assert.equal(r.days, 7);
  assert.deepEqual(r.failed, ['Weight']);
  assert.equal(store.state.daily[key(0)].watch.steps, 10400);
  assert.equal(store.state.daily[key(-1)].watch.weightKg, 80);
});

test('the week counts watch steps when none were typed', async () => {
  const { weekSummary } = await import('../app/js/core/goals.js');
  await store.saveDaily({ date: key(0), watch: store.state.daily[key(0)].watch });
  assert.equal(weekSummary([], store.state.daily, Date.now(), 8000).stepsToday, 10400);
});

test('auto read waits 15 minutes between reads', async () => {
  let n = 0;
  const orig = g.Capacitor.Plugins.Health.queryAggregated;
  g.Capacitor.Plugins.Health.queryAggregated = async (o) => { n++; return orig(o); };
  hc.autoPull();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(n, 0);
});
