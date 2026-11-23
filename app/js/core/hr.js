// Heart rate over Bluetooth LE (standard Heart Rate Service, e.g. a Garmin watch with "Broadcast Heart Rate" on,
// or a chest strap) and heart-rate zones. Pure, no Bluetooth: platform/hr.js hands raw bytes to `decodeHr()`.

export const HR = {
  service: '0000180d-0000-1000-8000-00805f9b34fb',
  measurement: '00002a37-0000-1000-8000-00805f9b34fb',
};

/**
 * Decode a Heart Rate Measurement (0x2A37): flags byte, then bpm as uint8 (flag bit 0 = 0) or uint16 LE.
 * Returns null for 0 (no contact) or a packet too short.
 * @param {ArrayLike<number>} b
 */
export function decodeHr(b) {
  if (b.length < 2) return null;
  const wide = (b[0] & 1) === 1;
  if (wide && b.length < 3) return null;
  const bpm = wide ? b[1] | (b[2] << 8) : b[1];
  return bpm > 0 ? bpm : null;
}

/** Lower edge of zones 1–5 as a share of max heart rate (Garmin's default "% of max HR" zones). */
export const ZONE_PCT = [0.5, 0.6, 0.7, 0.8, 0.9];
export const ZONE_NAMES = ['Rest', 'Warm up', 'Easy', 'Aerobic', 'Threshold', 'Maximum'];
/** Zone colours (index = zone; 0 = below zone 1). */
export const ZONE_COLORS = ['#5b6573', '#7d8a99', '#3a8ee6', '#2fa36b', '#e8a20f', '#e0453a'];

/** Zone 0–5 for a heart rate (0 = below zone 1). @param {number} bpm @param {number} maxHr */
export function hrZone(bpm, maxHr) {
  if (!(bpm > 0) || !(maxHr > 0)) return 0;
  let z = 0;
  ZONE_PCT.forEach((p, i) => { if (bpm >= p * maxHr) z = i + 1; });
  return z;
}

/** bpm range of each zone 1–5. @param {number} maxHr */
export const zoneBounds = (maxHr) => ZONE_PCT.map((p, i) => ({
  zone: i + 1, from: Math.round(p * maxHr), to: i < 4 ? Math.round(ZONE_PCT[i + 1] * maxHr) - 1 : null,
}));

/**
 * Seconds in each zone (index 0–5) from a per-second series; points without heart rate are not counted.
 * @param {{ hr?: number|null }[]} pts @param {number} maxHr
 */
export function timeInZones(pts, maxHr) {
  const out = [0, 0, 0, 0, 0, 0];
  for (const p of pts) if (p.hr) out[hrZone(p.hr, maxHr)]++;
  return out;
}
