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
  unlockAudio();
  keepAwake('runner');
  let run = { ...o.run };
  let finished = false;
  let lastIndex = -1;
  let lastCount = 0;
  let timer = 0;

  const phase = h('div', { class: 'phase' });
  const count = h('div', { class: 'count', role: 'timer', 'aria-live': 'off' });
  const next = h('div', { class: 'next' });
  const dots = h('div', { class: 'dots' });
  const remaining = h('div', { class: 'faint' });
  const pauseBtn = h('button', { class: 'btn btn-big', onclick: () => togglePause() });
  const wrap = h('div', { class: 'runner' });

  const setRun = (r) => { run = r; o.save(run); tick(); };
  const togglePause = () => {
    const t = Date.now();
    setRun(run.pausedAt != null ? { ...run, pausedMs: run.pausedMs + (t - run.pausedAt), pausedAt: null } : { ...run, pausedAt: t });
  };
  const skip = () => {
    const p = position(o.script, runSeconds(run, Date.now()));
    if (!p.done) setRun({ ...run, skipSec: (run.skipSec || 0) + p.left + 0.01 });
  };

  function tick() {
    if (finished) return;
    const p = position(o.script, runSeconds(run, Date.now()));
    if (p.done) { finished = true; clearInterval(timer); cue('done'); o.onDone(run); refreshSheets(); return; }
    const seg = p.segment;
    if (p.index !== lastIndex) {
      if (lastIndex !== -1 || p.index === 0) cue(seg.type === 'work' ? 'work' : 'rest');
      lastIndex = p.index;
      lastCount = 0;
    }
    const whole = Math.ceil(p.left);
    if (whole <= 3 && whole >= 1 && whole !== lastCount && run.pausedAt == null) { lastCount = whole; cue('count'); }
    wrap.className = `runner ${seg.type}`;
    phase.textContent = run.pausedAt != null ? `${seg.name} — paused` : seg.name;
    count.textContent = fmtClock(whole);
    const nx = o.script[p.index + 1];
    next.textContent = nx ? `Next: ${nx.name} (${fmtClock(nx.sec)})` : 'Last one!';
    remaining.textContent = `${fmtClock(p.remaining)} left in total`;
    if (dots.childElementCount !== o.script.length) dots.replaceChildren(...o.script.map(() => h('span', { class: 'dot' })));
    [...dots.children].forEach((d, i) => { d.className = `dot${i < p.index ? ' done' : i === p.index ? ' now' : ''}`; });
    pauseBtn.replaceChildren(icon(run.pausedAt != null ? 'play' : 'pause'), run.pausedAt != null ? 'Resume' : 'Pause');
  }

  const close = openSheet((closeSheet) => {
    if (finished) return o.doneView(closeSheet);
    wrap.replaceChildren(
      h('div', { class: 'spread' }, h('h2', null, o.title),
        h('button', { class: 'icon-btn sm', 'aria-label': 'Minimise', onclick: closeSheet }, icon('back'))),
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '16px' } }, phase, count, next, dots, remaining),
      h('div', { class: 'controls' },
        pauseBtn,
        h('button', { class: 'btn btn-big', onclick: skip }, 'Skip ›'),
        h('button', { class: 'btn btn-danger btn-block', style: { gridColumn: '1 / -1' }, onclick: async () => {
          if (!(await confirmSheet(`Stop ${o.title}?`, 'You can’t resume it afterwards.', { ok: 'Stop', danger: true }))) return;
          const p = position(o.script, runSeconds(run, Date.now()));
          finished = true; clearInterval(timer); closeSheet(); o.onStop(run, p.workDone);
        } }, 'Stop')));
    return wrap;
  }, { full: true, label: o.title, onClose: () => { clearInterval(timer); allowSleep('runner'); } });
  timer = window.setInterval(tick, 200);
  tick();
  return close;
}

export const scriptMinutes = (script) => Math.round(totalSec(script) / 60);
