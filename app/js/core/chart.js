// Ride chart as SVG text (no chart library). Pure: the ride screen puts it in the page and adds the hover
// layer; the small picture saved with a ride is the same kind of SVG as a data URL.
// Colours checked with the dataviz palette validator against the dark card surface (#161b22).

export const WATTS_COLOR = '#e8650f';
export const CADENCE_COLOR = '#3a8ee6';
const GRID = '#2f3a48';
const INK = '#9aa7b6';

/** @typedef {{ t: number, cadence: number, watts: number, resistance: number|null }} Point */

/** A round axis maximum ≥ v (10, 20, 25, 50, 100, 150, 200, 250, 300, 400, 500 …). @param {number} v */
export function niceMax(v) {
  if (!(v > 0)) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** "m:ss" for axis labels. @param {number} sec */
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/** Time-axis ticks for a ride of `tMax` seconds: at most 5, labelled "m:ss" under 2 minutes, else "N min". */
export function timeTicks(tMax) {
  const step = [10, 15, 30, 60, 120, 300, 600, 900, 1200, 1800].find((s) => tMax / s <= 4) || 3600;
  const out = [];
  for (let t = 0; t <= tMax; t += step) out.push({ t, label: t === 0 ? '0' : step < 60 ? mmss(t) : `${Math.round(t / 60)} min` });
  return out;
}
/** Chart time span: the ride itself (at least 10 s). @param {Point[]} pts */
const span = (pts) => Math.max(10, pts.length ? pts[pts.length - 1].t : 0);

/**
 * Path for one series; a gap of more than `gap` seconds (no data, e.g. disconnected) breaks the line.
 * @param {Point[]} pts @param {(p: Point) => number} y @param {(t: number) => number} x @param {(v: number) => number} sy
 */
function path(pts, y, x, sy, gap = 3) {
  let d = '';
  let prev = -Infinity;
  for (const p of pts) {
    d += `${p.t - prev > gap ? 'M' : 'L'}${x(p.t).toFixed(1)},${sy(y(p)).toFixed(1)}`;
    prev = p.t;
  }
  return d;
}

/** Plot area for a chart of this size (shared with the hover layer). @param {number} width @param {number} height */
export const plotBox = (width, height) => ({ left: 36, right: width - 8, top: 8, bottom: height - 20 });

/**
 * One series over time: thin line, recessive grid, axis labels in minutes. Single series → no legend; the
 * caller titles it ("Watts", "Cadence").
 * @param {Point[]} pts
 * @param {{ key: 'watts'|'cadence', color: string, width?: number, height?: number }} o
 */
export function seriesSvg(pts, { key, color, width = 340, height = 120 }) {
  const b = plotBox(width, height);
  const tMax = span(pts);
  const yMax = niceMax(Math.max(0, ...pts.map((p) => p[key])));
  const x = (/** @type {number} */ t) => b.left + (t / tMax) * (b.right - b.left);
  const sy = (/** @type {number} */ v) => b.bottom - (v / yMax) * (b.bottom - b.top);
  const ticks = [0, yMax / 2, yMax];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${key} over time">`
    + ticks.map((v) => `<line x1="${b.left}" x2="${b.right}" y1="${sy(v)}" y2="${sy(v)}" stroke="${GRID}" stroke-width="1"/>`
      + `<text x="${b.left - 6}" y="${sy(v) + 4}" fill="${INK}" font-size="11" text-anchor="end">${Math.round(v)}</text>`).join('')
    + timeTicks(tMax).map(({ t, label }) => `<text x="${x(t)}" y="${height - 4}" fill="${INK}" font-size="11" text-anchor="${t === 0 ? 'start' : 'middle'}">${label}</text>`).join('')
    + `<path d="${path(pts, (p) => p[key], x, sy)}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
    + '</svg>';
}

/** Average into at most `n` buckets (keeps the saved picture small). @param {Point[]} pts @param {number} n */
export function downsample(pts, n) {
  if (pts.length <= n) return pts;
  const size = pts.length / n;
  /** @type {Point[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    const part = pts.slice(Math.floor(i * size), Math.floor((i + 1) * size));
    const mean = (/** @type {'watts'|'cadence'} */ k) => part.reduce((a, p) => a + p[k], 0) / part.length;
    out.push({ t: part[part.length - 1].t, watts: mean('watts'), cadence: mean('cadence'), resistance: part[part.length - 1].resistance });
  }
  return out;
}

/**
 * Small picture of the ride (watts over time) saved with the summary, as an SVG data URL (a few KB).
 * Shown with <img>, so it can't run anything.
 * @param {Point[]} pts
 */
export function thumbnail(pts) {
  const w = 240;
  const hgt = 56;
  const small = downsample(pts, 120);
  const tMax = span(small);
  const yMax = niceMax(Math.max(0, ...small.map((p) => p.watts)));
  // Downsampled points are far apart: only real gaps (> 3 % of the ride, at least 2 buckets) break the line.
  const gap = Math.max(3, tMax * 0.03, 2 * (tMax / small.length));
  const d = path(small, (p) => p.watts, (t) => 2 + (t / tMax) * (w - 4), (v) => hgt - 3 - (v / yMax) * (hgt - 6), gap);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hgt}"><rect width="${w}" height="${hgt}" rx="8" fill="#161b22"/>`
    + `<path d="${d}" fill="none" stroke="${WATTS_COLOR}" stroke-width="2" stroke-linejoin="round"/></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/** Tooltip text for the point nearest to second `t`. @param {Point[]} pts @param {number} t */
export function pointAt(pts, t) {
  if (!pts.length) return null;
  let best = pts[0];
  for (const p of pts) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
  return { ...best, label: mmss(best.t) };
}
