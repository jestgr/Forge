// Active session: start sheet, sections with +ADD / Switch / Remove / Re-roll,
// set logging, exercise sheet (last 10 + suggestion), finish / discard.
import { h, icon, openSheet, sheetHead, toast, confirmSheet } from './dom.js';
import * as store from '../store.js';
import * as clock from '../core/clock.js';
import { CATEGORIES, EQUIPMENT, FIELDS, SESSION_SPLITS, SPLITS, TRACKER_SPLITS, SECTION_WINDOWS, fieldKey, label } from '../core/model.js';
import { generate, fillSection, makeItem, lastDone, sectionMinutes, effectiveTargets, estimateSec } from '../core/generator.js';
import { exerciseHistory, suggest, summarizeSets } from '../core/progress.js';
import { computeCredit, weekSummary } from '../core/goals.js';
import { planWeek } from '../core/plans.js';
import { fmtClock, fmtDate, fmtMinutes, repsNumber, uid, rng } from '../core/util.js';
import { openPicker, editExercise, targetText } from './library.js';

/** @typedef {import('../core/model.js').Session} Session */
/** @typedef {import('../core/model.js').SessionItem} SessionItem */

const { state } = store;
const now = () => Date.now();

/** Save a changed copy of the active session. @param {(s: Session) => Session|void} fn */
export async function update(fn) {
  const cur = store.activeSession();
  if (!cur) return;
  const copy = structuredClone(cur);
  const next = fn(copy) || copy;
  await store.saveSession(next);
}

const findItem = (s, itemId) => {
  for (const sec of s.sections) {
    const i = sec.items.findIndex((x) => x.id === itemId);
    if (i !== -1) return { sec, i, item: sec.items[i] };
  }
  return null;
};

// ---------- start ----------
function suggestedSplit() {
  const w = weekSummary(state.sessions, state.daily, now());
  return TRACKER_SPLITS.find((sp) => !w.splits.includes(sp)) || state.settings.lastSplit || 'lower';
}

export function openStartSheet() {
  const sel = {
    split: suggestedSplit(),
    cardio: state.settings.lastCardio ?? false,
    equipment: state.settings.lastEquipment || 'full-gym',
  };
  const choice = (opts, key, cols = 'grid-2') => h('div', { class: cols }, opts.map(([v, text]) => h('button', {
    type: 'button', class: 'choice', 'aria-pressed': String(sel[key] === v),
    onclick: (e) => { sel[key] = v; for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === e.currentTarget)); },
  }, text)));
  openSheet((close) => h('div', { class: 'stack' },
    sheetHead('Next session', close),
    h('span', { class: 'tiny faint' }, 'Split'),
    choice(SESSION_SPLITS.map((s) => [s, label(SPLITS, s)]), 'split'),
    h('span', { class: 'tiny faint' }, 'Include cardio'),
    choice([[true, 'Yes'], [false, 'No']], 'cardio'),
    h('span', { class: 'tiny faint' }, 'Equipment'),
    choice(EQUIPMENT, 'equipment'),
    h('button', { class: 'btn btn-primary btn-big', onclick: async () => { close(); await startSession(sel); } }, 'Build workout')),
  { label: 'Next session' });
}

async function startSession(sel) {
  const plan = state.plans.find((p) => p.id === state.settings.plan?.id);
  const wk = plan ? planWeek(plan, state.settings.plan.startDate, now()) : null;
  const t = now();
  /** @type {Session} */
  const s = {
    id: uid('s_'), kind: 'workout', split: sel.split, includeCardio: sel.cardio || sel.split === 'pure-cardio', equipment: sel.equipment,
    startedAt: t, endedAt: null, pausedMs: 0, pausedAt: null, clockStartedAt: null, workSince: null, workMs: 0, restMs: 0, rest: null,
    status: 'active', source: 'forge', planWeek: wk ? wk.index + 1 : null,
    sections: /** @type {any} */ (generate({ exercises: state.exercises, sessions: state.sessions, split: sel.split, includeCardio: sel.cardio,
      equipment: sel.equipment, now: t, planCardio: wk?.week.cardio })),
  };
  await store.setSetting('lastSplit', sel.split);
  await store.setSetting('lastCardio', sel.cardio);
  await store.setSetting('lastEquipment', sel.equipment);
  await store.saveSession(s);
  location.hash = '#/';
}

// ---------- item actions ----------
function addTo(category) {
  const s = store.activeSession();
  openPicker({
    title: `Add ${label(CATEGORIES, category).toLowerCase()}`, category,
    split: category === 'resistance' && s.split !== 'pure-cardio' ? s.split : 'all', equipment: s.equipment || 'all', action: 'Add',
    onPick: (ex) => update((x) => { x.sections.find((sec) => sec.category === category).items.push(makeItem(ex, category, SECTION_WINDOWS[category].max * 60)); }),
  });
}

async function switchItem(itemId, category) {
  const s = store.activeSession();
  const it = findItem(s, itemId)?.item;
  if (it?.sets.length && !(await confirmSheet('Switch exercise?', `The ${it.sets.length} set(s) logged for ${it.name} will be dropped.`, { ok: 'Switch', danger: true }))) return;
  openPicker({
    title: `Switch ${it?.name || ''}`, category,
    split: category === 'resistance' && s.split !== 'pure-cardio' ? s.split : 'all', equipment: s.equipment || 'all', action: 'Use',
    onPick: (ex) => update((x) => { const f = findItem(x, itemId); if (f) f.sec.items[f.i] = makeItem(ex, category, SECTION_WINDOWS[category].max * 60); }),
  });
}

async function removeItem(itemId) {
  const it = findItem(store.activeSession(), itemId)?.item;
  if (it?.sets.length && !(await confirmSheet(`Remove ${it.name}?`, `Its ${it.sets.length} logged set(s) go too.`, { ok: 'Remove', danger: true }))) return;
  await update((x) => { const f = findItem(x, itemId); if (f) f.sec.items.splice(f.i, 1); });
}

async function reroll() {
  await update((x) => {
    const sec = x.sections.find((y) => y.category === 'resistance');
    const kept = sec.items.filter((i) => i.sets.length);
    const fresh = fillSection({
      category: 'resistance', exercises: state.exercises, split: x.split, equipment: x.equipment || 'full-gym',
      last: lastDone(state.sessions), now: now(), random: rng(now()), exclude: new Set(sec.items.map((i) => i.exerciseId)),
    });
    const max = SECTION_WINDOWS.resistance.max * 60;
    let total = kept.reduce((t, i) => t + estimateSec(i.targets, 'resistance'), 0);
    sec.items = [...kept];
    for (const it of fresh) {
      const e = estimateSec(it.targets, 'resistance');
      if (total + e > max) break;
      sec.items.push(it);
      total += e;
    }
  });
  toast('New resistance picks');
}

// ---------- logging ----------
const STEP = { weight: 5, reps: 1, time: 15, distance: 0.1, speed: 0.1, incline: 0.5, hr: 1, rpe: 0.5 };

/** Fields to log for an item (from the library exercise, else what the item recorded). */
function fieldsFor(item) {
  const ex = store.exerciseById(item.exerciseId);
  const f = ex?.tracking?.length ? ex.tracking : item.tracking?.length ? item.tracking : ['weight', 'reps'];
  return FIELDS.map((x) => x[0]).filter((x) => f.includes(x));
}

function prefill(item, category, sessionId) {
  const fields = fieldsFor(item);
  const lastHere = item.sets[item.sets.length - 1];
  const hist = exerciseHistory(item.exerciseId, state.sessions, 10, sessionId);
  const prev = hist[0]?.sets[item.sets.length] || hist[0]?.sets[hist[0].sets.length - 1];
  const t = effectiveTargets(item.targets, category);
  const tip = !lastHere ? suggest(hist, item.targets, category) : null;
  const v = {};
  for (const f of fields) {
    const k = fieldKey(f);
    v[f] = lastHere?.[k] ?? prev?.[k] ?? (f === 'reps' ? repsNumber(t.reps) : f === 'time' ? t.durationSec : null) ?? '';
  }
  if (tip?.weight && fields.includes('weight')) v.weight = tip.weight;
  return v;
}

function stepper(f, values) {
  const input = h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: 'any', value: values[f] ?? '', 'aria-label': label(FIELDS.map((x) => [x[0], x[1]]), f),
    oninput: (e) => { values[f] = e.target.value; hint(); } });
  const hintEl = h('span', { class: 'faint small' });
  const hint = () => { hintEl.textContent = f === 'time' && Number(values[f]) > 0 ? fmtClock(Number(values[f])) : ''; };
  hint();
  const bump = (d) => {
    const n = Math.max(0, Math.round(((Number(values[f]) || 0) + d) * 100) / 100);
    values[f] = n; /** @type {HTMLInputElement} */ (input).value = String(n); hint();
  };
  const [, name, unit] = FIELDS.find((x) => x[0] === f);
  return h('div', { class: 'stack', style: { gap: '6px' } },
    h('div', { class: 'spread' }, h('span', { class: 'tiny faint' }, `${name}${unit ? ` (${unit})` : ''}`), hintEl),
    h('div', { class: 'stepper' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Less ${name}`, onclick: () => bump(-STEP[f]) }, '−'),
      input,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `More ${name}`, onclick: () => bump(STEP[f]) }, '+')));
}

/** Log a new set, or edit / delete set number `setIndex`. */
function openLogSheet(itemId, category, setIndex = null) {
  const s = store.activeSession();
  const item = findItem(s, itemId)?.item;
  if (!item) return;
  const editing = setIndex !== null;
  const fields = fieldsFor(item);
  const values = editing
    ? Object.fromEntries(fields.map((f) => [f, item.sets[setIndex][fieldKey(f)] ?? '']))
    : prefill(item, category, s.id);
  const tip = !editing && !item.sets.length ? suggest(exerciseHistory(item.exerciseId, state.sessions, 10, s.id), item.targets, category) : null;

  openSheet((close) => h('div', { class: 'stack' },
    sheetHead(editing ? `Set ${setIndex + 1}` : `Set ${item.sets.length + 1}`, close),
    h('p', null, h('strong', null, item.name), ' ', h('span', { class: 'target' }, targetText(effectiveTargets(item.targets, category)))),
    tip ? h('p', { class: 'small muted' }, tip.text) : null,
    ...fields.map((f) => stepper(f, values)),
    h('button', { class: 'btn btn-primary btn-big', onclick: async () => {
      const set = { at: editing ? item.sets[setIndex].at : now() };
      for (const f of fields) { const n = parseFloat(values[f]); if (isFinite(n) && n > 0) set[fieldKey(f)] = n; }
      if (Object.keys(set).length === 1) { toast('Enter at least one value'); return; }
      close();
      await update((x) => {
        const it = findItem(x, itemId)?.item;
        if (!it) return x;
        if (editing) { it.sets[setIndex] = set; return x; }
        it.sets.push(set);
        let y = x.clockStartedAt == null ? clock.start(x, set.at) : clock.resume(x, set.at);
        return clock.afterSet(y, set.at, category === 'cardio' ? 0 : effectiveTargets(it.targets, category).restSec || 0);
      });
    } }, editing ? 'Update set' : 'Save set'),
    editing ? h('button', { class: 'btn btn-danger btn-block', onclick: async () => {
      close();
      await update((x) => { findItem(x, itemId)?.item.sets.splice(setIndex, 1); });
    } }, icon('trash'), 'Delete set') : null),
  { label: 'Log set' });
}

// ---------- exercise sheet ----------
function openExerciseSheet(itemId, category) {
  openSheet((close) => {
    const s = store.activeSession();
    const item = s && findItem(s, itemId)?.item;
    if (!item) return h('p', { class: 'empty' }, 'This exercise is no longer in the session.');
    const ex = store.exerciseById(item.exerciseId);
    const hist = exerciseHistory(item.exerciseId, state.sessions, 10, s.id);
    const tip = suggest(hist, item.targets, category);
    return h('div', { class: 'stack' },
      sheetHead(item.name, close),
      h('p', { class: 'target' }, `Target: ${targetText(effectiveTargets(item.targets, category)) || '—'}`),
      h('div', { class: 'card stack' }, h('span', { class: 'tiny faint' }, 'Suggestion'), h('p', null, tip.text)),
      ex?.notes ? h('p', { class: 'muted' }, ex.notes) : null,
      ex?.videoUrl ? h('a', { class: 'btn btn-block', href: ex.videoUrl, target: '_blank', rel: 'noopener' }, icon('video'), 'Watch demo') : null,
      h('h3', null, hist.length ? `Last ${hist.length} time${hist.length > 1 ? 's' : ''}` : 'No history yet'),
      hist.length ? h('div', { class: 'stack', style: { gap: '6px' } }, hist.map((x) => h('div', { class: 'spread small' },
        h('span', { class: 'muted' }, fmtDate(x.at, { month: 'short', day: 'numeric', year: '2-digit' })),
        h('span', { class: 'mono', style: { textAlign: 'right' } }, x.text)))) : null,
      ex ? h('button', { class: 'btn btn-block', onclick: () => { close(); editExercise(ex); } }, icon('edit'), 'Edit in library') : null);
  }, { label: 'Exercise' });
}

// ---------- finish / discard ----------
export function openFinishSheet() {
  const s = store.activeSession();
  if (!s) return;
  const sets = s.sections.reduce((n, x) => n + x.items.reduce((m, i) => m + i.sets.length, 0), 0);
  const t = clock.totals(s, now());
  const c = computeCredit(s);
  const earned = [c.heavy && 'Heavy', c.zone2 && 'Zone 2', c.hiit && 'HIIT', c.split && `${label(SPLITS, c.split)} ✓`].filter(Boolean);
  openSheet((close) => h('div', { class: 'stack' },
    sheetHead('Finish session', close),
    h('div', { class: 'grid-3' },
      stat(fmtClock(t.totalSec), 'total'), stat(fmtClock(t.workSec), 'work'), stat(fmtClock(t.restSec), 'rest')),
    h('p', null, `${sets} sets logged.`),
    h('div', { class: 'row-wrap' }, earned.length ? earned.map((e) => h('span', { class: 'badge good' }, e)) : h('span', { class: 'muted small' }, 'Counts toward no weekly goal yet.')),
    h('p', { class: 'faint small' }, 'Exercises without logged sets are left out of history.'),
    sets ? h('button', { class: 'btn btn-primary btn-big', onclick: async () => { close(); await finish(); } }, icon('check'), 'Save session') : null,
    h('button', { class: 'btn btn-danger btn-block', onclick: async () => {
      if (await confirmSheet('Discard this session?', 'Nothing from it will be saved.', { ok: 'Discard', danger: true })) { close(); await store.deleteSession(s.id); location.hash = '#/'; toast('Session discarded'); }
    } }, 'Discard session')), { label: 'Finish session' });
}

function stat(value, name) {
  return h('div', { class: 'card', style: { padding: '10px', textAlign: 'center' } }, h('div', { class: 'mono', style: { fontSize: '22px', fontWeight: 800 } }, value), h('div', { class: 'tiny faint' }, name));
}

async function finish() {
  const t = now();
  await update((x) => {
    let y = clock.closeRest(x, t);
    if (y.pausedAt != null) y = clock.resume(y, t);
    if (y.clockStartedAt == null) y = { ...y, clockStartedAt: t, startedAt: t };
    y.endedAt = t;
    y.status = 'done';
    y.rest = null;
    for (const sec of y.sections) sec.items = sec.items.filter((i) => i.sets.length || i.protocol);
    y.sections = y.sections.filter((sec) => sec.items.length);
    return y;
  });
  const done = store.state.sessions.find((x) => x.endedAt === t);
  const c = done ? computeCredit(done) : null;
  const earned = c ? [c.heavy && 'Heavy', c.zone2 && 'Zone 2', c.hiit && 'HIIT'].filter(Boolean) : [];
  location.hash = '#/';
  toast(earned.length ? `Saved — counts as ${earned.join(' + ')}` : 'Session saved');
}

// ---------- screen ----------
export function render(root) {
  const s = store.activeSession();
  if (!s) return;
  const head = h('div', { class: 'screen-head' },
    h('div', null,
      h('h1', null, s.kind === 'fallback' ? '6-minute fallback' : label(SPLITS, s.split)),
      h('p', { class: 'muted small' }, [s.includeCardio && s.split !== 'pure-cardio' ? '+ cardio' : '', s.equipment ? label(EQUIPMENT, s.equipment) : '',
        `~${fmtMinutes(s.sections.reduce((t, x) => t + sectionMinutes(x.items, x.category), 0))}`].filter(Boolean).join(' · '))),
    h('button', { class: 'btn btn-primary', onclick: openFinishSheet }, 'Finish'));
  root.append(head, ...s.sections.map((sec) => sectionView(s, sec)),
    h('button', { class: 'btn btn-primary btn-big', style: { marginTop: '16px' }, onclick: openFinishSheet }, icon('check'), 'Finish session'));
}

function sectionView(s, sec) {
  const w = SECTION_WINDOWS[sec.category];
  const mins = sectionMinutes(sec.items, sec.category);
  return h('section', { class: 'stack', style: { marginBottom: '20px' } },
    h('div', { class: 'section-title' },
      h('div', null, h('h2', null, label(CATEGORIES, sec.category)),
        h('span', { class: 'faint small' }, sec.items.length ? `~${Math.round(mins)} min · aim ${w.min}–${w.max}` : `aim ${w.min}–${w.max} min`)),
      h('div', { class: 'row', style: { gap: '8px' } },
        sec.category === 'resistance' && sec.items.length ? h('button', { class: 'btn btn-sm', onclick: reroll, 'aria-label': 'Re-roll resistance' }, icon('shuffle'), 'Re-roll') : null,
        h('button', { class: 'btn btn-sm', onclick: () => addTo(sec.category) }, icon('plus'), 'ADD'))),
    ...sec.items.map((it) => itemView(it, sec.category)));
}

function itemView(it, category) {
  const t = effectiveTargets(it.targets, category);
  const done = it.sets.length >= (t.sets || 1);
  return h('div', { class: 'ex' + (done ? ' done' : '') },
    h('div', { class: 'ex-main', role: 'button', tabindex: 0, onclick: () => openExerciseSheet(it.id, category) },
      h('div', { class: 'spread' }, h('h3', null, it.name), done ? h('span', { class: 'badge good' }, 'done') : h('span', { class: 'faint small' }, `${it.sets.length}/${t.sets || 1}`)),
      h('p', { class: 'target' }, targetText(t)),
      it.sets.length ? h('div', { class: 'set-list' }, it.sets.map((st, i) => h('button', {
        class: 'set-pill', onclick: (e) => { e.stopPropagation(); openLogSheet(it.id, category, i); },
      }, summarizeSets([st])))) : null),
    h('div', { class: 'ex-actions' },
      h('button', { class: 'btn btn-primary', style: { flex: 2 }, onclick: () => openLogSheet(it.id, category) }, icon('plus'), 'Log set'),
      h('button', { class: 'icon-btn', 'aria-label': `Switch ${it.name}`, onclick: () => switchItem(it.id, category) }, icon('swap')),
      h('button', { class: 'icon-btn', 'aria-label': `Remove ${it.name}`, onclick: () => removeItem(it.id) }, icon('x'))));
}
