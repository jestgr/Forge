// UI smoke test: boots the real app in a fake browser with old-Forge data in
// localStorage, then clicks through a whole workout. Catches crashes and
// wiring mistakes that unit tests and the type checker can't see.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakeDom, byText, tick } from './helpers/fakedom.js';

const old = JSON.parse(readFileSync(new URL('./fixtures/old-backup.json', import.meta.url), 'utf8'));
const oldState = { ...old, exerciseOverrides: { lb_1: { name: 'Back Squat (high bar)' } }, deletedExerciseIds: ['cs_7'], dailySteps: { 'Thu Oct 15 2026': 9100 }, activePlanId: 'vo2_max_12w', planStartDate: Date.now() - 86400000 };
const { body, localStorage } = installFakeDom({ localData: { forge_workout_state: JSON.stringify(oldState) } });

// Track intervals so the test process can exit.
const g = /** @type {any} */ (globalThis);
const realSetInterval = g.setInterval;
const handles = [];
g.setInterval = (...a) => { const id = realSetInterval(...a); handles.push(id); return id; };
after(() => handles.forEach((id) => clearInterval(id)));

const click = async (text, tag = 'button', i = 0) => {
  const els = byText(body, text, tag);
  assert.ok(els[i], `no ${tag} with "${text}"`);
  els[i].click();
  await tick(30);
};
const has = (text) => body.textContent.includes(text);

const { store } = await import('../app/js/app.js').then(() => g.forge);
await tick(60);

test('first launch brings over old Forge data (read-only)', () => {
  assert.equal(store.state.sessions.length, old.history.length);
  assert.equal(store.state.exercises.find((e) => e.id === 'lb_1').name, 'Back Squat (high bar)');
  assert.equal(store.state.settings.plan.id, 'vo2_max_12w');
  assert.equal(store.state.daily['2026-10-15'].steps, 9100);
  assert.ok(has('Brought over 3 sessions'));
  assert.equal(localStorage.forge_workout_state, JSON.stringify(oldState), 'old data untouched');
  assert.ok(body.classList.contains('is-preview'));
});

test('build a Lower Body + cardio workout', async () => {
  assert.ok(has('Begin next session'));
  await click('Begin next session');
  await click('Lower Body', 'button');
  await click('Yes');
  await click('Full gym');
  await click('Build workout');
  await tick(50);
  const s = store.activeSession();
  assert.ok(s, 'session created');
  assert.equal(s.split, 'lower');
  assert.deepEqual(s.sections.map((x) => x.items.length > 0), [true, true, true, true]);
  assert.ok(s.sections[3].items.some((i) => i.exerciseId === 'card_v3'), 'plan week 1 cardio first');
  assert.ok(has('Re-roll') && has('Log set') && has('Begin 4×4 protocol'));
});

test('log a set: clock starts, rest begins, edit it', async () => {
  const res = store.activeSession().sections.find((x) => x.category === 'resistance');
  const name = res.items[0].name;
  const idx = byText(body, 'Log set', 'button').findIndex((b) => b.parentElement.parentElement.textContent.includes(name));
  await click('Log set', 'button', idx);
  assert.ok(has('Save set'));
  await click('Save set');
  await tick(50);
  const s = store.activeSession();
  const it = s.sections.find((x) => x.category === 'resistance').items[0];
  assert.equal(it.sets.length, 1);
  assert.ok(s.clockStartedAt, 'clock started');
  assert.ok(s.rest && s.rest.targetSec > 0, 'rest started');
  assert.ok(has('REST'));
  await click('Skip rest');
  await tick(30);
  assert.equal(store.activeSession().rest, null);
});

test('exercise sheet shows suggestion and history', async () => {
  const main = body.querySelectorAll('.ex-main')[0];
  main.click();
  await tick(30);
  assert.ok(has('Suggestion'));
  assert.ok(has('Edit in library'));
  history.back();
  await tick(30);
});

test('switch, add, remove, re-roll', async () => {
  const before = store.activeSession().sections[0].items[0].exerciseId;
  const swap = body.querySelectorAll('.icon-btn').find((b) => (b.getAttribute('aria-label') || '').startsWith('Switch'));
  swap.click();
  await tick(30);
  const rows = body.querySelectorAll('.list-row');
  assert.ok(rows.length > 0, 'picker lists exercises');
  const pick = rows.find((r) => !r.textContent.includes(store.activeSession().sections[0].items[0].name));
  pick.click();
  await tick(50);
  assert.notEqual(store.activeSession().sections[0].items[0].exerciseId, before);

  const n = store.activeSession().sections[1].items.length;
  await click('ADD', 'button', 1);
  body.querySelectorAll('.list-row')[0].click();
  await tick(50);
  assert.equal(store.activeSession().sections[1].items.length, n + 1);

  const posture = store.activeSession().sections[1].items;
  const victim = posture[posture.length - 1].name;
  body.querySelectorAll('.icon-btn').find((b) => b.getAttribute('aria-label') === `Remove ${victim}`).click();
  await tick(50);
  assert.equal(store.activeSession().sections[1].items.length, n);

  await click('Re-roll');
  await tick(30);
  assert.ok(has('New resistance picks'));
});

test('4×4 runner opens and can be minimised', async () => {
  await click('Begin 4×4 protocol');
  await tick(50);
  assert.ok(body.querySelector('.runner'), 'runner shown');
  assert.ok(has('Warm-up'));
  const cardio = store.activeSession().sections.find((x) => x.category === 'cardio');
  assert.ok(cardio.items.some((i) => i.protocol?.startedAt));
  body.querySelectorAll('.icon-btn').find((b) => b.getAttribute('aria-label') === 'Minimise').click();
  await tick(30);
  assert.ok(has('4×4 running — open'));
});

test('finish saves the session and shows what it earned', async () => {
  // Log one more resistance exercise so it earns Heavy.
  const res = store.activeSession().sections.find((x) => x.category === 'resistance');
  const name = res.items[1].name;
  const idx = byText(body, 'Log set', 'button').findIndex((b) => b.parentElement.parentElement.textContent.includes(name));
  await click('Log set', 'button', idx);
  await click('Save set');
  await tick(50);
  await click('Finish', 'button');
  assert.ok(has('Heavy'));
  await click('Save session');
  await tick(60);
  assert.equal(store.activeSession(), null);
  const saved = store.state.sessions.find((s) => s.source === 'forge');
  assert.equal(saved.status, 'done');
  assert.ok(saved.sections.every((x) => x.items.every((i) => i.sets.length || i.protocol)), 'unlogged exercises dropped');
  assert.ok(has('counts as Heavy'));
});

test('fallback: start and stop with nothing done saves nothing', async () => {
  await click('6-minute fallback');
  await tick(30);
  assert.ok(has('Squats'));
  await click('Stop');
  await click('Stop', 'button', byText(body, 'Stop', 'button').length - 1);
  await tick(50);
  assert.equal(store.state.settings.fallbackRun, null);
  assert.ok(has('nothing saved'));
});

test('other tabs render', async () => {
  g.setHash('#/library');
  await tick(20);
  assert.ok(has('Search exercises') || body.querySelectorAll('input').length > 0);
  assert.ok(body.querySelectorAll('.list-row').length > 40);
  g.setHash('#/history');
  await tick(20);
  g.setHash('#/settings');
  await tick(20);
  assert.ok(has('Back up now') && has('forge-preview'));
  await click('Back up now');
  assert.ok(store.state.settings.lastBackupAt);
  g.setHash('#/');
  await tick(20);
});
