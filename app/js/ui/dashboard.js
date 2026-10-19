// Today: this week's goals, split tracker, steps, start buttons, fallback.
import { h, icon, toast, openSheet, sheetHead, refreshSheets } from './dom.js';
import * as store from '../store.js';
import { openStartSheet } from './session.js';
import { openRunner } from './runner.js';
import { openSessionDetail, sessionTitle } from './history.js';
import { FALLBACK_SCRIPT, FALLBACK_MOVES, GOALS, SPLITS, TRACKER_SPLITS, label } from '../core/model.js';
import { settle } from '../core/timeline.js';
import { weekSummary, creditFor } from '../core/goals.js';
import { planWeek } from '../core/plans.js';
import { uid, dateKey, addDays, fmtDate, fmtNum, fmtMinutes } from '../core/util.js';
import { unlockAudio } from '../platform/cues.js';
import { setDaily } from '../platform/health.js';
import { FIELDS, sleepHoursOf } from '../core/metrics.js';
import * as hc from '../platform/healthconnect.js';
import { pending, suggest, overlapping, toSession, workoutLabel } from '../core/watch.js';
import { exportBackup } from './settings.js';

const { state } = store;
const BACKUP_NUDGE_DAYS = 14;

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

// ---------- steps & sleep ----------
export function openDailySheet(date = dateKey(Date.now())) {
  let day = date;
  const vals = {};
  const load = () => {
    const d = /** @type {any} */ (state.daily[day] || {});
    vals.steps = d.steps ?? '';
    vals.sleepHours = d.sleepHours ?? '';
    vals.watch = d.watch || {};
  };
  load();
  const today = dateKey(Date.now());
  const yesterday = dateKey(addDays(Date.now(), -1));
  openSheet((close) => h('div', { class: 'stack' },
    sheetHead('Steps & sleep', close),
    h('div', { class: 'grid-2' }, [[today, 'Today'], [yesterday, 'Yesterday']].map(([d, text]) => h('button', {
      class: 'chip', 'aria-pressed': String(day === d), onclick: () => { day = d; load(); refreshSheets(); },
    }, text))),
    day !== today && day !== yesterday ? h('p', { class: 'muted' }, fmtDate(new Date(day + 'T12:00').getTime())) : null,
    h('label', { class: 'field' }, h('span', null, 'Steps'),
      h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 0, value: vals.steps,
        placeholder: vals.watch.steps ? `Watch: ${fmtNum(Math.round(vals.watch.steps))}` : 'e.g. 8400', oninput: (e) => { vals.steps = e.target.value; } })),
    h('label', { class: 'field' }, h('span', null, 'Sleep (hours, night before)'),
      h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: 0.25, value: vals.sleepHours,
        placeholder: vals.watch.sleepMin ? `Watch: ${sleepHoursOf({ date: day, watch: vals.watch })} h` : 'e.g. 7.5', oninput: (e) => { vals.sleepHours = e.target.value; } })),
    vals.watch.steps || vals.watch.sleepMin ? h('p', { class: 'faint small' }, 'Leave a box empty to use the watch’s number; a number you type replaces it.') : null,
    h('button', { class: 'btn btn-primary btn-big', onclick: async () => {
      close();
      await setDaily(day, { steps: vals.steps === '' ? null : Number(vals.steps), sleepHours: vals.sleepHours === '' ? null : Number(vals.sleepHours) });
      toast('Saved');
    } }, 'Save')), { label: 'Steps and sleep' });
}

// ---------- from the watch ----------
const timeOf = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function syncNow(e) {
  e.stopPropagation();
  hc.pull().then((r) => { if (!r.read.length) toast('Nothing could be read — check Forge’s access in Health Connect', 5000); })
    .catch((err) => toast('Health Connect: ' + (err?.message || err), 5000));
}

function watchCard(now) {
  const d = state.daily[dateKey(now)];
  const w = d?.watch || {};
  const rows = FIELDS.filter((f) => f.dashboard && w[f.key] != null);
  const connected = hc.nativeAvailable() && hc.settings().connected;
  if (!rows.length && !connected) return null;
  const last = hc.settings().lastSyncAt;
  return h('div', { class: 'card stack', role: 'button', onclick: () => openDailySheet() },
    h('div', { class: 'spread' }, h('span', { class: 'tiny faint' }, 'From your watch today'),
      h('div', { class: 'row', style: { gap: '6px', alignItems: 'center' } },
        last ? h('span', { class: 'faint small' }, hc.reading() ? 'Reading…' : timeOf(last)) : null,
        connected ? h('button', { class: 'icon-btn sm' + (hc.reading() ? ' spin' : ''), 'aria-label': 'Read watch data now', disabled: hc.reading(), onclick: syncNow }, icon('sync')) : null)),
    rows.length
      ? h('div', { class: 'watch-grid' }, rows.map((f) => h('div', null,
        h('div', { class: 'faint small' }, f.label), h('div', { class: 'mono' }, f.show(w[f.key])))))
      : h('p', { class: 'muted small' }, 'Nothing yet today — Garmin sends data to Health Connect a few hours late.'));
}

const CHOICES = [['zone2', 'Zone 2'], ['hiit', 'HIIT'], ['heavy', 'Heavy']];

async function ignoreWorkout(w) {
  const keep = new Set(Object.keys(state.settings.watchWorkouts || {}));
  await store.setSetting('watchIgnored', [...(state.settings.watchIgnored || []).filter((id) => keep.has(id)), w.id]);
  toast('Ignored');
}

function workoutCards(now) {
  const list = pending(state.settings.watchWorkouts, state.sessions, state.settings.watchIgnored, now);
  if (!list.length) return null;
  return h('div', { class: 'stack', style: { gap: '8px' } },
    h('span', { class: 'tiny faint' }, 'Watch workouts — what do they count as?'),
    ...list.map((w) => {
      const sug = suggest(w, state.sessions);
      const over = overlapping(w, state.sessions);
      const facts = [fmtMinutes(w.durationSec / 60), w.avgHr ? `avg ${w.avgHr} bpm` : '', w.maxHr ? `max ${w.maxHr}` : '',
        w.kcal ? `${Math.round(w.kcal)} kcal` : '', w.distanceM ? `${(w.distanceM / 1609.344).toFixed(2)} mi` : ''].filter(Boolean).join(' · ');
      return h('div', { class: 'card stack' },
        h('div', { class: 'spread' }, h('h3', null, workoutLabel(w.type)), h('span', { class: 'faint small' }, `${fmtDate(w.start)} ${timeOf(w.start)}`)),
        h('p', { class: 'muted small' }, facts),
        over ? h('p', { class: 'small', style: { color: 'var(--ember)' } }, `During your Forge session (${sessionTitle(over)}) — probably Ignore.`) : null,
        h('div', { class: 'grid-4' },
          ...CHOICES.map(([k, text]) => h('button', { class: 'btn btn-sm' + (sug === k ? ' btn-primary' : ''), onclick: async () => {
            await store.saveSession(toSession(w, /** @type {any} */ (k)));
            toast(`Counted as ${text}`);
          } }, text)),
          h('button', { class: 'btn btn-sm' + (sug === null ? ' btn-primary' : ''), onclick: () => ignoreWorkout(w) }, 'Ignore')));
    }));
}

// ---------- screen ----------
function tile(name, cur, goal) {
  return h('div', { class: 'tile' + (cur >= goal ? ' met' : '') },
    h('div', { class: 'tiny faint' }, name),
    h('div', { class: 'num' }, String(cur), h('small', null, `/${goal}`)),
    h('div', { class: 'pips' }, Array.from({ length: goal }, (_, i) => h('span', { class: 'pip' + (i < cur ? ' on' : '') }))));
}

export function render(root) {
  const now = Date.now();
  const stepGoal = state.settings.stepGoal || GOALS.stepsPerDay;
  const w = weekSummary(state.sessions, state.daily, now, stepGoal);
  const fb = state.settings.fallbackRun;
  const fbLeft = fb ? !settle(FALLBACK_SCRIPT, fb, now).done : false;
  const plan = state.plans.find((p) => p.id === state.settings.plan?.id);
  const wk = plan ? planWeek(plan, state.settings.plan.startDate, now) : null;
  const last = state.settings.lastBackupAt;
  const nudge = state.sessions.length > 0 && (!last || now - last > BACKUP_NUDGE_DAYS * 86400000);
  const recent = state.sessions.filter((s) => s.status === 'done').slice(0, 3);

  root.append(
    h('div', { class: 'screen-head' },
      h('div', null, h('h1', null, 'This week'),
        h('p', { class: 'muted small' }, `${fmtDate(w.from, { month: 'short', day: 'numeric' })} – ${fmtDate(addDays(w.from, 6), { month: 'short', day: 'numeric' })}`))),
    h('div', { class: 'stack-lg' },
      fb ? h('div', { class: 'card stack' },
        h('h3', null, fbLeft ? 'Fallback in progress' : 'Fallback finished'),
        h('button', { class: 'btn btn-primary btn-block', onclick: showFallback }, fbLeft ? 'Open' : 'Repeat or save')) : null,
      h('div', { class: 'tiles' },
        tile('Heavy', w.heavy, GOALS.heavy),
        tile('Zone 2', w.zone2, GOALS.zone2),
        tile('HIIT', w.hiit, GOALS.hiit),
        h('div', { class: 'tile card tap' + (w.stepsToday >= stepGoal ? ' met' : ''), role: 'button', 'aria-label': 'Enter steps', onclick: () => openDailySheet() },
          h('div', { class: 'tiny faint' }, 'Steps today'),
          h('div', { class: 'num', style: { fontSize: '26px' } }, fmtNum(w.stepsToday)),
          h('div', { class: 'faint small', style: { marginTop: '6px' } }, `goal ${fmtNum(stepGoal)} · ${w.stepDays}/${w.days} days`))),
      workoutCards(now),
      watchCard(now),
      h('div', { class: 'stack', style: { gap: '8px' } },
        h('div', { class: 'spread' }, h('span', { class: 'tiny faint' }, 'Splits this week'), h('span', { class: 'faint small' }, `Fallbacks: ${w.fallback}`)),
        h('div', { class: 'splits' }, TRACKER_SPLITS.map((sp) => h('div', { class: 'split-cell' + (w.splits.includes(sp) ? ' done' : '') },
          w.splits.includes(sp) ? '✓ ' : '', label(SPLITS, sp).replace(' / ', '/'))))),
      wk ? h('p', { class: 'small muted' }, `${plan.name}: week ${wk.index + 1} of ${wk.total} — ${wk.week.focus}`) : null,
      h('div', { class: 'stack' },
        h('button', { class: 'btn btn-primary btn-big', onclick: openStartSheet }, icon('play'), 'Begin next session'),
        h('div', { class: 'grid-2' },
          h('button', { class: 'btn', style: { minHeight: '64px' }, onclick: startFallback }, icon('bolt'), '6-minute fallback'),
          h('button', { class: 'btn', style: { minHeight: '64px' }, onclick: () => openDailySheet() }, 'Steps & sleep'))),
      nudge ? h('div', { class: 'card stack' },
        h('p', null, last ? `Last backup was ${Math.floor((now - last) / 86400000)} days ago.` : 'You haven’t made a backup in the new app yet.'),
        h('button', { class: 'btn btn-block', onclick: exportBackup }, icon('download'), 'Back up now')) : null,
      recent.length ? h('div', { class: 'stack', style: { gap: '8px' } },
        h('span', { class: 'tiny faint' }, 'Recent'),
        ...recent.map((s) => {
          const c = creditFor(s);
          return h('div', { class: 'list-row', role: 'button', onclick: () => openSessionDetail(s.id) },
            h('div', { class: 'grow' }, h('h3', null, sessionTitle(s)), h('p', { class: 'muted small' }, fmtDate(s.startedAt))),
            h('div', { class: 'row-wrap', style: { justifyContent: 'flex-end' } },
              [c.heavy && 'Heavy', c.zone2 && 'Z2', c.hiit && 'HIIT'].filter(Boolean).map((b) => h('span', { class: 'badge good' }, b))));
        })) : null));
}
