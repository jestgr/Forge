import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checksum, echelonCommand, gained, ECHELON_INIT, decodeEchelon, decodeFtmsBike, createRide, rideToSet,
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
  assert.deepEqual(rideToSet(s, 5), { at: 5, timeSec: 1200, distance: 5, speed: 15 });
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
