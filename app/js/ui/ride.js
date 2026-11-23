// Echelon bike screens: the small live panel inside a cardio card (cardio add-on), the full-screen ride view
// (Pure Cardio), and the end-of-ride chart. Live numbers update in place (elements with class bk-<key>) instead
// of re-rendering the page every second. Saving is done by session.js through the callbacks given here.
import { h, icon, openSheet, confirmSheet, refreshSheets, toast } from './dom.js';
import * as store from '../store.js';
import { bikeAvailable, bikeRide, onBikeChange, reconnect, simDrop, cancelRide, connectHeartRate } from '../platform/bike.js';
import { hrAvailable, hrLink, simHrDrop } from '../platform/hr.js';
import { seriesSvg, plotBox, pointAt, liveSvg, liveBox, liveStart, hrSvg, LIVE_WINDOW, WATTS_COLOR, CADENCE_COLOR, RESIST_COLOR, HR_COLOR } from '../core/chart.js';
import { hrZone, zoneBounds, ZONE_NAMES, ZONE_COLORS, hardTarget, vsTarget } from '../core/hr.js';
import { createIntervals } from './runner.js';
import { BEST_WINDOWS } from '../core/bike.js';
import { fmtClock } from '../core/util.js';

/** @typedef {import('../core/bike.js').RideSummary} RideSummary */
/** @typedef {import('../core/chart.js').Point} Point */

export const STATUS = {
  scanning: 'Looking for the bike… pedal to wake it', connecting: 'Connecting…', connected: 'Connected',
  reconnecting: 'Connection lost — reconnecting…', failed: 'Not connected',
};

export const HR_STATUS = {
  scanning: 'Looking for heart rate…', connecting: 'Connecting heart rate…', connected: 'Heart rate',
  reconnecting: 'Heart rate lost — reconnecting…', failed: 'No heart rate',
};

/** The 4×4 running on an exercise, as interval-engine settings (set by session.js), or null.
 * @type {(itemId: string) => any} */
let intervalSource = () => null;
/** @param {(itemId: string) => any} fn */
export function setIntervalSource(fn) { intervalSource = fn; }

/** The interval engine of the combined 4×4 + ride screen (one at a time, kept across re-renders).
 * @type {{ key: number, iv: ReturnType<typeof createIntervals> }|null} */
let engine = null;
function intervalsFor(/** @type {string} */ itemId) {
  const cfg = intervalSource(itemId);
  if (!cfg) {
    if (engine?.iv.finished && engine.iv.position().done) toast('4×4 complete — counts toward HIIT. Keep riding or stop.', 5000);
    engine?.iv.dispose(); engine = null; return null;
  }
  if (engine?.key !== cfg.run.startedAt) {
    engine?.iv.dispose();
    const iv = createIntervals(cfg);
    engine = { key: cfg.run.startedAt, iv };
    iv.start();
  }
  return engine.iv;
}
const dropEngine = () => { engine?.iv.dispose(); engine = null; };

/** In a 4×4 hard interval right now (combined screen)? */
const inHard = () => !!engine && !engine.iv.finished && engine.iv.position().segment?.type === 'work';

/** Heart-rate target line for hard intervals: text and colour. */
function targetText() {
  const r = bikeRide();
  if (!r || !inHard()) return { text: '', color: '' };
  const t = hardTarget(r.maxHr);
  const bpm = r.ride.latest().hr;
  const range = `Target ${t.from}–${t.to} bpm`;
  if (!bpm) return { text: range, color: 'var(--muted)' };
  const v = vsTarget(bpm, r.maxHr);
  return v === 0 ? { text: `${range} · in target ✓`, color: 'var(--good)' }
    : v < 0 ? { text: `${range} · push harder ↑`, color: 'var(--accent)' }
      : { text: `${range} · ease off a little ↓`, color: 'var(--accent)' };
}

/** The 4×4 countdown on top of the ride screen. @param {ReturnType<typeof createIntervals>} iv */
function intervalBanner(iv) {
  const target = h('div', { class: 'ivl-target bk-target' });
  const banner = h('div', { class: 'ivl' },
    h('div', { class: 'spread' }, h('span', { class: 'tiny faint' }, '4×4 protocol'), iv.remaining),
    iv.phase, iv.count, iv.next, iv.dots, target,
    h('div', { class: 'ivl-controls' }, iv.pauseBtn,
      h('button', { class: 'btn btn-sm', onclick: iv.skip }, 'Skip ›'),
      h('button', { class: 'btn btn-sm btn-danger', onclick: () => iv.stop() }, 'Stop 4×4')));
  iv.onSegment = (seg) => {
    banner.className = `ivl ${seg.type}`;
    const t = targetText();
    target.textContent = t.text;
    target.style.color = t.color;
  };
  return banner;
}

/** The summary is recomputed only when a new sample arrived (it walks the whole ride). */
let sumCache = { ride: /** @type {any} */ (null), n: -1, s: /** @type {any} */ (null) };
function liveSummary(/** @type {NonNullable<ReturnType<typeof bikeRide>>} */ r) {
  const n = r.ride.samples().length;
  if (sumCache.ride !== r || sumCache.n !== n) sumCache = { ride: r, n, s: r.ride.summary() };
  return sumCache.s;
}

/** Heart-rate zone of the current reading (0 = none). */
function liveZone() {
  const r = bikeRide();
  const bpm = r?.ride.latest().hr;
  return r && bpm ? hrZone(bpm, r.maxHr) : 0;
}

/** Live values by key, as text. */
function liveText() {
  const r = bikeRide();
  if (!r) return {};
  const live = r.ride.latest();
  const sum = liveSummary(r);
  const num = (/** @type {number|undefined|null} */ v) => (v == null ? '–' : String(Math.round(v)));
  const z = liveZone();
  return {
    cadence: num(live.cadence), watts: num(live.powerW), resistance: num(live.resistance), hr: num(live.hr),
    zone: z ? `Z${z} ${ZONE_NAMES[z]}` : live.hr ? 'below Z1' : '',
    time: fmtClock(sum.timeSec), distance: sum.distanceMi != null ? sum.distanceMi.toFixed(2) : '–',
    speed: sum.avgSpeedMph != null ? sum.avgSpeedMph.toFixed(1) : '–', kcal: num(sum.kcal),
    avgWatts: num(sum.avgWatts), maxWatts: num(sum.maxWatts), avgCadence: num(sum.avgCadence),
    status: STATUS[r.status],
  };
}

let lastStatus = '';
let lastChartAt = 0;
onBikeChange(() => {
  const r = bikeRide();
  const hl = hrLink();
  const st = r ? `${r.status}|${r.error || ''}|${hl ? `${hl.status}|${hl.error || ''}|${hl.name || ''}` : '-'}` : '';
  if (st !== lastStatus) { lastStatus = st; refreshSheets(); store.emit(); return; } // layout changes
  for (const [k, v] of Object.entries(liveText())) {
    for (const el of document.querySelectorAll(`.bk-${k}`)) el.textContent = v;
  }
  for (const el of document.querySelectorAll('.bk-zone')) /** @type {HTMLElement} */ (el).style.color = ZONE_COLORS[liveZone()];
  if (document.querySelector('.bk-target')) {
    const t = targetText();
    for (const el of document.querySelectorAll('.bk-target')) { el.textContent = t.text; /** @type {HTMLElement} */ (el).style.color = t.color; }
  }
  if (Date.now() - lastChartAt >= 1000) {
    lastChartAt = Date.now();
    for (const el of document.querySelectorAll('.bk-chart')) /** @type {any} */ (el).render?.();
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

/** Simulator only: small buttons to test reconnecting. */
const simButton = () => (bikeRide()?.sim && bikeRide()?.status === 'connected'
  ? h('div', { class: 'row-wrap' },
    h('button', { class: 'btn btn-sm', onclick: simDrop }, 'Simulate dropout'),
    hrLink()?.status === 'connected' ? h('button', { class: 'btn btn-sm', onclick: simHrDrop }, 'Simulate HR dropout') : null)
  : null);

/** Heart-rate big number with its zone underneath. */
const hrBig = () => h('div', { class: 'bike-big' },
  h('div', { class: 'bike-num bk-hr', style: { color: HR_COLOR } }, liveText().hr ?? '–'),
  h('div', { class: 'tiny faint' }, 'bpm'),
  h('div', { class: 'tiny bk-zone', style: { color: ZONE_COLORS[liveZone()], fontWeight: '800' } }, liveText().zone ?? ''));

/** Heart-rate link: connect button, status, retry. Null when heart rate isn't possible (browser, no simulator). */
function hrBlock() {
  if (!hrAvailable() || !bikeRide()) return null;
  const l = hrLink();
  if (!l) return h('button', { class: 'btn btn-sm', onclick: () => connectHeartRate() }, icon('heart'), 'Connect heart rate');
  const good = l.status === 'connected';
  return h('div', { class: 'stack', style: { gap: '4px' } },
    h('div', { class: 'spread' },
      h('span', { class: 'badge' + (good ? ' good' : l.status === 'reconnecting' ? ' accent' : '') }, HR_STATUS[l.status]),
      h('span', { class: 'faint small' }, [l.name, l.sim ? '(simulator)' : ''].filter(Boolean).join(' '))),
    l.status === 'scanning' ? h('p', { class: 'small muted' }, 'On the Garmin: turn on Broadcast Heart Rate (controls menu, or Settings → Wrist Heart Rate).') : null,
    l.status === 'failed' ? h('p', { class: 'small muted' }, `${l.error ? `${l.error}. ` : ''}Turn on Broadcast Heart Rate on the watch, then try again.`) : null,
    l.status === 'failed' ? h('button', { class: 'btn btn-sm', onclick: () => connectHeartRate() }, icon('sync'), 'Try heart rate again') : null);
}

/**
 * Live chart: watts + resistance over the last 15 minutes. Drag sideways to look back in time (the chart then
 * stays put); "Live" jumps back to now. Touching shows the values at that moment.
 */
function liveChart() {
  const W = 340; const H = 150;
  const b = liveBox(W, H);
  const plot = h('div', { class: 'ride-chart' });
  const info = h('span', { class: 'tiny faint' });
  const liveBtn = h('button', { class: 'btn btn-sm', hidden: true, onclick: () => { wrap.pin = null; wrap.render(); } }, 'Live ▸');
  const legend = () => {
    info.replaceChildren(h('span', { style: { color: WATTS_COLOR } }, '— watts'), '  ', h('span', { style: { color: RESIST_COLOR } }, '— resistance'),
      wrap.pin != null ? `  · ${fmtClock(liveStart(wrap.pin))}–${fmtClock(liveStart(wrap.pin) + LIVE_WINDOW)}` : '  · last 15 min');
  };
  const wrap = /** @type {any} */ (h('div', { class: 'ride-chart-wrap bk-chart' }, plot));
  wrap.pin = /** @type {number|null} */ (null);
  const pts = () => bikeRide()?.ride.series() ?? [];
  const lastT = (/** @type {any[]} */ p) => (p.length ? p[p.length - 1].t : 0);
  wrap.render = () => {
    const p = pts();
    plot.innerHTML = liveSvg(p, { end: wrap.pin ?? lastT(p), width: W, height: H });
    liveBtn.hidden = wrap.pin == null;
    if (!drag) legend();
  };
  /** @type {{ x: number, end: number }|null} */
  let drag = null;
  const tAt = (/** @type {PointerEvent} */ e, /** @type {number} */ end) => {
    const rect = wrap.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * W;
    return liveStart(end) + ((fx - b.left) / (b.right - b.left)) * LIVE_WINDOW;
  };
  const show = (/** @type {PointerEvent} */ e, /** @type {any[]} */ p, /** @type {number} */ end) => {
    const pt = pointAt(p.filter((x) => x.t >= liveStart(end) && x.t <= liveStart(end) + LIVE_WINDOW), tAt(e, end));
    if (pt) info.textContent = `${pt.label} · ${Math.round(pt.watts)} W · res ${pt.resistance ?? '–'} · ${Math.round(pt.cadence)} rpm${pt.hr ? ` · ${pt.hr} bpm` : ''}`;
  };
  wrap.onpointerdown = (/** @type {PointerEvent} */ e) => {
    const p = pts();
    drag = { x: e.clientX, end: wrap.pin ?? lastT(p) };
    show(e, p, drag.end);
  };
  wrap.onpointermove = (/** @type {PointerEvent} */ e) => {
    if (!drag) return;
    const p = pts();
    const rect = wrap.getBoundingClientRect();
    const plotPx = rect.width * ((b.right - b.left) / W);
    const end = drag.end - ((e.clientX - drag.x) / plotPx) * LIVE_WINDOW;
    const last = lastT(p);
    if (Math.abs(e.clientX - drag.x) > 4) {
      wrap.pin = end >= last - 1 ? null : Math.max(Math.min(LIVE_WINDOW, last), end);
      plot.innerHTML = liveSvg(p, { end: wrap.pin ?? last, width: W, height: H });
      liveBtn.hidden = wrap.pin == null;
    }
    show(e, p, wrap.pin ?? last);
  };
  wrap.onpointerup = wrap.onpointercancel = () => { drag = null; setTimeout(() => { if (!drag) legend(); }, 2500); };
  wrap.render();
  return h('div', { class: 'stack', style: { gap: '4px' } }, h('div', { class: 'spread' }, info, liveBtn), wrap);
}

/** Live averages row. */
const averages = () => h('div', { class: 'row-wrap', style: { justifyContent: 'space-between' } },
  small('avgWatts', 'W avg'), small('maxWatts', 'W max'), small('avgCadence', 'rpm avg'));

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
      intervalSource(it.id) ? h('button', { class: 'btn btn-primary btn-block', onclick: () => openRideView(o.stop) }, icon('bolt'), '4×4 + ride — open') : null,
      hrBlock(),
      h('div', { class: hrAvailable() ? 'grid-4 bike-bigs' : 'grid-3' }, big('cadence', 'rpm'), big('watts', 'watts (est.)'), big('resistance', 'resistance'), hrAvailable() ? hrBig() : null),
      h('div', { class: 'row-wrap', style: { justifyContent: 'space-between' } }, small('time', ''), small('distance', 'mi'), small('speed', 'mph'), small('kcal', 'kcal')),
      averages(),
      liveChart(),
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
    x.avgResistance != null && `resistance ${x.avgResistance}`, x.avgHr != null && `${x.avgHr} bpm avg`,
    x.kcal != null && `~${x.kcal} kcal`].filter(Boolean).join(' · ');
}

/** Full-screen ride view (Pure Cardio). Minimise keeps riding. @param {() => void} stop */
let rideViewOpen = false;
export function openRideView(stop) {
  if (rideViewOpen) { refreshSheets(); return; } // already showing (e.g. 4×4 started from the card underneath)
  rideViewOpen = true;
  openSheet((close) => {
    const r = bikeRide();
    if (!r) { setTimeout(close); return h('div'); }
    const iv = intervalsFor(r.itemId);
    const ivOn = iv && !iv.finished;
    return h('div', { class: 'ride-full' },
      h('div', { class: 'spread' }, h('h2', null, ivOn ? '4×4 ride' : 'Echelon ride'),
        h('button', { class: 'icon-btn sm', 'aria-label': 'Minimise', onclick: close }, icon('back'))),
      statusBlock(),
      hrBlock(),
      ivOn ? intervalBanner(iv) : null,
      h('div', { class: 'ride-live' },
        ivOn ? h('div', { class: 'center' }, h('span', { class: 'mono bike-small bk-time' }, liveText().time), h('span', { class: 'tiny faint' }, ' ride time'))
          : h('div', { class: 'ride-time mono bk-time' }, liveText().time),
        h('div', { class: 'ride-bigs' + (hrAvailable() ? ' four' : '') }, big('cadence', 'rpm'), big('watts', 'watts (est.)'), big('resistance', 'resistance'), hrAvailable() ? hrBig() : null),
        h('div', { class: 'grid-3' }, small('distance', 'mi'), small('speed', 'mph'), small('kcal', 'kcal')),
        averages(),
        liveChart()),
      simButton(),
      h('div', { class: 'ride-actions' },
        h('button', { class: 'btn btn-primary btn-big', onclick: () => { close(); stop(); } }, icon('check'), 'Stop ride'),
        h('button', { class: 'btn btn-danger btn-block', onclick: async () => {
          if (await confirmSheet('Cancel the ride?', 'Nothing from the bike is saved.', { ok: 'Cancel ride', cancel: 'Keep riding', danger: true })) { close(); await cancelRide(); }
        } }, 'Cancel ride')));
  }, { full: true, label: 'Echelon ride', onClose: () => { rideViewOpen = false; dropEngine(); } });
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

const WINDOW_NAMES = { 60: '1 min', 300: '5 min', 1200: '20 min' };

/**
 * Best watts over 1 / 5 / 20 minutes from all saved rides except the one that started at `except`.
 * @param {number|null} except
 * @returns {Record<number, number>}
 */
export function allTimeBests(except) {
  /** @type {Record<number, number>} */
  const out = {};
  for (const s of store.state.sessions) {
    for (const sec of s.sections || []) {
      for (const it of sec.items || []) {
        const r = /** @type {any} */ (it).ride;
        if (!r?.best || r.startedAt === except) continue;
        for (const w of BEST_WINDOWS) if (r.best[w] != null && r.best[w] > (out[w] ?? 0)) out[w] = r.best[w];
      }
    }
  }
  return out;
}

/** Best 1 / 5 / 20 minutes, with the all-time best next to it. @param {RideSummary} sum */
function bestBlock(sum) {
  if (!sum.best || BEST_WINDOWS.every((w) => sum.best[w] == null)) return null;
  const ever = allTimeBests(sum.startedAt);
  return h('div', { class: 'stack', style: { gap: '4px' } },
    h('span', { class: 'tiny faint' }, 'Best efforts (watts, estimated)'),
    ...BEST_WINDOWS.filter((w) => sum.best[w] != null).map((w) => {
      const v = /** @type {number} */ (sum.best[w]);
      const prev = ever[w];
      return h('div', { class: 'spread small' },
        h('span', null, WINDOW_NAMES[/** @type {60|300|1200} */ (w)]),
        h('span', null, h('b', { class: 'mono' }, `${v} W`), ' ',
          prev == null ? h('span', { class: 'faint' }, 'first one')
            : v > prev ? h('span', { class: 'badge good' }, `New best (was ${prev})`)
              : h('span', { class: 'faint' }, `best ever ${prev}`)));
    }));
}

/** Time in each heart-rate zone as bars. @param {RideSummary} sum */
function zoneBlock(sum) {
  if (!sum.zones || !sum.zoneMaxHr) return null;
  const total = sum.zones.reduce((a, b) => a + b, 0) || 1;
  const bounds = zoneBounds(sum.zoneMaxHr);
  return h('div', { class: 'stack', style: { gap: '4px' } },
    h('span', { class: 'tiny faint' }, `Time in heart-rate zones (max ${sum.zoneMaxHr} bpm)`),
    ...[5, 4, 3, 2, 1, 0].map((z) => h('div', { class: 'zone-row small' },
      h('span', { class: 'zone-name' }, z ? `Z${z} ${ZONE_NAMES[z]}` : 'Below Z1'),
      h('span', { class: 'zone-bar' }, h('span', { style: { width: `${(sum.zones[z] / total) * 100}%`, background: ZONE_COLORS[z] } })),
      h('span', { class: 'mono zone-time' }, fmtClock(sum.zones[z])),
      h('span', { class: 'faint tiny zone-range' }, z ? `${bounds[z - 1].from}${bounds[z - 1].to ? `–${bounds[z - 1].to}` : '+'}` : ''))));
}

/** 4×4 hard intervals: one row each. @param {RideSummary} sum */
function intervalsBlock(sum) {
  if (!sum.intervals?.length) return null;
  const t = sum.zoneMaxHr ? hardTarget(sum.zoneMaxHr) : null;
  return h('div', { class: 'stack', style: { gap: '2px' } },
    h('span', { class: 'tiny faint' }, `4×4 hard intervals${t ? ` (target ${t.from}–${t.to} bpm)` : ''}`),
    h('table', { class: 'ride-table small' },
      h('tr', null, ...['hard', 'W', 'rpm', 'bpm', 'peak', t ? 'in target' : null].filter((x) => x != null).map((x) => h('th', null, x))),
      ...sum.intervals.map((x) => h('tr', null,
        h('td', null, `#${x.n}`), h('td', { class: 'mono' }, x.avgWatts ?? '–'), h('td', { class: 'mono' }, x.avgCadence ?? '–'),
        h('td', { class: 'mono' }, x.avgHr ?? '–'), h('td', { class: 'mono' }, x.maxHr ?? '–'),
        t ? h('td', { class: 'mono' }, x.inTargetSec != null ? `${fmtClock(x.inTargetSec)} / ${fmtClock(x.sec)}` : '–') : null))));
}

/** Per-5-minute splits. @param {RideSummary} sum */
function splitsBlock(sum) {
  if (!sum.splits || sum.splits.length < 2) return null;
  const m = (/** @type {number} */ s) => Math.round(s / 60);
  return h('div', { class: 'stack', style: { gap: '2px' } },
    h('span', { class: 'tiny faint' }, 'Splits (5 min)'),
    h('table', { class: 'ride-table small' },
      h('tr', null, ...['min', 'W', 'rpm', 'res', 'bpm'].map((x) => h('th', null, x))),
      ...sum.splits.map((x) => h('tr', null,
        h('td', null, `${m(x.from)}–${m(x.to)}`), h('td', { class: 'mono' }, x.avgWatts ?? '–'), h('td', { class: 'mono' }, x.avgCadence ?? '–'),
        h('td', { class: 'mono' }, x.avgResistance ?? '–'), h('td', { class: 'mono' }, x.avgHr ?? '–')))));
}

/** Heart-rate chart (whole ride) if there was heart rate. @param {RideSummary} sum @param {Point[]} pts */
function hrChart(sum, pts) {
  if (pts.filter((p) => p.hr).length < 2) return null;
  return h('div', { class: 'stack', style: { gap: '4px' } },
    h('span', { class: 'tiny faint' }, `Heart rate (avg ${sum.avgHr ?? '–'}, max ${sum.maxHr ?? '–'})`),
    h('div', { class: 'ride-chart', html: hrSvg(pts, { maxHr: sum.zoneMaxHr }) }));
}

/**
 * End of ride: the charts from every second, the summary, and "Log this ride".
 * @param {RideSummary} sum @param {Point[]} pts @param {() => void} log
 */
export function openRideDone(sum, pts, log) {
  openSheet((close) => h('div', { class: 'stack' },
    h('div', { class: 'spread' }, h('h2', null, 'Ride done'), h('button', { class: 'icon-btn sm', 'aria-label': 'Close', onclick: close }, icon('x'))),
    h('p', { class: 'muted small' }, rideText(sum)),
    sum.workKj != null ? h('p', { class: 'faint small' }, `Work ${sum.workKj} kJ (estimated from watts)${sum.maxHr ? ` · max heart rate ${sum.maxHr}` : ''}`) : null,
    pts.length > 1 ? chartBlock(pts, 'watts', 'Watts (estimated)', WATTS_COLOR) : h('p', { class: 'faint small' }, 'Not enough data for a chart.'),
    pts.length > 1 ? chartBlock(pts, 'cadence', 'Cadence (rpm)', CADENCE_COLOR) : null,
    hrChart(sum, pts),
    intervalsBlock(sum),
    bestBlock(sum),
    zoneBlock(sum),
    splitsBlock(sum),
    h('p', { class: 'faint small' }, 'Touch a chart to see the values at that moment. Only the summary and a small picture are saved.'),
    h('button', { class: 'btn btn-primary btn-big', onclick: () => { close(); log(); } }, icon('plus'), 'Log this ride'),
  ), { full: true, label: 'Ride done' });
}
