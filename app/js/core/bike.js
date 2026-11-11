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
 * Collects readings during a ride. Echelon sends resistance separately, so the latest value is carried
 * into the following data samples. Averages leave out stopped moments (cadence 0).
 */
export function createRide() {
  /** @type {(BikeReading & { at: number })[]} */
  const samples = [];
  /** @type {BikeReading} */
  let last = {};
  return {
    /** @param {BikeReading} r @param {number} at ms */
    add(r, at) {
      last = { ...last, ...r };
      // A resistance-only packet just updates the state; samples are taken on ride data, so nothing counts twice.
      if (Object.keys(r).some((k) => k !== 'resistance')) samples.push({ ...last, at });
      return last;
    },
    latest: () => last,
    summary: () => summarise(samples),
  };
}

/**
 * How much a bike counter (elapsed time, distance) went up during the ride. The console counts from its own
 * start, which can be before Forge connected, so only increases count; a drop means the console was reset
 * and counting starts again from 0. Null if the bike never sent it.
 * @param {(BikeReading & { at: number })[]} samples @param {'elapsedSec'|'distanceKm'} k
 */
export function gained(samples, k) {
  const vs = samples.map((x) => x[k]).filter((v) => typeof v === 'number');
  if (!vs.length) return null;
  let total = 0;
  for (let i = 1; i < vs.length; i++) total += vs[i] >= vs[i - 1] ? vs[i] - vs[i - 1] : vs[i];
  return total;
}

/**
 * @param {(BikeReading & { at: number })[]} samples
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
  return {
    timeSec,
    distanceMi: n(distanceKm == null ? null : distanceKm / KM_PER_MI, 2),
    avgSpeedMph: n(avgSpeedKmh == null ? null : avgSpeedKmh / KM_PER_MI, 1),
    avgCadence: n(avg(pick('cadence'))),
    maxCadence: pick('cadence').length ? Math.max(...pick('cadence')) : null,
    avgResistance: n(avg(pick('resistance')), 1),
    avgPowerW: n(avg(pick('powerW'))),
    avgHr: n(avg(pick('hr'))),
  };
}

/** @typedef {ReturnType<typeof summarise>} RideSummary */

/**
 * A ride summary as a logged cardio set (Forge stores miles / mph, see FIELDS in model.js).
 * @param {ReturnType<typeof summarise>} s @param {number} at
 * @returns {import('./model.js').LoggedSet}
 */
export function rideToSet(s, at) {
  /** @type {import('./model.js').LoggedSet} */
  const set = { at, timeSec: s.timeSec };
  if (s.distanceMi != null) set.distance = s.distanceMi;
  if (s.avgSpeedMph != null) set.speed = s.avgSpeedMph;
  if (s.avgHr != null) set.hr = s.avgHr;
  return set;
}
