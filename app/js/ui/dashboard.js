// Today: start buttons + 6-minute fallback (weekly goals are added in phase 6).
import { h, icon, toast } from './dom.js';
import * as store from '../store.js';
import { openStartSheet } from './session.js';
import { openRunner } from './runner.js';
import { FALLBACK_SCRIPT, FALLBACK_MOVES } from '../core/model.js';
import { settle } from '../core/timeline.js';
import { uid } from '../core/util.js';
import { unlockAudio } from '../platform/cues.js';

const { state } = store;

// ---------- 6-minute fallback ----------
export function startFallback() {
  unlockAudio();
  const t = Date.now();
  store.setSetting('fallbackRun', { startedAt: t, pausedMs: 0, pausedAt: null, skipSec: 0, firstStartedAt: t, rounds: 1 });
  showFallback();
}

function showFallback() {
  const r = state.settings.fallbackRun;
  if (!r) return;
  openRunner({
    title: '6-minute fallback', script: FALLBACK_SCRIPT, run: r,
    save: (run) => store.setSetting('fallbackRun', { ...state.settings.fallbackRun, ...run }),
    onDone: () => {},
    onStop: (_run, workDone) => saveFallback((r.rounds - 1) * FALLBACK_MOVES.length + workDone),
    doneView: (close) => h('div', { class: 'runner rest' },
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '12px' } },
        h('div', { class: 'phase' }, `Round ${r.rounds} done`),
        h('p', { class: 'muted' }, 'Logged as Fallback — it doesn’t count toward the other goals.')),
      h('div', { class: 'stack' },
        h('button', { class: 'btn btn-big', onclick: async () => {
          close();
          await store.setSetting('fallbackRun', { ...r, startedAt: Date.now(), pausedMs: 0, pausedAt: null, skipSec: 0, rounds: r.rounds + 1 });
          showFallback();
        } }, 'Repeat circuit'),
        h('button', { class: 'btn btn-primary btn-big', onclick: () => { close(); saveFallback(r.rounds * FALLBACK_MOVES.length); } }, 'Save & finish'))),
  });
}

/** Save a fallback session with the number of moves completed (0 → nothing saved). */
async function saveFallback(movesDone) {
  const r = state.settings.fallbackRun;
  await store.setSetting('fallbackRun', null);
  if (!r || movesDone <= 0) { toast('Fallback stopped — nothing saved'); return; }
  const end = Date.now();
  /** @type {any[]} */
  const items = FALLBACK_MOVES.map((name, i) => ({
    id: uid('i_'), exerciseId: `fallback:${name}`, name, targets: { sets: r.rounds, durationSec: 45 }, tracking: ['time'],
    sets: Array.from({ length: Math.floor(movesDone / FALLBACK_MOVES.length) + (i < movesDone % FALLBACK_MOVES.length ? 1 : 0) }, () => ({ at: end, timeSec: 45 })),
  })).filter((it) => it.sets.length);
  await store.saveSession({
    id: uid('s_'), kind: 'fallback', name: '6-minute fallback', split: null, includeCardio: false, equipment: 'bodyweight',
    startedAt: r.firstStartedAt, clockStartedAt: r.firstStartedAt, endedAt: end, pausedMs: 0, status: 'done', source: 'forge',
    sections: [{ category: 'resistance', items }],
  });
  toast(`Fallback saved (${movesDone} moves)`);
}

export function render(root) {
  const fb = state.settings.fallbackRun;
  const fbLeft = fb ? !settle(FALLBACK_SCRIPT, fb, Date.now()).done : false;
  root.append(
    h('div', { class: 'screen-head' }, h('h1', null, 'Forge')),
    h('div', { class: 'stack' },
      fb ? h('div', { class: 'card stack' },
        h('h3', null, fbLeft ? 'Fallback in progress' : 'Fallback finished'),
        h('button', { class: 'btn btn-primary btn-block', onclick: showFallback }, fbLeft ? 'Open' : 'Repeat or save')) : null,
      h('button', { class: 'btn btn-primary btn-big', onclick: openStartSheet }, icon('play'), 'Begin next session'),
      h('button', { class: 'btn btn-big', onclick: startFallback }, icon('bolt'), '6-minute fallback')));
}
