// Watch metrics: raw Health Connect readings → one value per day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METRICS, readTypes, foldAggregate, foldSamples, mergeDays, stepsOf, sleepHoursOf, asleepMinutes } from '../app/js/core/metrics.js';
import { fromDateKey } from '../app/js/core/util.js';

const m = (id) => METRICS.find((x) => x.id === id);
const at = (date, hour) => new Date(fromDateKey(date) + hour * 3600000).toISOString();

test('asks to read every metric type plus workouts, nothing twice', () => {
  const t = readTypes();
  assert.equal(new Set(t).size, t.length);
  for (const x of ['steps', 'sleep', 'calories', 'totalCalories', 'distance', 'heartRate', 'restingHeartRate', 'heartRateVariability', 'weight', 'bodyFat', 'workouts']) assert.ok(t.includes(x), x);
});

test('aggregated day buckets land on their local day', () => {
  const out = foldAggregate(m('steps'), [
    { startDate: at('2026-10-16', 0), endDate: at('2026-10-17', 0), value: 9812, values: { sum: 9812 } },
    { startDate: at('2026-10-17', 0), endDate: at('2026-10-18', 0), value: 0, values: { sum: 0 } },
  ]);
  assert.deepEqual(out, { '2026-10-16': { steps: 9812 } });
});

test('heart rate splits into average / min / max', () => {
  const out = foldAggregate(m('hr'), [{ startDate: at('2026-10-16', 0), endDate: at('2026-10-17', 0), value: 71, values: { average: 71, min: 48, max: 152 } }]);
  assert.deepEqual(out['2026-10-16'], { hrAvg: 71, hrMin: 48, hrMax: 152 });
});

test('summed samples: two apps writing the same day do not double count', () => {
  const out = foldSamples(m('totalKcal'), [
    { value: 1200, startDate: at('2026-10-16', 1), endDate: at('2026-10-16', 13), sourceId: 'com.garmin.android.apps.connectmobile' },
    { value: 1000, startDate: at('2026-10-16', 13), endDate: at('2026-10-16', 23), sourceId: 'com.garmin.android.apps.connectmobile' },
    { value: 1900, startDate: at('2026-10-16', 0), endDate: at('2026-10-16', 23), sourceId: 'com.sec.android.app.shealth' },
  ]);
  assert.deepEqual(out, { '2026-10-16': { totalKcal: 2200 } });
});

test('latest reading of the day wins for weight; average for HRV', () => {
  assert.deepEqual(foldSamples(m('weightKg'), [
    { value: 82, startDate: at('2026-10-16', 7) }, { value: 81.5, startDate: at('2026-10-16', 20) }, { value: 81, startDate: at('2026-10-15', 7) },
  ]), { '2026-10-16': { weightKg: 81.5 }, '2026-10-15': { weightKg: 81 } });
  assert.deepEqual(foldSamples(m('hrvMs'), [{ value: 40, startDate: at('2026-10-16', 3) }, { value: 50, startDate: at('2026-10-16', 4) }]), { '2026-10-16': { hrvMs: 45 } });
});

test('sleep counts on the morning you woke, without awake time', () => {
  const night = { value: 480, startDate: at('2026-10-15', 22.5), endDate: at('2026-10-16', 6.5), sourceId: 'g',
    stages: [{ stage: 'light', durationMinutes: 200 }, { stage: 'deep', durationMinutes: 90 }, { stage: 'rem', durationMinutes: 120 }, { stage: 'awake', durationMinutes: 70 }] };
  assert.equal(asleepMinutes(night), 410);
  assert.deepEqual(foldSamples(m('sleepMin'), [night, { value: 30, startDate: at('2026-10-16', 14), endDate: at('2026-10-16', 14.5), sourceId: 'g' }]), { '2026-10-16': { sleepMin: 440 } });
});

test('mergeDays combines fields per day', () => {
  assert.deepEqual(mergeDays({ a: { x: 1 } }, { a: { y: 2 }, b: { x: 3 } }), { a: { x: 1, y: 2 }, b: { x: 3 } });
});

test('typed numbers win over the watch', () => {
  assert.equal(stepsOf({ date: 'd', watch: { steps: 9000 } }), 9000);
  assert.equal(stepsOf({ date: 'd', steps: 5000, watch: { steps: 9000 } }), 5000);
  assert.equal(stepsOf(undefined), 0);
  assert.equal(sleepHoursOf({ date: 'd', watch: { sleepMin: 437 } }), 7.25);
  assert.equal(sleepHoursOf({ date: 'd', sleepHours: 6, watch: { sleepMin: 437 } }), 6);
  assert.equal(sleepHoursOf({ date: 'd' }), null);
});

test('every metric can be shown', () => {
  for (const x of METRICS) if (x.show) assert.equal(typeof x.show(12.34), 'string');
});
