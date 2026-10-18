// Settings: backup / restore, plans, defaults, about.
import { h, icon, toast, confirmSheet, openSheet, sheetHead } from './dom.js';
import * as store from '../store.js';
import { VERSION } from '../version.js';
import { dbName } from '../platform/db.js';
import { makeBackup, readBackup, backupFilename, describe } from '../core/backup.js';
import { mergeById, builtinExercises, migrateLegacy } from '../core/migrate.js';
import { planWeek, validatePlan } from '../core/plans.js';
import { download, fmtDate, dateKey, fromDateKey, weekStart } from '../core/util.js';
import { readOldState } from '../setup.js';
import { isNative } from '../platform/native.js';
import { GOALS } from '../core/model.js';
import { cue, unlockAudio } from '../platform/cues.js';
import { supported as wakeSupported } from '../platform/wakelock.js';
import * as hc from '../platform/healthconnect.js';
import { METRICS } from '../core/metrics.js';

const { state } = store;

export async function exportBackup() {
  const now = Date.now();
  try {
    await download(backupFilename(now), JSON.stringify(makeBackup(store.snapshot(), now)));
  } catch (e) {
    toast('Backup not saved: ' + (e?.message || e), 5000);
    return;
  }
  await store.setSetting('lastBackupAt', now);
  toast(isNative() ? 'Backup ready — pick where to save it' : 'Backup saved to Downloads');
}

/** Pick a file and restore it. */
function pickRestore() {
  const input = h('input', { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    const file = /** @type {HTMLInputElement} */ (input).files?.[0];
    if (!file) return;
    restoreText(await file.text(), file.name);
  });
  input.click();
}

async function restoreText(text, name) {
  const r = readBackup(text, Date.now());
  if (!r.ok) { await confirmSheet('Can’t restore', `${name}: ${r.error}`, { ok: 'OK', cancel: 'Close' }); return; }
  if (r.kind === 'legacy') {
    const yes = await confirmSheet('Add from old Forge backup?',
      `${name}: ${describe(r.data)}. Anything already here stays; nothing is duplicated.`, { ok: 'Add' });
    if (!yes) return;
    const { data, added } = mergeById(store.snapshot(), r.data);
    await store.replaceAll(data);
    toast(`Added ${added.sessions} sessions and ${added.exercises} exercises`);
    return;
  }
  openSheet((close) => h('div', { class: 'stack' },
    h('h2', null, 'Replace everything?'),
    h('p', null, `This phone will then hold exactly what’s in ${name}: ${describe(r.data)}.`),
    h('p', { class: 'muted small' }, `Now on this phone: ${describe(store.snapshot())}.`),
    h('button', { class: 'btn btn-primary btn-block', onclick: async () => { await exportBackup(); close(); await store.replaceAll(r.data); toast('Restored'); } },
      'Save a backup of this phone, then replace'),
    h('button', { class: 'btn btn-danger btn-block', onclick: async () => { close(); await store.replaceAll(r.data); toast('Restored'); } }, 'Replace without backup'),
    h('button', { class: 'btn btn-block', onclick: close }, 'Cancel')));
}

async function reimportOld() {
  const old = readOldState();
  if (!old) { toast('No old Forge data on this phone'); return; }
  const data = migrateLegacy(old, { source: 'localStorage', now: Date.now() });
  const yes = await confirmSheet('Bring over old Forge data?', `${describe(data)}. Anything already here stays; nothing is duplicated.`, { ok: 'Bring over' });
  if (!yes) return;
  const { data: merged, added } = mergeById(store.snapshot(), data);
  await store.replaceAll(merged);
  toast(`Added ${added.sessions} sessions and ${added.exercises} exercises`);
}

async function restoreDefaults() {
  const changed = state.exercises.filter((e) => e.builtIn && (e.modified || e.deleted)).length;
  if (!changed) { toast('Built-in exercises are already at their defaults'); return; }
  const yes = await confirmSheet('Reset built-in exercises?', `${changed} edited or hidden built-ins go back to their original settings. Your own exercises stay.`, { ok: 'Reset', danger: true });
  if (!yes) return;
  for (const ex of builtinExercises()) {
    const cur = store.exerciseById(ex.id);
    if (cur && (cur.modified || cur.deleted)) await store.saveExercise(ex);
  }
  toast('Built-ins reset');
}

// ---------- watch data (Health Connect) ----------
let busy = false;
async function hcAction(fn, done) {
  if (busy) return;
  busy = true;
  store.emit();
  try { toast(done(await fn()), 4000); } catch (e) { toast('Health Connect: ' + (e?.message || e), 6000); }
  busy = false;
  store.emit();
}
const readSummary = (r) => r.read.length
  ? `Read ${r.read.length} of ${METRICS.length} kinds of data for ${r.days} days`
  : 'Nothing could be read — check Forge’s access in Health Connect';

function watchCard() {
  const s = hc.settings();
  const head = h('h3', null, 'Watch data');
  if (!hc.nativeAvailable()) {
    return h('div', { class: 'card stack' }, head,
      h('p', { class: 'muted small' }, 'Steps, sleep, heart rate and more come in from Garmin through Health Connect — only in the Forge Android app. Here, enter steps and sleep by hand (Today → Steps & sleep).'));
  }
  if (!s.connected) {
    return h('div', { class: 'card stack' }, head,
      h('p', { class: 'muted small' }, 'Read what Garmin Connect saves to Health Connect: steps, sleep, calories, distance, heart rate, resting heart rate, HRV, weight, body fat and workouts. Read-only — Forge never writes there.'),
      h('button', { class: 'btn btn-primary btn-block', disabled: busy, onclick: () => hcAction(hc.connect, (r) => (r.granted ? readSummary(r) : 'No access given')) },
        busy ? 'Connecting…' : 'Connect Health Connect'),
      s.granted && !s.granted.length ? h('p', { class: 'faint small' }, 'If the permission screen doesn’t show again, give access in Health Connect settings.') : null,
      h('button', { class: 'btn btn-block', onclick: hc.openHealthConnect }, 'Health Connect settings'));
  }
  return h('div', { class: 'card stack' }, head,
    h('p', { class: 'muted small' }, s.lastSyncAt
      ? `Last read ${fmtDate(s.lastSyncAt)} ${new Date(s.lastSyncAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Reads again when you open Forge (every 15 min at most).`
      : 'Not read yet.'),
    s.lastError ? h('p', { class: 'small danger' }, s.lastError) : null,
    s.failed?.length && !s.lastError ? h('p', { class: 'faint small' }, `Not available: ${s.failed.join(', ')}`) : null,
    h('button', { class: 'btn btn-primary btn-block', disabled: busy, onclick: () => hcAction(() => hc.pull(), readSummary) }, busy ? 'Reading…' : 'Read now'),
    h('div', { class: 'grid-2' },
      h('button', { class: 'btn', disabled: busy, onclick: () => hcAction(hc.connect, (r) => (r.granted ? readSummary(r) : 'No access given')) }, 'Check access'),
      h('button', { class: 'btn', onclick: hc.openHealthConnect }, 'Health Connect')),
    h('p', { class: 'faint small' }, s.history ? 'Older history allowed.' : 'Health Connect gives the last 30 days.'),
    h('button', { class: 'btn btn-sm', onclick: hc.disconnect }, 'Stop reading'));
}

// ---------- plans ----------
function planSheet() {
  openSheet((close) => {
    const active = state.settings.plan;
    return h('div', { class: 'stack' },
      sheetHead('Training plans', close),
      ...state.plans.map((p) => {
        const on = active?.id === p.id;
        const wk = on ? planWeek(p, active.startDate, Date.now()) : null;
        return h('div', { class: 'card stack' },
          h('div', { class: 'spread' }, h('h3', null, p.name), on ? h('span', { class: 'badge accent' }, 'Active') : null),
          h('p', { class: 'muted small' }, p.description),
          on ? h('p', { class: 'small' }, wk ? `Week ${wk.index + 1} of ${wk.total}: ${wk.week.focus}` : 'Finished (or starts later).') : null,
          on ? h('label', { class: 'field' }, h('span', null, 'Started on'),
            h('input', { class: 'input', type: 'date', value: dateKey(active.startDate),
              onchange: (e) => { const v = e.target.value; if (v) store.setSetting('plan', { id: p.id, startDate: fromDateKey(v) }); } })) : null,
          h('div', { class: 'row' },
            on
              ? h('button', { class: 'btn btn-danger grow', onclick: () => store.setSetting('plan', null) }, 'Stop plan')
              : h('button', { class: 'btn btn-primary grow', onclick: () => { store.setSetting('plan', { id: p.id, startDate: weekStart(Date.now()) }); toast(`${p.name} started this week`); } }, 'Start this week'),
            p.builtIn ? null : h('button', { class: 'icon-btn', 'aria-label': 'Delete plan', onclick: async () => {
              if (await confirmSheet('Delete plan?', p.name, { ok: 'Delete', danger: true })) {
                if (on) await store.setSetting('plan', null);
                await store.deletePlan(p.id);
              }
            } }, icon('trash'))));
      }),
      h('button', { class: 'btn btn-block', onclick: importPlan }, icon('upload'), 'Import a plan file'),
      h('p', { class: 'faint small' }, 'Plan file format: {"id": "my_plan", "name": "…", "description": "…", "weeks": [{"focus": "…", "cardio": ["card_v3"]}, …]}. An active plan puts that week’s cardio first when you start a session.'));
  }, { label: 'Training plans' });
}

function importPlan() {
  const input = h('input', { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    const file = /** @type {HTMLInputElement} */ (input).files?.[0];
    if (!file) return;
    let json;
    try { json = JSON.parse(await file.text()); } catch { toast('Not a JSON file'); return; }
    const r = validatePlan(json);
    if (!r.ok) { toast(r.error, 4000); return; }
    if (state.plans.some((p) => p.id === r.plan.id && p.builtIn)) { toast('That id belongs to a built-in plan'); return; }
    await store.savePlan(r.plan);
    toast(`Plan “${r.plan.name}” added`);
  });
  input.click();
}

// ---------- screen ----------
export function render(root) {
  const last = state.settings.lastBackupAt;
  const plan = state.plans.find((p) => p.id === state.settings.plan?.id);
  const wk = plan ? planWeek(plan, state.settings.plan.startDate, Date.now()) : null;
  const stepGoal = state.settings.stepGoal || GOALS.stepsPerDay;
  root.append(
    h('div', { class: 'screen-head' }, h('h1', null, 'Settings')),
    h('div', { class: 'stack-lg' },
      h('div', { class: 'card stack' },
        h('h3', null, 'Backup'),
        h('p', { class: 'muted small' }, last ? `Last backup: ${fmtDate(last, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}` : 'No backup made yet from this app.'),
        h('p', { class: 'muted small' }, describe(store.snapshot())),
        h('button', { class: 'btn btn-primary btn-block', onclick: exportBackup }, icon('download'), 'Back up now'),
        h('button', { class: 'btn btn-block', onclick: pickRestore }, icon('upload'), 'Restore from file'),
        h('p', { class: 'faint small' }, 'Restore accepts backups from this app (replaces everything) and from the old Forge (adds what’s missing).')),
      watchCard(),
      h('div', { class: 'card stack' },
        h('h3', null, 'Goals'),
        h('label', { class: 'field' }, h('span', null, 'Daily steps goal'),
          h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1000, step: 500, value: stepGoal,
            onchange: (e) => { const v = parseInt(e.target.value, 10); if (v > 0) store.setSetting('stepGoal', v); } })),
        h('p', { class: 'faint small' }, 'Weekly: Heavy 2 · Zone 2 2 · HIIT 1 · one each of Lower, Chest/Shoulders, Back/Biceps, Core. Weeks run Sunday–Saturday.')),
      h('div', { class: 'card stack' },
        h('h3', null, 'Timer cues'),
        h('div', { class: 'grid-2' },
          h('button', { class: 'chip', 'aria-pressed': String(state.settings.sound !== false), onclick: () => store.setSetting('sound', state.settings.sound === false) }, 'Sound'),
          h('button', { class: 'chip', 'aria-pressed': String(state.settings.vibrate !== false), onclick: () => store.setSetting('vibrate', state.settings.vibrate === false) }, 'Vibration')),
        h('button', { class: 'btn btn-block', onclick: () => { unlockAudio(); cue('done'); } }, 'Test cue'),
        h('p', { class: 'faint small' }, wakeSupported() ? 'The screen stays on during a session and interval timers.' : 'This browser can’t keep the screen on — set a longer screen timeout.')),
      h('div', { class: 'card stack' },
        h('h3', null, 'Training plan'),
        h('p', { class: 'muted small' }, plan ? `${plan.name} — ${wk ? `week ${wk.index + 1} of ${wk.total}: ${wk.week.focus}` : 'finished'}` : 'No plan active.'),
        h('button', { class: 'btn btn-block', onclick: planSheet }, 'Plans')),
      h('div', { class: 'card stack' },
        h('h3', null, 'Exercises & data'),
        h('button', { class: 'btn btn-block', onclick: restoreDefaults }, 'Reset built-in exercises'),
        readOldState() ? h('button', { class: 'btn btn-block', onclick: reimportOld }, 'Bring over data from the old Forge again') : null),
      h('div', { class: 'card stack' },
        h('h3', null, 'About'),
        h('p', { class: 'muted small' }, `Version ${VERSION} · database “${dbName()}”${dbName() !== 'forge' ? ' (preview copy — separate from the real app)' : ''}`),
        h('p', { class: 'muted small' }, state.settings.persisted
          ? 'Storage is protected from automatic clean-up.'
          : 'Chrome may clear storage if the phone runs low on space — keep backups.'),
        state.settings.migratedFrom ? h('p', { class: 'faint small' }, `Data source: ${state.settings.migratedFrom}${state.settings.migratedAt ? `, ${fmtDate(state.settings.migratedAt)}` : ''}`) : null)));
}
