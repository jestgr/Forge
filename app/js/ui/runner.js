// Full-screen interval runner (4×4, fallback, cool-down). Huge countdown,
// auto-advancing segments, 3-2-1 beeps, cue on every change, screen kept on.
// Its state lives with the caller (saved), so closing the app doesn't lose it.
import { h, icon, openSheet, confirmSheet, refreshSheets } from './dom.js';
import { position, runSeconds, totalSec } from '../core/timeline.js';
import { fmtClock } from '../core/util.js';
import { cue, unlockAudio } from '../platform/cues.js';
import { keepAwake, allowSleep } from '../platform/wakelock.js';

/** @typedef {import('../core/model.js').Segment} Segment */
/** @typedef {{ startedAt: number, pausedMs: number, pausedAt: number|null, skipSec: number }} Run */

/**
 * @param {{ title: string, script: Segment[], run: Run,
 *   save: (run: Run) => any,
 *   onDone: (run: Run) => any,
 *   onStop: (run: Run, workDone: number) => any,
 *   doneView: (close: () => void) => Node }} o
 */
export function openRunner(o) {
  const iv = createIntervals(o);
  const wrap = h('div', { class: 'runner' });
  iv.onSegment = (seg) => { wrap.className = `runner ${seg.type}`; };
  const close = openSheet((closeSheet) => {
    if (iv.finished) return o.doneView(closeSheet);
    wrap.replaceChildren(
      h('div', { class: 'spread' }, h('h2', null, o.title),
        h('button', { class: 'icon-btn sm', 'aria-label': 'Minimise', onclick: closeSheet }, icon('back'))),
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '16px' } }, iv.phase, iv.count, iv.next, iv.dots, iv.remaining),
      h('div', { class: 'controls' },
        iv.pauseBtn,
        h('button', { class: 'btn btn-big', onclick: iv.skip }, 'Skip ›'),
        h('button', { class: 'btn btn-danger btn-block', style: { gridColumn: '1 / -1' }, onclick: () => iv.stop(closeSheet) }, 'Stop')));
    return wrap;
  }, { full: true, label: o.title, onClose: () => { iv.dispose(); allowSleep('runner'); } });
  keepAwake('runner');
  iv.start();
  return close;
}

/**
 * The interval engine without its screen: countdown elements, cues, pause / skip / stop, completion. Used by the
 * full-screen runner and by the bike ride view (4×4 on the bike). Only one should run for a given script at a time
 * (each one cues).
 * @param {{ title: string, script: Segment[], run: Run, save: (run: Run) => any, onDone: (run: Run) => any,
 *   onStop: (run: Run, workDone: number) => any }} o
 */
export function createIntervals(o) {
  unlockAudio();
  let run = { ...o.run };
  let finished = false;
  let lastIndex = -1;
  let lastCount = 0;
  let timer = 0;
  const iv = {
    phase: h('div', { class: 'phase' }),
    count: h('div', { class: 'count', role: 'timer', 'aria-live': 'off' }),
    next: h('div', { class: 'next' }),
    dots: h('div', { class: 'dots' }),
    remaining: h('div', { class: 'faint' }),
    pauseBtn: h('button', { class: 'btn btn-big', onclick: () => iv.togglePause() }),
    get finished() { return finished; },
    /** Where the run is now. */
    position: () => position(o.script, runSeconds(run, Date.now())),
    /** Called with the current segment on every tick (screens colour themselves). @type {(seg: Segment) => void} */
    onSegment: (_seg) => {},
    togglePause() {
      const t = Date.now();
      setRun(run.pausedAt != null ? { ...run, pausedMs: run.pausedMs + (t - run.pausedAt), pausedAt: null } : { ...run, pausedAt: t });
    },
    skip() {
      const p = iv.position();
      if (!p.done) setRun({ ...run, skipSec: (run.skipSec || 0) + p.left + 0.01 });
    },
    /** Ask, then stop for good. @param {() => void} [after] */
    async stop(after) {
      if (!(await confirmSheet(`Stop ${o.title}?`, 'You can’t resume it afterwards.', { ok: 'Stop', danger: true }))) return;
      const p = iv.position();
      finished = true; clearInterval(timer); after?.(); o.onStop(run, p.workDone);
    },
    start() { clearInterval(timer); timer = window.setInterval(tick, 200); tick(); },
    dispose() { clearInterval(timer); },
  };
  const setRun = (/** @type {Run} */ r) => { run = r; o.save(run); tick(); };

  function tick() {
    if (finished) return;
    const p = iv.position();
    if (p.done) { finished = true; clearInterval(timer); cue('done'); o.onDone(run); refreshSheets(); return; }
    const seg = /** @type {Segment} */ (p.segment);
    if (p.index !== lastIndex) {
      if (lastIndex !== -1 || p.index === 0) cue(seg.type === 'work' ? 'work' : 'rest');
      lastIndex = p.index;
      lastCount = 0;
    }
    const whole = Math.ceil(p.left);
    if (whole <= 3 && whole >= 1 && whole !== lastCount && run.pausedAt == null) { lastCount = whole; cue('count'); }
    iv.onSegment(seg);
    iv.phase.textContent = run.pausedAt != null ? `${seg.name} — paused` : seg.name;
    iv.count.textContent = fmtClock(whole);
    const nx = o.script[p.index + 1];
    iv.next.textContent = nx ? `Next: ${nx.name} (${fmtClock(nx.sec)})` : 'Last one!';
    iv.remaining.textContent = `${fmtClock(p.remaining)} left in total`;
    if (iv.dots.childElementCount !== o.script.length) iv.dots.replaceChildren(...o.script.map(() => h('span', { class: 'dot' })));
    [...iv.dots.children].forEach((d, i) => { d.className = `dot${i < p.index ? ' done' : i === p.index ? ' now' : ''}`; });
    iv.pauseBtn.replaceChildren(icon(run.pausedAt != null ? 'play' : 'pause'), run.pausedAt != null ? 'Resume' : 'Pause');
  }
  return iv;
}

export const scriptMinutes = (script) => Math.round(totalSec(script) / 60);
