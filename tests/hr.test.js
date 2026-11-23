import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeHr, hrZone, zoneBounds, timeInZones } from '../app/js/core/hr.js';
import { createRide, bestPower, splits, perSecond } from '../app/js/core/bike.js';

test('heart rate measurement: uint8 and uint16, 0 = no contact', () => {
  assert.equal(decodeHr([0x00, 72]), 72);
  assert.equal(decodeHr([0x16, 140, 0x10, 0x02]), 140); // contact bits + RR interval after
  assert.equal(decodeHr([0x01, 0x2c, 0x01]), 300);
  assert.equal(decodeHr([0x01, 0x2c]), null);
  assert.equal(decodeHr([0x00, 0]), null);
  assert.equal(decodeHr([0x00]), null);
});

test('zones: % of max heart rate', () => {
  assert.equal(hrZone(90, 200), 0);
  assert.equal(hrZone(100, 200), 1);
  assert.equal(hrZone(139, 200), 2);
  assert.equal(hrZone(140, 200), 3);
  assert.equal(hrZone(165, 200), 4);
  assert.equal(hrZone(185, 200), 5);
  assert.equal(hrZone(150, 0), 0);
  assert.deepEqual(zoneBounds(200)[0], { zone: 1, from: 100, to: 119 });
  assert.deepEqual(zoneBounds(200)[4], { zone: 5, from: 180, to: null });
  assert.deepEqual(timeInZones([{ hr: 120 }, { hr: 121 }, { hr: null }, { hr: 181 }], 200), [0, 0, 2, 0, 0, 1]);
});

test('best power: highest rolling average; null when the ride is shorter', () => {
  const pts = Array.from({ length: 120 }, (_, t) => ({ t, watts: t >= 30 && t < 90 ? 200 : 100 }));
  assert.equal(bestPower(pts, 60), 200);
  assert.equal(bestPower(pts, 120), 150);
  assert.equal(bestPower(pts, 300), null);
  assert.equal(bestPower([], 60), null);
  // a gap counts as 0 W
  assert.equal(bestPower([{ t: 0, watts: 100 }, { t: 1, watts: 100 }, { t: 3, watts: 100 }], 4), 75);
});

test('splits per 5 minutes; stopped seconds left out of watts / rpm', () => {
  const pts = Array.from({ length: 420 }, (_, t) => ({ t, watts: t < 300 ? 100 : 200, cadence: t % 10 === 0 ? 0 : 80, resistance: 10, hr: t < 300 ? 120 : null }));
  pts[0].watts = 0;
  const s = splits(pts);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], { from: 0, to: 300, avgWatts: 100, avgCadence: 80, avgResistance: 10, avgHr: 120 });
  assert.deepEqual(s[1], { from: 300, to: 420, avgWatts: 200, avgCadence: 80, avgResistance: 10, avgHr: null });
});

test('ride with heart rate: HR carried into samples, not a sample of its own; zones need max HR', () => {
  const ride = createRide({ maxHr: 200 });
  ride.add({ resistance: 10 }, 0);
  ride.add({ hr: 130 }, 10);
  for (let i = 0; i <= 120; i++) {
    if (i === 60) ride.add({ hr: 150 }, i * 1000);
    ride.add({ cadence: 80, elapsedSec: i }, i * 1000 + 1);
  }
  assert.equal(ride.samples().length, 121);
  assert.equal(ride.latest().hr, 150);
  assert.equal(perSecond(ride.samples())[0].hr, 130);
  const s = ride.summary();
  assert.equal(s.maxHr, 150);
  assert.equal(s.avgHr, 140);
  assert.deepEqual(s.zones, [0, 0, 60, 61, 0, 0]);
  assert.equal(s.zoneMaxHr, 200);
  assert.equal(s.best[60], 58);
  assert.equal(s.best[300], null);
  assert.equal(s.workKj, s.kcal);
  assert.equal(s.splits.length, 1);
  assert.equal(createRide().summary().zones, null);
});

test('4×4 hard target 85–95 % of max HR', async () => {
  const { hardTarget, vsTarget } = await import('../app/js/core/hr.js');
  assert.deepEqual(hardTarget(180), { from: 153, to: 171 });
  assert.equal(vsTarget(150, 180), -1);
  assert.equal(vsTarget(160, 180), 0);
  assert.equal(vsTarget(175, 180), 1);
});

test('4×4 hard intervals: stats per interval, time in target; bands for the charts', async () => {
  const { hardIntervals } = await import('../app/js/core/bike.js');
  const { hardSpans, seriesSvg } = await import('../app/js/core/chart.js');
  const pts = Array.from({ length: 600 }, (_, t) => ({
    t, watts: t >= 100 && t < 340 ? 200 : 80, cadence: 85, resistance: 12,
    hr: t >= 100 && t < 340 ? (t < 160 ? 140 : 160) : 120, hard: t < 100 ? 0 : t < 340 ? 1 : 0,
  }));
  const iv = hardIntervals(pts, 180);
  assert.equal(iv.length, 1);
  assert.deepEqual(iv[0], { n: 1, from: 100, sec: 240, avgWatts: 200, avgCadence: 85, avgHr: 155, maxHr: 160, inTargetSec: 180 });
  assert.deepEqual(hardIntervals(pts.map((p) => ({ ...p, hard: null }))), []);
  assert.deepEqual(hardSpans(pts), [{ n: 1, from: 100, to: 339 }]);
  assert.match(seriesSvg(pts, { key: 'watts', color: '#000' }), />H1</);
});
