import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBackup, readBackup, backupFilename } from '../app/js/core/backup.js';
import { migrateLegacy } from '../app/js/core/migrate.js';
import { planWeek, validatePlan, VO2_PLAN } from '../app/js/core/plans.js';

const NOW = new Date(2026, 9, 16, 12).getTime();
const oldText = readFileSync(new URL('./fixtures/old-backup.json', import.meta.url), 'utf8');

test('v2 backup round-trips exactly', () => {
  const data = migrateLegacy(JSON.parse(oldText), { source: 'backup', now: NOW });
  const text = JSON.stringify(makeBackup(data, NOW));
  const back = readBackup(text, NOW);
  assert.equal(back.ok, true);
  assert.equal(back.ok && back.kind, 'v2');
  assert.deepEqual(back.ok && back.data, JSON.parse(JSON.stringify(data)));
});

test('old backup files are recognised and migrated', () => {
  const r = readBackup(oldText, NOW);
  assert.equal(r.ok && r.kind, 'legacy');
  assert.equal(r.ok && r.data.sessions.length, 3);
});

test('junk is rejected with a clear message', () => {
  assert.match((readBackup('# Command Center', NOW)).error, /not a Forge backup/);
  assert.match((readBackup('{"a":1}', NOW)).error, /not a Forge backup/);
  assert.match((readBackup('{"app":"forge","schema":2,"sessions":[]}', NOW)).error, /incomplete/);
  assert.match((readBackup('{"app":"forge","schema":9}', NOW)).error, /newer/);
});

test('backup filename', () => {
  assert.equal(backupFilename(NOW), 'forge_backup_2026-10-16.json');
});

test('plan week: 12 weeks then done', () => {
  const start = new Date(2026, 8, 6).getTime(); // Sun 6 Sep 2026
  assert.equal(planWeek(VO2_PLAN, start, start).index, 0);
  assert.equal(planWeek(VO2_PLAN, start, new Date(2026, 8, 13, 1).getTime()).index, 1);
  assert.equal(planWeek(VO2_PLAN, start, new Date(2026, 10, 28).getTime()).week.focus, 'Max consumption');
  assert.equal(planWeek(VO2_PLAN, start, new Date(2026, 11, 1).getTime()), null);
  assert.equal(planWeek(undefined, start, start), null);
});

test('plan import validation', () => {
  assert.equal(validatePlan({ id: 'x', name: 'X', weeks: [] }).ok, false);
  const ok = validatePlan({ id: 'base_8w', name: 'Base', weeks: [{ focus: 'Easy', cardio: ['card_v3'] }, { focus: 'More' }] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.ok && ok.plan.weeks[1], { week: 2, focus: 'More', cardio: [], notes: undefined });
});
