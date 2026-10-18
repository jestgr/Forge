// History: simple month calendar + session list; session detail with
// "what it counts as" (automatic, or changed by hand) and delete.
import { h, icon, openSheet, sheetHead, toast, confirmSheet } from './dom.js';
import * as store from '../store.js';
import { CATEGORIES, EQUIPMENT, SPLITS, label } from '../core/model.js';
import { computeCredit, creditFor } from '../core/goals.js';
import { summarizeSets } from '../core/progress.js';
import { dateKey, fmtDate, fmtMinutes, fmtNum } from '../core/util.js';
import { totals } from '../core/clock.js';
import { openDailySheet } from './dashboard.js';
import { FIELDS, stepsOf, sleepHoursOf } from '../core/metrics.js';

/** @typedef {import('../core/model.js').Session} Session */
const { state } = store;

export function sessionTitle(s) {
  if (s.kind === 'fallback') return '6-minute fallback';
  const base = s.split ? label(SPLITS, s.split) : (s.name || 'Workout');
  return s.includeCardio && s.split !== 'pure-cardio' ? `${base} + cardio` : base;
}

const minutes = (s) => (s.endedAt && s.startedAt ? (s.endedAt - s.startedAt - (s.pausedMs || 0)) / 60000 : 0);

function badges(s) {
  if (s.kind === 'fallback') return [h('span', { class: 'badge' }, 'Fallback')];
  const c = creditFor(s);
  return [c.heavy && 'Heavy', c.zone2 && 'Zone 2', c.hiit && 'HIIT', c.split && `${label(SPLITS, c.split)} ✓`]
    .filter(Boolean).map((b) => h('span', { class: 'badge good' }, b));
}

// ---------- session detail ----------
export function openSessionDetail(id) {
  openSheet((close) => {
    const s = state.sessions.find((x) => x.id === id);
    if (!s) return h('p', { class: 'empty' }, 'Session deleted.');
    const t = s.clockStartedAt ? totals(s, s.endedAt || Date.now()) : null;
    const auto = computeCredit(s);
    const cur = creditFor(s);
    const toggle = (k) => async () => {
      const o = { ...(s.creditOverride || {}) };
      o[k] = !cur[k];
      if (o[k] === auto[k]) delete o[k];
      await store.saveSession({ ...s, creditOverride: Object.keys(o).length ? o : null });
    };
    return h('div', { class: 'stack' },
      sheetHead(sessionTitle(s), close),
      h('p', { class: 'muted' }, `${fmtDate(s.startedAt, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${new Date(s.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`),
      h('p', null, [minutes(s) ? fmtMinutes(minutes(s)) : '', t && t.workSec ? `work ${fmtMinutes(t.workSec / 60)} · rest ${fmtMinutes(t.restSec / 60)}` : '',
        s.equipment ? label(EQUIPMENT, s.equipment) : ''].filter(Boolean).join(' · ')),
      s.legacy?.endTimeFixed ? h('p', { class: 'faint small' }, 'End time repaired (the old app was left running).') : null,
      s.kind !== 'fallback' ? h('div', { class: 'card stack' },
        h('span', { class: 'tiny faint' }, s.creditOverride ? 'Counts as (changed by hand)' : 'Counts as (automatic)'),
        h('div', { class: 'grid-3' }, [['heavy', 'Heavy'], ['zone2', 'Zone 2'], ['hiit', 'HIIT']].map(([k, text]) =>
          h('button', { class: 'chip', 'aria-pressed': String(!!cur[k]), onclick: toggle(k) }, text))),
        cur.split ? h('p', { class: 'small muted' }, `Split tracker: ${label(SPLITS, cur.split)}`) : null,
        s.creditOverride ? h('button', { class: 'btn btn-sm', onclick: async () => { await store.saveSession({ ...s, creditOverride: null }); } }, 'Back to automatic') : null) : null,
      ...s.sections.filter((sec) => sec.items.length).map((sec) => h('div', { class: 'stack', style: { gap: '6px' } },
        h('span', { class: 'tiny faint' }, label(CATEGORIES, sec.category)),
        ...sec.items.map((it) => h('div', { class: 'spread small' },
          h('span', null, it.name, it.protocol ? h('span', { class: 'badge' + (it.protocol.completedAt ? ' good' : ''), style: { marginLeft: '6px' } },
            it.protocol.completedAt ? '4×4 ✓' : `4×4 ${it.protocol.hardDone}/4`) : null),
          h('span', { class: 'mono', style: { textAlign: 'right' } }, summarizeSets(it.sets)))))),
      h('button', { class: 'btn btn-danger btn-block', onclick: async () => {
        if (await confirmSheet('Delete this session?', 'It is removed from history and weekly goals.', { ok: 'Delete', danger: true })) {
          close(); await store.deleteSession(s.id); toast('Session deleted');
        }
      } }, icon('trash'), 'Delete session'));
  }, { label: 'Session' });
}

// ---------- day sheet ----------
function openDay(date) {
  openSheet((close) => {
    const list = state.sessions.filter((s) => s.status === 'done' && dateKey(s.startedAt) === date);
    const d = state.daily[date];
    return h('div', { class: 'stack' },
      sheetHead(fmtDate(new Date(date + 'T12:00').getTime(), { weekday: 'long', month: 'long', day: 'numeric' }), close),
      h('p', { class: 'muted' }, [stepsOf(d) ? `${fmtNum(Math.round(stepsOf(d)))} steps` : 'No steps', sleepHoursOf(d) ? `${sleepHoursOf(d)} h sleep` : '', d?.heartPoints ? `${d.heartPoints} heart points` : ''].filter(Boolean).join(' · ')),
      d?.watch ? h('div', { class: 'card stack', style: { gap: '6px' } },
        h('span', { class: 'tiny faint' }, 'From your watch'),
        ...FIELDS.filter((f) => d.watch[f.key] != null).map((f) => h('div', { class: 'spread small' }, h('span', null, f.label), h('span', { class: 'mono' }, f.show(d.watch[f.key]))))) : null,
      list.length ? list.map((s) => sessionRow(s, () => { close(); openSessionDetail(s.id); })) : h('p', { class: 'muted' }, 'No sessions.'),
      h('button', { class: 'btn btn-block', onclick: () => { close(); openDailySheet(date); } }, 'Edit steps & sleep'));
  }, { label: 'Day' });
}

function sessionRow(s, onclick) {
  return h('div', { class: 'list-row', role: 'button', onclick },
    h('div', { class: 'grow' },
      h('h3', null, sessionTitle(s)),
      h('p', { class: 'muted small' }, `${fmtDate(s.startedAt)}${minutes(s) ? ` · ${fmtMinutes(minutes(s))}` : ''}`)),
    h('div', { class: 'row-wrap', style: { justifyContent: 'flex-end', maxWidth: '45%' } }, badges(s)));
}

// ---------- screen ----------
let month = null; // first day of the shown month (ms)
let shown = 30;

function calendar() {
  const now = new Date();
  if (month === null) month = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const m = new Date(month);
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const byDay = {};
  for (const s of state.sessions) if (s.status === 'done') (byDay[dateKey(s.startedAt)] ||= []).push(s);
  const todayKey = dateKey(now);
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(h('div', { class: 'day pad' }));
  for (let d = 1; d <= days; d++) {
    const key = dateKey(new Date(m.getFullYear(), m.getMonth(), d));
    const list = byDay[key] || [];
    cells.push(h('button', { class: 'day' + (key === todayKey ? ' today' : ''), onclick: () => openDay(key), 'aria-label': key },
      String(d),
      h('span', { class: 'dots' }, list.slice(0, 3).map((s) => h('span', { class: 'd' + (s.kind === 'fallback' ? ' fb' : '') })))));
  }
  const go = (n) => { const x = new Date(month); month = new Date(x.getFullYear(), x.getMonth() + n, 1).getTime(); store.emit(); };
  return h('div', { class: 'card stack' },
    h('div', { class: 'spread' },
      h('button', { class: 'icon-btn sm', 'aria-label': 'Previous month', onclick: () => go(-1) }, icon('back')),
      h('h3', null, m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
      h('button', { class: 'icon-btn sm', 'aria-label': 'Next month', onclick: () => go(1), style: { transform: 'scaleX(-1)' } }, icon('back'))),
    h('div', { class: 'cal' }, ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => h('div', { class: 'dow' }, x)), cells));
}

export function render(root) {
  const done = state.sessions.filter((s) => s.status === 'done');
  root.append(
    h('div', { class: 'screen-head' }, h('h1', null, 'History'), h('span', { class: 'faint small' }, `${done.length} sessions`)),
    h('div', { class: 'stack-lg' },
      calendar(),
      h('div', { class: 'stack', style: { gap: '8px' } },
        done.length ? done.slice(0, shown).map((s) => sessionRow(s, () => openSessionDetail(s.id))) : h('p', { class: 'empty' }, 'No sessions yet.'),
        done.length > shown ? h('button', { class: 'btn btn-block', onclick: () => { shown += 30; store.emit(); } }, 'Show more') : null)));
}

