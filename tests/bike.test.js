import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checksum, echelonCommand, gained, ECHELON_INIT, decodeEchelon, decodeFtmsBike, createRide, rideValues,
  estWatts, kcalFrom, perSecond, isBikeExercise, watchMatch,
} from '../app/js/core/bike.js';

const withSum = (/** @type {number[]} */ b) => Uint8Array.from([...b, checksum(b)]);

test('Echelon commands carry the checksum (matches known packets)', () => {
  assert.deepEqual([...echelonCommand(0xa1)], [0xf0, 0xa1, 0x00, 0x91]);
  assert.deepEqual([...ECHELON_INIT[2]], [0xf0, 0xb0, 0x01, 0x01, 0xa2]);
});

test('Echelon workout data: elapsed, distance, cadence', () => {
  // 754 s, 5.43 km (543 × 0.01), 82 rpm
  const p = withSum([0xf0, 0xd1, 0x09, 0x02, 0xf2, 0, 0, 0x02, 0x1f, 0x00, 82, 0]);
  assert.deepEqual(decodeEchelon(p), { elapsedSec: 754, distanceKm: 5.43, cadence: 82 });
});

test('Echelon resistance packet', () => {
  assert.deepEqual(decodeEchelon(withSum([0xf0, 0xd2, 0x01, 14])), { resistance: 14 });
});

test('Echelon: bad checksum, short or unknown packets are ignored', () => {
  const p = withSum([0xf0, 0xd2, 0x01, 14]);
  p[4] ^= 1;
  assert.equal(decodeEchelon(p), null);
  assert.equal(decodeEchelon(Uint8Array.from([0xf0, 0xd1])), null);
  assert.equal(decodeEchelon(withSum([0xf0, 0xa1, 0x00])), null);
});

test('FTMS indoor bike data: speed, cadence, distance, resistance, power, HR, elapsed', () => {
  // flags: bit2 cadence, bit4 distance, bit5 resistance, bit6 power, bit9 hr, bit11 elapsed; bit0 = 0 → speed
  const flags = (1 << 2) | (1 << 4) | (1 << 5) | (1 << 6) | (1 << 9) | (1 << 11);
  const b = Uint8Array.from([
    flags & 0xff, flags >> 8,
    0x60, 0x09, // 24.00 km/h
    0xa4, 0x00, // 164 × 0.5 = 82 rpm
    0x39, 0x15, 0x00, // 5433 m
    0x0e, 0x00, // resistance 14
    0x96, 0x00, // 150 W
    0x8c, // 140 bpm
    0xf2, 0x02, // 754 s
  ]);
  assert.deepEqual(decodeFtmsBike(b), {
    speedKmh: 24, cadence: 82, distanceKm: 5.433, resistance: 14, powerW: 150, hr: 140, elapsedSec: 754,
  });
});

test('FTMS: packet shorter than its flags → null', () => {
  assert.equal(decodeFtmsBike(Uint8Array.from([0x44, 0x00, 0x60])), null);
});

test('ride summary: carries resistance forward, skips stopped samples, becomes a cardio set', () => {
  const ride = createRide();
  ride.add({ resistance: 10 }, 0);
  ride.add({ elapsedSec: 0, distanceKm: 0, cadence: 0 }, 0);
  ride.add({ elapsedSec: 60, distanceKm: 0.5, cadence: 80 }, 60_000);
  ride.add({ resistance: 20 }, 61_000);
  ride.add({ elapsedSec: 120, distanceKm: 1.0, cadence: 90 }, 120_000);
  ride.add({ elapsedSec: 1200, distanceKm: 8.04672, cadence: 0 }, 1_200_000); // stopped
  const s = ride.summary();
  assert.equal(s.timeSec, 1200);
  assert.equal(s.distanceMi, 5);
  assert.equal(s.avgSpeedMph, 15);
  assert.equal(s.avgCadence, 85);
  assert.equal(s.maxCadence, 90);
  assert.equal(s.avgResistance, 15);
  assert.equal(s.avgHr, null);
  assert.deepEqual(rideValues(s), { time: 1200, distance: 5, speed: 15 });
  assert.equal(s.avgWatts, Math.round((estWatts(80, 10) + estWatts(90, 20)) / 2));
  assert.equal(s.startedAt, 0);
  assert.equal(s.endedAt, 1_200_000);
});

test('counters: only what was gained after connecting; a console reset starts again from 0', () => {
  const s = (/** @type {number[]} */ v) => v.map((elapsedSec, i) => ({ elapsedSec, at: i }));
  assert.equal(gained(s([300, 360, 420]), 'elapsedSec'), 120);
  assert.equal(gained(s([300, 360, 10, 70]), 'elapsedSec'), 60 + 10 + 60);
  assert.equal(gained([], 'distanceKm'), null);
});

test('no elapsed counter → wall-clock time', () => {
  const ride = createRide();
  ride.add({ cadence: 70 }, 1000);
  ride.add({ cadence: 72 }, 601_000);
  assert.equal(ride.summary().timeSec, 600);
  assert.equal(ride.summary().distanceMi, null);
});

test('estimated watts (echbt / gymnasticon fit); 0 when stopped or resistance unknown', () => {
  assert.equal(estWatts(80, 10), Math.round(1.090112 ** 10 * 1.015343 ** 80 * 7.228958));
  assert.equal(estWatts(80, 10), 58); // 57.9 rounded (the brief says round; echbt truncates)
  assert.equal(estWatts(0, 10), 0);
  assert.equal(estWatts(80, 0), 0);
  assert.equal(estWatts(80, undefined), 0);
});

test('live samples carry estimated watts; measured power wins', () => {
  const ride = createRide();
  ride.add({ resistance: 10 }, 0);
  assert.equal(ride.add({ cadence: 80 }, 1000).powerW, 58);
  const ftms = createRide();
  assert.equal(ftms.add({ cadence: 80, resistance: 10, powerW: 150 }, 0).powerW, 150);
  assert.equal(ftms.add({ cadence: 80 }, 1000).powerW, 150);
});

test('calories ≈ kJ of work; gaps over 5 s (dropout) add nothing', () => {
  const s = (/** @type {[number, number][]} */ v) => v.map(([at, powerW]) => ({ at, powerW }));
  assert.equal(kcalFrom(s([[0, 100], [1000, 100], [2000, 100]])), 0.2); // 100 W × 2 s = 200 J
  assert.equal(kcalFrom(s([[0, 100], [60_000, 100]])), 0);
  const ride = createRide();
  ride.add({ resistance: 10 }, 0);
  for (let i = 0; i <= 600; i++) ride.add({ cadence: 80, elapsedSec: i }, i * 1000);
  assert.equal(ride.summary().kcal, Math.round(58 * 600 / 1000));
});

test('per-second series: last reading per second, gaps left out', () => {
  const pts = perSecond([{ at: 0, cadence: 70, powerW: 50 }, { at: 400, cadence: 72, powerW: 52 }, { at: 1000, cadence: 74, powerW: 54, resistance: 9 }, { at: 9000, cadence: 80, powerW: 60 }]);
  assert.deepEqual(pts.map((p) => p.t), [0, 1, 9]);
  assert.equal(pts[0].cadence, 72);
  assert.equal(pts[1].resistance, 9);
});

test('bike exercises: Stationary Bike by default, the library tag decides', () => {
  assert.equal(isBikeExercise({ id: 'card_2' }), true);
  assert.equal(isBikeExercise({ id: 'card_2', bike: false }), false);
  assert.equal(isBikeExercise({ id: 'card_v3' }), false);
  assert.equal(isBikeExercise({ id: 'card_v3', bike: true }), true);
  assert.equal(isBikeExercise(undefined), false);
});

test('watch workout overlapping at least half the ride is used for the calorie comparison', () => {
  const ride = { startedAt: 1000, endedAt: 2000 };
  const w = (/** @type {string} */ id, start, end) => ({ id, type: 'biking', start, end, durationSec: 0, kcal: 300 });
  assert.equal(watchMatch(ride, { a: w('a', 1900, 5000) }), null);
  assert.equal(watchMatch(ride, { a: w('a', 1900, 5000), b: w('b', 900, 1800) })?.id, 'b');
  assert.equal(watchMatch({ startedAt: null, endedAt: null }, { b: w('b', 900, 1800) }), null);
});
