// Echelon bike screens: the small live panel inside a cardio card (cardio add-on), the full-screen ride view
// (Pure Cardio), and the end-of-ride chart. Live numbers update in place (elements with class bk-<key>) instead
// of re-rendering the page every second. Saving is done by session.js through the callbacks given here.
import { h, icon, openSheet, confirmSheet, refreshSheets } from './dom.js';
import * as store from '../store.js';
import { bikeAvailable, bikeRide, onBikeChange, reconnect, simDrop, cancelRide } from '../platform/bike.js';
import { seriesSvg, plotBox, pointAt, WATTS_COLOR, CADENCE_COLOR } from '../core/chart.js';
import { fmtClock } from '../core/util.js';

/** @typedef {import('../core/bike.js').RideSummary} RideSummary */
/** @typedef {import('../core/chart.js').Point} Point */

export const STATUS = {
  scanning: 'Looking for the bike… pedal to wake it', connecting: 'Connecting…', connected: 'Connected',
  reconnecting: 'Connection lost — reconnecting…', failed: 'Not connected',
};

/** Live values by key, as text. */
function liveText() {
  const r = bikeRide();
  if (!r) return {};
  const live = r.ride.latest();
  const sum = r.ride.summary();
  const num = (/** @type {number|undefined|null} */ v) => (v == null ? '–' : String(Math.round(v)));
  return {
    cadence: num(live.cadence), watts: num(live.powerW), resistance: num(live.resistance),
    time: fmtClock(sum.timeSec), distance: sum.distanceMi != null ? sum.distanceMi.toFixed(2) : '–',
    speed: sum.avgSpeedMph != null ? sum.avgSpeedMph.toFixed(1) : '–', kcal: num(sum.kcal),
    status: STATUS[r.status],
  };
}

let lastStatus = '';
onBikeChange(() => {
  const r = bikeRide();
  const st = r ? `${r.status}|${r.error || ''}` : '';
  if (st !== lastStatus) { lastStatus = st; refreshSheets(); store.emit(); return; } // layout changes
  for (const [k, v] of Object.entries(liveText())) {
    for (const el of document.querySelectorAll(`.bk-${k}`)) el.textContent = v;
  }
});

const big = (/** @type {string} */ key, /** @type {string} */ name) =>
  h('div', { class: 'bike-big' }, h('div', { class: `bike-num bk-${key}` }, liveText()[key] ?? '–'), h('div', { class: 'tiny faint' }, name));
const small = (/** @type {string} */ key, /** @type {string} */ name) =>
  h('div', { class: 'bike-small' }, h('span', { class: `mono bk-${key}` }, liveText()[key] ?? '–'), h('span', { class: 'tiny faint' }, ` ${name}`));

/** Status line + what to do about it (reconnect, Echelon-app hint, simulator dropout). */
function statusBlock() {
  const r = bikeRide();
  if (!r) return null;
  const good = r.status === 'connected';
  return h('div', { class: 'stack', style: { gap: '6px' } },
    h('div', { class: 'spread' },
      h('span', { class: 'badge bk-status' + (good ? ' good' : r.status === 'reconnecting' ? ' accent' : '') }, STATUS[r.status]),
      h('span', { class: 'faint small' }, [r.name, r.sim ? '(simulator)' : ''].filter(Boolean).join(' '))),
    r.status === 'reconnecting' ? h('p', { class: 'small muted' }, 'Your ride is kept. Forge keeps trying for 2 minutes.') : null,
    r.status === 'failed' && r.error ? h('p', { class: 'small muted' }, r.error) : null,
    r.status === 'failed' ? h('button', { class: 'btn btn-block', onclick: () => reconnect() }, icon('sync'), 'Reconnect') : null);
}

/** Simulator only: a small button to test reconnecting. */
const simButton = () => (bikeRide()?.sim && bikeRide()?.status === 'connected' ? h('button', { class: 'btn btn-sm', onclick: simDrop }, 'Simulate dropout') : null);

/**
 * The bike part of a cardio card.
 * @param {{ id: string, ride?: RideSummary|null }} it
 * @param {{ full: boolean, start: () => void, stop: () => void, log: () => void }} o
 */
export function bikePanel(it, o) {
  const r = bikeRide();
  const pad = { padding: '0 16px 14px' };
  if (r?.itemId === it.id) {
    if (o.full) return h('div', { style: pad }, h('button', { class: 'btn btn-primary btn-block', onclick: () => openRideView(o.stop) }, icon('bolt'), 'Ride running — open'));
    return h('div', { class: 'bike-panel', style: { margin: '0 16px 14px' } },
      statusBlock(),
      h('div', { class: 'grid-3' }, big('cadence', 'rpm'), big('watts', 'watts (est.)'), big('resistance', 'resistance')),
      h('div', { class: 'row-wrap', style: { justifyContent: 'space-between' } }, small('time', ''), small('distance', 'mi'), small('speed', 'mph'), small('kcal', 'kcal')),
      h('button', { class: 'btn btn-primary btn-block', onclick: o.stop }, icon('check'), 'Stop ride'),
      simButton());
  }
  if (r) return null; // riding on another exercise
  return h('div', { class: 'stack', style: { ...pad, gap: '8px' } },
    it.ride ? savedRide(it.ride) : null,
    it.ride && !it.ride.logged ? h('button', { class: 'btn btn-primary btn-block', onclick: o.log }, icon('plus'), 'Log this ride') : null,
    bikeAvailable()
      ? h('button', { class: 'btn btn-block', onclick: o.start }, icon('bolt'), it.ride ? 'Ride again' : 'Connect Echelon bike')
      : h('p', { class: 'faint small' }, 'Echelon bike: open Forge’s Android app to connect (or turn on Bike simulator in Settings).'));
}

/** Saved ride: small chart picture + one line. @param {RideSummary} x */
export function savedRide(x) {
  return h('div', { class: 'stack', style: { gap: '4px' } },
    x.chart ? h('img', { src: x.chart, alt: 'Watts during the ride', class: 'ride-thumb' }) : null,
    h('p', { class: 'faint small' }, rideText(x)));
}

/** One line for a saved ride. @param {RideSummary} x */
export function rideText(x) {
  return [fmtClock(x.timeSec), x.distanceMi != null && `${x.distanceMi} mi`, x.avgCadence != null && `${x.avgCadence} rpm avg`,
    x.avgWatts != null && `${x.avgWatts} W avg`, x.maxWatts != null && `max ${x.maxWatts} W`,
    x.avgResistance != null && `resistance ${x.avgResistance}`, x.kcal != null && `~${x.kcal} kcal`].filter(Boolean).join(' · ');
}

/** Full-screen ride view (Pure Cardio). Minimise keeps riding. @param {() => void} stop */
export function openRideView(stop) {
  openSheet((close) => {
    const r = bikeRide();
    if (!r) { setTimeout(close); return h('div'); }
    return h('div', { class: 'ride-full' },
      h('div', { class: 'spread' }, h('h2', null, 'Echelon ride'),
        h('button', { class: 'icon-btn sm', 'aria-label': 'Minimise', onclick: close }, icon('back'))),
      statusBlock(),
      h('div', { class: 'ride-live' },
        h('div', { class: 'ride-time mono bk-time' }, liveText().time),
        h('div', { class: 'ride-bigs' }, big('cadence', 'rpm'), big('watts', 'watts (est.)'), big('resistance', 'resistance')),
        h('div', { class: 'grid-3' }, small('distance', 'mi'), small('speed', 'mph'), small('kcal', 'kcal'))),
      simButton(),
      h('div', { class: 'ride-actions' },
        h('button', { class: 'btn btn-primary btn-big', onclick: () => { close(); stop(); } }, icon('check'), 'Stop ride'),
        h('button', { class: 'btn btn-danger btn-block', onclick: async () => {
          if (await confirmSheet('Cancel the ride?', 'Nothing from the bike is saved.', { ok: 'Cancel ride', cancel: 'Keep riding', danger: true })) { close(); await cancelRide(); }
        } }, 'Cancel ride')));
  }, { full: true, label: 'Echelon ride' });
}

/**
 * One chart with a crosshair + tooltip that follows the finger (all values at that second).
 * @param {Point[]} pts @param {'watts'|'cadence'} key @param {string} title @param {string} color
 */
function chartBlock(pts, key, title, color) {
  const W = 340; const H = 120;
  const plot = h('div', { class: 'ride-chart', html: seriesSvg(pts, { key, color, width: W, height: H }) });
  const cross = h('div', { class: 'ride-cross', hidden: true });
  const tip = h('div', { class: 'ride-tip', hidden: true });
  const b = plotBox(W, H);
  const tMax = Math.max(60, pts.length ? pts[pts.length - 1].t : 0);
  const move = (/** @type {PointerEvent} */ e) => {
    const rect = /** @type {HTMLElement} */ (e.currentTarget).getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * W;
    const p = pointAt(pts, ((fx - b.left) / (b.right - b.left)) * tMax);
    if (!p) return;
    const px = ((b.left + (p.t / tMax) * (b.right - b.left)) / W) * 100;
    cross.hidden = false; tip.hidden = false;
    cross.style.left = `${px}%`;
    tip.style.left = `${Math.min(Math.max(px, 18), 82)}%`;
    tip.textContent = `${p.label} · ${Math.round(p.watts)} W · ${Math.round(p.cadence)} rpm${p.resistance != null ? ` · res ${p.resistance}` : ''}`;
  };
  const hide = () => { cross.hidden = true; tip.hidden = true; };
  return h('div', { class: 'stack', style: { gap: '4px' } },
    h('span', { class: 'tiny faint' }, title),
    h('div', { class: 'ride-chart-wrap', onpointermove: move, onpointerdown: move, onpointerleave: hide }, plot, cross, tip));
}

/**
 * End of ride: the charts from every second, the summary, and "Log this ride".
 * @param {RideSummary} sum @param {Point[]} pts @param {() => void} log
 */
export function openRideDone(sum, pts, log) {
  openSheet((close) => h('div', { class: 'stack' },
    h('div', { class: 'spread' }, h('h2', null, 'Ride done'), h('button', { class: 'icon-btn sm', 'aria-label': 'Close', onclick: close }, icon('x'))),
    h('p', { class: 'muted small' }, rideText(sum)),
    pts.length > 1 ? chartBlock(pts, 'watts', 'Watts (estimated)', WATTS_COLOR) : h('p', { class: 'faint small' }, 'Not enough data for a chart.'),
    pts.length > 1 ? chartBlock(pts, 'cadence', 'Cadence (rpm)', CADENCE_COLOR) : null,
    h('p', { class: 'faint small' }, 'Touch a chart to see the values at that moment. Only the summary and a small picture are saved.'),
    h('button', { class: 'btn btn-primary btn-big', onclick: () => { close(); log(); } }, icon('plus'), 'Log this ride'),
  ), { full: true, label: 'Ride done' });
}
