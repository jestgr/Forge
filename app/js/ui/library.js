// Exercise library: browse / search / filter, add / edit / delete.
// The same browser doubles as the picker for Switch and +ADD in a session.
import { h, icon, openSheet, sheetHead, toast, confirmSheet, videoButton } from './dom.js';
import * as store from '../store.js';
import { CATEGORIES, SPLITS, EQUIPMENT, FIELDS, label } from '../core/model.js';
import { builtinExercises } from '../core/migrate.js';
import { fmtClock, uid, pos } from '../core/util.js';

/** @typedef {import('../core/model.js').Exercise} Exercise */

/** "3 × 10 · rest 1:00" / "2 × 1:00" */
export function targetText(t = {}) {
  const parts = [];
  const work = t.durationSec ? fmtClock(t.durationSec) : t.reps ? String(t.reps) : '';
  if (t.sets && work) parts.push(`${t.sets} × ${work}`);
  else if (t.sets) parts.push(`${t.sets} sets`);
  else if (work) parts.push(work);
  if (t.restSec) parts.push(`rest ${fmtClock(t.restSec)}`);
  return parts.join(' · ');
}

const short = (list, vals) => vals.map((v) => label(list, v)).join(', ');

/** Chip group that re-renders itself. */
function chipGroup(options, get, toggle, { multi = true, cls = 'chip' } = {}) {
  const el = h('div', { class: 'row-wrap' });
  const draw = () => el.replaceChildren(...options.map(([value, text]) => h('button', {
    type: 'button', class: cls, 'aria-pressed': String(multi ? get().includes(value) : get() === value),
    onclick: () => { toggle(value); draw(); },
  }, text)));
  draw();
  return el;
}

/**
 * Searchable, filterable exercise list.
 * @param {{ filters?: { q?: string, category?: string, split?: string, equipment?: string, hidden?: boolean },
 *   onTap: (ex: Exercise) => void, action?: string, showHiddenToggle?: boolean }} o
 */
export function exerciseBrowser(o) {
  // Filters live on the passed object, so they survive a screen refresh.
  const f = o.filters || {};
  for (const [k, v] of Object.entries({ q: '', category: 'all', split: 'all', equipment: 'all', hidden: false })) if (f[k] === undefined) f[k] = v;
  const results = h('div', { class: 'stack' });
  const count = h('span', { class: 'faint small' });

  const matches = (ex) => {
    if (!!ex.deleted !== f.hidden) return false;
    if (f.category !== 'all' && !ex.categories.includes(f.category)) return false;
    if (f.split !== 'all') {
      const ok = ex.splits.length === 0 || ex.splits.includes(f.split) ||
        (ex.splits.includes('upper') && (f.split === 'chest-shoulders' || f.split === 'back-biceps'));
      if (!ok) return false;
    }
    if (f.equipment !== 'all' && !ex.equipment.includes(f.equipment)) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      if (!ex.name.toLowerCase().includes(q) && !(ex.notes || '').toLowerCase().includes(q)) return false;
    }
    return true;
  };

  const update = () => {
    const list = store.state.exercises.filter(matches).sort((a, b) => a.name.localeCompare(b.name));
    count.textContent = `${list.length} exercise${list.length === 1 ? '' : 's'}`;
    results.replaceChildren(...(list.length ? list.map((ex) => h('div', {
      class: 'list-row', role: 'button', tabindex: 0, onclick: () => o.onTap(ex),
    },
    h('div', { class: 'grow' },
      h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
        h('h3', null, ex.name),
        ex.builtIn ? (ex.modified ? h('span', { class: 'badge' }, 'edited') : null) : h('span', { class: 'badge accent' }, 'mine')),
      h('p', { class: 'muted small' }, [short(CATEGORIES, ex.categories), ex.splits.length ? short(SPLITS, ex.splits) : 'any split'].join(' · ')),
      targetText(ex.targets) ? h('p', { class: 'target small' }, targetText(ex.targets)) : null),
    videoButton(ex.videoUrl, ex.name),
    o.action ? h('span', { class: 'btn btn-sm' }, o.action) : null)) : [h('p', { class: 'empty' }, 'No exercises match. Clear a filter or the search.')]));
  };

  const filterRow = (title, opts, key) => h('div', { class: 'stack', style: { gap: '6px' } },
    h('span', { class: 'tiny faint' }, title),
    chipGroup([['all', 'All'], ...opts], () => f[key], (v) => { f[key] = v; update(); }, { multi: false }));

  const search = h('input', {
    class: 'input', type: 'search', placeholder: 'Search exercises', value: f.q, 'aria-label': 'Search exercises',
    oninput: (e) => { f.q = e.target.value; update(); },
  });

  const el = h('div', { class: 'stack' },
    h('div', { class: 'search' }, search),
    filterRow('Category', CATEGORIES, 'category'),
    filterRow('Split', SPLITS, 'split'),
    filterRow('Equipment', EQUIPMENT, 'equipment'),
    h('div', { class: 'spread' }, count,
      o.showHiddenToggle ? h('button', { class: 'btn btn-ghost btn-sm', onclick: (e) => {
        f.hidden = !f.hidden; e.currentTarget.textContent = f.hidden ? 'Show library' : 'Show hidden'; update();
      } }, f.hidden ? 'Show library' : 'Show hidden') : null),
    results);
  update();
  return el;
}

/**
 * Picker for a session: opens filtered, filters can be cleared, any exercise can be chosen.
 * @param {{ title: string, category?: string, split?: string, equipment?: string, onPick: (ex: Exercise) => void, action?: string }} o
 */
export function openPicker(o) {
  openSheet((close) => [
    sheetHead(o.title, close),
    exerciseBrowser({
      filters: { category: o.category || 'all', split: o.split || 'all', equipment: o.equipment || 'all' },
      action: o.action || 'Pick',
      onTap: (ex) => { close(); o.onPick(ex); },
    }),
  ], { full: true, label: o.title });
}

// ---------- edit ----------
/** @param {Exercise|null} ex */
export function editExercise(ex) {
  /** @type {Exercise} */
  const d = ex ? structuredClone(ex) : {
    id: uid('custom_'), name: '', categories: ['resistance'], splits: [], equipment: EQUIPMENT.map((e) => e[0]),
    tracking: ['weight', 'reps'], targets: { sets: 3, reps: 10, restSec: 60, durationSec: null }, notes: '', videoUrl: '', builtIn: false,
  };
  const toggle = (arr, v) => { const i = arr.indexOf(v); if (i === -1) arr.push(v); else arr.splice(i, 1); };
  const num = (label2, key, attrs = {}) => h('label', { class: 'field' }, h('span', null, label2),
    h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 0, value: d.targets[key] ?? '', ...attrs,
      oninput: (e) => { d.targets[key] = pos(e.target.value) ?? null; } }));

  openSheet((close) => h('div', { class: 'stack' },
    sheetHead(ex ? 'Edit exercise' : 'New exercise', close),
    ex ? videoButton(ex.videoUrl, ex.name, 'btn btn-block') : null,
    h('label', { class: 'field' }, h('span', null, 'Name'),
      h('input', { class: 'input', value: d.name, placeholder: 'e.g. Cable hammer curl', oninput: (e) => { d.name = e.target.value; } })),
    h('span', { class: 'tiny faint' }, 'Category'),
    chipGroup(CATEGORIES, () => d.categories, (v) => toggle(d.categories, v)),
    h('span', { class: 'tiny faint' }, 'Split (none = any split; Upper = both upper-body days)'),
    chipGroup(SPLITS, () => d.splits, (v) => toggle(d.splits, v)),
    h('span', { class: 'tiny faint' }, 'Equipment mode'),
    chipGroup(EQUIPMENT, () => d.equipment, (v) => toggle(d.equipment, v)),
    h('span', { class: 'tiny faint' }, 'Log per set'),
    chipGroup(FIELDS.map((x) => [x[0], x[1]]), () => d.tracking, (v) => toggle(d.tracking, v)),
    h('div', { class: 'grid-2' },
      num('Target sets', 'sets'),
      h('label', { class: 'field' }, h('span', null, 'Target reps'),
        h('input', { class: 'input', value: d.targets.reps ?? '', placeholder: '10 or 8-12',
          oninput: (e) => { const v = e.target.value.trim(); d.targets.reps = /^\d+$/.test(v) ? Number(v) : (v || null); } })),
      num('Rest (seconds)', 'restSec', { step: 15 }),
      num('Duration (seconds)', 'durationSec', { step: 15 })),
    h('label', { class: 'field' }, h('span', null, 'Notes / form cues'),
      h('textarea', { class: 'input', oninput: (e) => { d.notes = e.target.value; } }, d.notes || '')),
    h('label', { class: 'field' }, h('span', null, 'Demo video link'),
      h('input', { class: 'input', type: 'url', inputmode: 'url', value: d.videoUrl || '', placeholder: 'https://…', oninput: (e) => { d.videoUrl = e.target.value.trim(); } })),
    h('button', { class: 'btn btn-primary btn-big', onclick: async () => {
      d.name = d.name.trim();
      if (!d.name) { toast('Give it a name'); return; }
      if (!d.categories.length) { toast('Pick at least one category'); return; }
      if (!d.equipment.length) { toast('Pick at least one equipment mode'); return; }
      if (!d.tracking.length) d.tracking = ['reps'];
      d.categories = CATEGORIES.map((c) => c[0]).filter((c) => d.categories.includes(c));
      d.splits = SPLITS.map((c) => c[0]).filter((c) => d.splits.includes(c));
      d.equipment = EQUIPMENT.map((c) => c[0]).filter((c) => d.equipment.includes(c));
      d.tracking = FIELDS.map((c) => c[0]).filter((c) => d.tracking.includes(c));
      if (d.builtIn) d.modified = true;
      close();
      await store.saveExercise(d);
      toast('Saved');
    } }, 'Save'),
    ex ? exerciseExtraActions(ex, close) : null));
}

function exerciseExtraActions(ex, close) {
  const original = ex.builtIn ? builtinExercises().find((b) => b.id === ex.id) : null;
  return h('div', { class: 'stack' },
    ex.builtIn && ex.modified && original ? h('button', { class: 'btn btn-block', onclick: async () => {
      if (await confirmSheet('Undo your edits?', `${ex.name} goes back to the built-in settings.`, { ok: 'Revert' })) {
        close(); await store.saveExercise({ ...original, deleted: ex.deleted }); toast('Reverted');
      }
    } }, 'Revert to built-in') : null,
    ex.deleted
      ? h('button', { class: 'btn btn-block', onclick: async () => { close(); await store.saveExercise({ ...ex, deleted: false }); toast('Back in the library'); } }, 'Unhide')
      : h('button', { class: 'btn btn-danger btn-block', onclick: async () => {
        const msg = ex.builtIn ? 'Built-in exercises are hidden, not erased. You can unhide them later.' : 'Your past sessions keep their records.';
        if (await confirmSheet(`Delete ${ex.name}?`, msg, { ok: ex.builtIn ? 'Hide' : 'Delete', danger: true })) {
          close(); await store.deleteExercise(ex.id); toast(ex.builtIn ? 'Hidden' : 'Deleted');
        }
      } }, icon('trash'), ex.builtIn ? 'Hide' : 'Delete'));
}

// ---------- screen ----------
const screenFilters = {};

export function render(root) {
  root.append(
    h('div', { class: 'screen-head' },
      h('h1', null, 'Library'),
      h('button', { class: 'btn btn-primary', onclick: () => editExercise(null) }, icon('plus'), 'New')),
    exerciseBrowser({ filters: screenFilters, onTap: (ex) => editExercise(ex), showHiddenToggle: true }));
}
