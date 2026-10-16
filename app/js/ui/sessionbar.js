// Always-visible session bar: total time · WORK / REST · pause. Ticks 4×/s
// from saved timestamps, so it is right even after the phone slept.
// Built once; ticks only change text, so taps on its buttons are never lost.
import { h, icon } from './dom.js';
import * as store from '../store.js';
import * as clock from '../core/clock.js';
import { fmtClock } from '../core/util.js';
import { update } from './session.js';

const host = /** @type {HTMLElement} */ (document.getElementById('session-bar'));
let timer = 0;
/** Called when a rest runs out (cues hook in here). */
let onRestEnd = () => {};
export function setRestEndHandler(fn) { onRestEnd = fn; }
let lastKey = '';

const clockEl = h('div', { class: 'clock' });
const modeEl = h('div', { class: 'mode' });
const skipBtn = h('button', { class: 'btn btn-sm', onclick: () => update((x) => clock.closeRest(x, Date.now())) }, 'Skip rest');
const backLink = h('a', { class: 'btn btn-sm', href: '#/' }, 'Workout');
const playBtn = h('button', { class: 'icon-btn', onclick: () => update((x) => (clock.isRunning(x) ? clock.pause(x, Date.now()) : clock.start(x, Date.now()))) });
const bar = h('div', { class: 'session-bar' }, h('div', { class: 'grow' }, clockEl, modeEl), skipBtn, backLink, playBtn);
let playState = '';

function draw() {
  const s = store.activeSession();
  if (!s) {
    if (host.firstChild) host.replaceChildren();
    document.documentElement.style.setProperty('--bar-h', '0px');
    lastKey = '';
    return;
  }
  if (!host.firstChild) host.append(bar);
  document.documentElement.style.setProperty('--bar-h', '72px');
  const t = Date.now();
  const iv = clock.interval(s, t);
  // Rest just ran out (only while watching it, not when reopening the app later).
  const key = `${s.id}:${s.rest?.startedAt ?? ''}`;
  if (iv.restOver && iv.sec < 2 && lastKey === `${key}:rest`) onRestEnd();
  lastKey = `${key}:${iv.mode}`;

  clockEl.textContent = fmtClock(clock.elapsedMs(s, t) / 1000);
  const word = { idle: 'READY', paused: 'PAUSED', work: 'WORK', rest: 'REST' }[iv.mode];
  modeEl.className = `mode mode-${iv.mode === 'rest' ? 'rest' : iv.mode === 'work' ? 'work' : 'paused'}`;
  modeEl.textContent = iv.mode === 'idle' ? 'Tap ▶ or log a set to start' : `${word} ${fmtClock(iv.sec)}${iv.mode === 'rest' ? ' left' : ''}`;
  skipBtn.classList.toggle('hidden', iv.mode !== 'rest');
  // "Workout" link only when you're on another tab.
  backLink.classList.toggle('hidden', !location.hash.replace(/^#\/?/, ''));
  const running = clock.isRunning(s);
  if (playState !== String(running)) {
    playState = String(running);
    playBtn.replaceChildren(icon(running ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', running ? 'Pause' : 'Start');
  }
}

export function startBar() {
  draw();
  clearInterval(timer);
  timer = window.setInterval(draw, 250);
  store.subscribe(draw);
  window.addEventListener('hashchange', draw);
}
