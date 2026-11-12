// Indoor bike over Bluetooth LE: decode what the bike sends and summarise a ride. Pure, no DOM, no Bluetooth —
// the connection layer (platform/) hands raw notification bytes to `decode()`.
//
// Two protocols:
//  - Echelon's own (Connect bikes). Not published; layout from community reverse engineering
//    (qdomyos-zwift, echelon BLE projects). Packet: F0 <cmd> <len> <payload…> <checksum = sum of all bytes & 0xFF>.
//    0xD1 = workout data, 0xD2 = resistance. Must be checked on Jeff's bike (see TASK.md).
//  - Bluetooth SIG Fitness Machine Service (FTMS), characteristic Indoor Bike Data 0x2AD2 (newer bikes / firmware).

export const ECHELON = {
  service: '0bf669f1-45f2-11e7-9598-0800200c9a66',
  write: '0bf669f2-45f2-11e7-9598-0800200c9a66',
  notify: '0bf669f4-45f2-11e7-9598-0800200c9a66',
};
export const FTMS = {
  service: '00001826-0000-1000-8000-00805f9b34fb',
  indoorBikeData: '00002ad2-0000-1000-8000-00805f9b34fb',
};

/**
 * One reading. Only the fields the bike sent are set.
 * @typedef {{ elapsedSec?: number, distanceKm?: number, speedKmh?: number, cadence?: number,
 *   resistance?: number, powerW?: number, hr?: number, kcal?: number }} BikeReading
 */

/** Echelon checksum: sum of the bytes, low 8 bits. @param {ArrayLike<number>} bytes */
export const checksum = (bytes) => Array.from(bytes).reduce((a, b) => a + b, 0) & 0xff;

/** Build an Echelon command packet. @param {number} cmd @param {number[]} [payload] */
export function echelonCommand(cmd, payload = []) {
  const head = [0xf0, cmd, payload.length, ...payload];
  return Uint8Array.from([...head, checksum(head)]);
}

/** Sent once after subscribing: device info, ?, start data stream (community-documented order). */
export const ECHELON_INIT = [echelonCommand(0xa1), echelonCommand(0xa3), echelonCommand(0xb0, [0x01])];

/**
 * Decode one Echelon notification. Returns null for packets we don't use or that fail the checksum.
 * @param {Uint8Array} b
 * @returns {BikeReading|null}
 */
export function decodeEchelon(b) {
  if (b.length < 4 || b[0] !== 0xf0) return null;
  const len = b[2];
  if (b.length < len + 4 || checksum(b.subarray(0, len + 3)) !== b[len + 3]) return null;
  if (b[1] === 0xd2 && len >= 1) return { resistance: b[3] };
  if (b[1] === 0xd1 && len >= 8) {
    const u16 = (/** @type {number} */ i) => (b[i] << 8) | b[i + 1];
    return {
      elapsedSec: u16(3),
      distanceKm: ((b[5] * 2 ** 24) + (b[6] << 16) + (b[7] << 8) + b[8]) / 100,
      cadence: u16(9),
    };
  }
  return null;
}

/**
 * Decode FTMS Indoor Bike Data (0x2AD2). Fields are little-endian and present according to the flags.
 * @param {Uint8Array} b
 * @returns {BikeReading|null}
 */
export function decodeFtmsBike(b) {
  if (b.length < 2) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const flags = dv.getUint16(0, true);
  const has = (/** @type {number} */ bit) => (flags & (1 << bit)) !== 0;
  let i = 2;
  /** @type {BikeReading} */
  const r = {};
  try {
    if (!has(0)) { r.speedKmh = dv.getUint16(i, true) / 100; i += 2; } // bit 0 "more data" = 0 → speed present
    if (has(1)) i += 2; // average speed
    if (has(2)) { r.cadence = dv.getUint16(i, true) / 2; i += 2; }
    if (has(3)) i += 2; // average cadence
    if (has(4)) { r.distanceKm = (dv.getUint16(i, true) + (dv.getUint8(i + 2) << 16)) / 1000; i += 3; }
    if (has(5)) { r.resistance = dv.getInt16(i, true); i += 2; }
    if (has(6)) { r.powerW = dv.getInt16(i, true); i += 2; }
    if (has(7)) i += 2; // average power
    if (has(8)) { r.kcal = dv.getUint16(i, true); i += 5; } // total, per hour, per minute
    if (has(9)) { r.hr = dv.getUint8(i); i += 1; }
    if (has(10)) i += 1; // METs
    if (has(11)) { r.elapsedSec = dv.getUint16(i, true); i += 2; }
  } catch {
    return null; // shorter than its flags say
  }
  return r;
}

const KM_PER_MI = 1.609344;
const round = (/** @type {number} */ x, /** @type {number} */ d = 0) => Math.round(x * 10 ** d) / 10 ** d;
const avg = (/** @type {number[]} */ xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Estimated watts for an Echelon bike, which doesn't send power (fit used by snowzach/echbt and gymnasticon).
 * 0 when not pedalling or resistance unknown / 0.
 * @param {number|undefined} cadence rpm @param {number|undefined} resistance 1–32
 */
export function estWatts(cadence, resistance) {
  if (!cadence || !resistance) return 0;
  return Math.round(1.090112 ** resistance * 1.015343 ** cadence * 7.228958);
}

/** Gaps longer than this (e.g. while disconnected) don't add energy. */
const MAX_GAP_SEC = 5;

/** @typedef {BikeReading & { at: number }} Sample */

/**
 * Collects readings during a ride. Echelon sends resistance separately, so the latest value is carried
 * into the following data samples. Power: the bike's own if it sends one, else estimated (estWatts).
 * Averages leave out stopped moments (cadence 0).
 */
export function createRide() {
  /** @type {Sample[]} */
  const samples = [];
  /** @type {BikeReading} */
  let last = {};
  let measuredPower = false;
  return {
    /** @param {BikeReading} r @param {number} at ms */
    add(r, at) {
      if (r.powerW != null) measuredPower = true;
      last = { ...last, ...r };
      if (!measuredPower) last.powerW = estWatts(last.cadence, last.resistance);
      // A resistance-only packet just updates the state; samples are taken on ride data, so nothing counts twice.
      if (Object.keys(r).some((k) => k !== 'resistance')) samples.push({ ...last, at });
      return last;
    },
    latest: () => last,
    summary: () => summarise(samples),
    series: () => perSecond(samples),
    samples: () => samples,
  };
}

/**
 * How much a bike counter (elapsed time, distance) went up during the ride. The console counts from its own
 * start, which can be before Forge connected, so only increases count; a drop means the console was reset
 * and counting starts again from 0. Null if the bike never sent it.
 * @param {Sample[]} samples @param {'elapsedSec'|'distanceKm'} k
 */
export function gained(samples, k) {
  const vs = samples.map((x) => x[k]).filter((v) => typeof v === 'number');
  if (!vs.length) return null;
  let total = 0;
  for (let i = 1; i < vs.length; i++) total += vs[i] >= vs[i - 1] ? vs[i] - vs[i - 1] : vs[i];
  return total;
}

/**
 * Energy from power over time. kcal ≈ kJ of work: the body is ~24 % efficient on a bike and 1 kcal = 4.184 kJ,
 * so the two cancel out almost exactly (common rule of thumb for cycling).
 * @param {Sample[]} samples
 */
export function kcalFrom(samples) {
  let joules = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].at - samples[i - 1].at) / 1000;
    if (dt > 0 && dt <= MAX_GAP_SEC) joules += (samples[i - 1].powerW || 0) * dt;
  }
  return joules / 1000;
}

/**
 * One point per second since the first sample (last reading in that second). Seconds without data
 * (e.g. while disconnected) are left out, so the chart shows a gap.
 * @param {Sample[]} samples
 * @returns {{ t: number, cadence: number, watts: number, resistance: number|null }[]}
 */
export function perSecond(samples) {
  if (!samples.length) return [];
  const t0 = samples[0].at;
  /** @type {Map<number, Sample>} */
  const by = new Map();
  for (const x of samples) by.set(Math.round((x.at - t0) / 1000), x);
  return [...by.entries()].sort((a, b) => a[0] - b[0])
    .map(([t, x]) => ({ t, cadence: x.cadence ?? 0, watts: x.powerW ?? 0, resistance: x.resistance ?? null }));
}

/**
 * @param {Sample[]} samples
 */
export function summarise(samples) {
  const moving = samples.filter((s) => (s.cadence ?? 0) > 0);
  const pick = (/** @type {keyof BikeReading} */ k) => moving.map((s) => s[k]).filter((v) => typeof v === 'number');
  const elapsed = gained(samples, 'elapsedSec');
  const timeSec = elapsed ?? (samples.length ? Math.round((samples[samples.length - 1].at - samples[0].at) / 1000) : 0);
  const distanceKm = gained(samples, 'distanceKm');
  // Average speed from total distance / time when the bike reports both, else from speed readings.
  const avgSpeedKmh = distanceKm != null && timeSec > 0 ? distanceKm / (timeSec / 3600) : avg(pick('speedKmh'));
  const n = (/** @type {number|null} */ v, d = 0) => (v == null ? null : round(v, d));
  const max = (/** @type {number[]} */ xs) => (xs.length ? Math.max(...xs) : null);
  return {
    startedAt: samples[0]?.at ?? null,
    endedAt: samples[samples.length - 1]?.at ?? null,
    timeSec,
    distanceMi: n(distanceKm == null ? null : distanceKm / KM_PER_MI, 2),
    avgSpeedMph: n(avgSpeedKmh == null ? null : avgSpeedKmh / KM_PER_MI, 1),
    avgCadence: n(avg(pick('cadence'))),
    maxCadence: max(pick('cadence')),
    avgResistance: n(avg(pick('resistance')), 1),
    avgWatts: n(avg(pick('powerW'))),
    maxWatts: max(pick('powerW')),
    kcal: samples.length > 1 ? Math.round(kcalFrom(samples)) : null,
    avgHr: n(avg(pick('hr'))),
  };
}

/**
 * A saved ride: the summary plus a small picture of its chart (`chart`, an SVG data URL) and whether a set
 * was logged from it.
 * @typedef {ReturnType<typeof summarise> & { chart?: string|null, logged?: boolean }} RideSummary
 */

/**
 * Values for the Log set sheet, by tracking field (Forge stores miles / mph, see FIELDS in model.js).
 * @param {ReturnType<typeof summarise>} s
 * @returns {Partial<Record<import('./model.js').Field, number>>}
 */
export function rideValues(s) {
  /** @type {Partial<Record<import('./model.js').Field, number>>} */
  const v = { time: s.timeSec };
  if (s.distanceMi != null) v.distance = s.distanceMi;
  if (s.avgSpeedMph != null) v.speed = s.avgSpeedMph;
  if (s.avgHr != null) v.hr = s.avgHr;
  return v;
}

/** Bike exercises get the Connect button: tagged "Echelon bike" in the library, or the built-in Stationary Bike
 * unless that tag was switched off. @param {{ id: string, bike?: boolean }|undefined} ex */
export const isBikeExercise = (ex) => !!ex && (ex.bike ?? ex.id === 'card_2');

/**
 * A watch workout that overlaps the ride (to compare calories), if any.
 * @param {{ startedAt: number|null, endedAt: number|null }} ride
 * @param {Record<string, import('./watch.js').WatchWorkout>|undefined} workouts
 */
export function watchMatch(ride, workouts) {
  if (ride.startedAt == null || ride.endedAt == null) return null;
  const len = ride.endedAt - ride.startedAt;
  let best = null;
  let bestOverlap = 0;
  for (const w of Object.values(workouts || {})) {
    const overlap = Math.min(w.end, ride.endedAt) - Math.max(w.start, ride.startedAt);
    // "Similar" = overlaps at least half of the ride.
    if (overlap > bestOverlap && overlap >= len / 2) { best = w; bestOverlap = overlap; }
  }
  return best;
}
