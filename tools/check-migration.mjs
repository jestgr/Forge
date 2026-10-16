// Run the migration on a real old-format Forge backup and prove nothing is lost.
// Prints counts only (no personal values). Exit code 1 if anything differs.
// Usage: node tools/check-migration.mjs <forge_backup.json>
import { readFileSync } from 'node:fs';
import { readBackup, makeBackup } from '../app/js/core/backup.js';
import { creditFor } from '../app/js/core/goals.js';
import { weekStart } from '../app/js/core/util.js';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/check-migration.mjs <backup.json>'); process.exit(2); }
const text = readFileSync(file, 'utf8');
const now = Date.now();
const r = readBackup(text, now);
if (!r.ok) { console.error('NOT MIGRATED:', r.error); process.exit(1); }
if (r.kind !== 'legacy') { console.log('File is already a schema-2 backup; nothing to migrate.'); process.exit(0); }
const old = JSON.parse(text);
const v2 = r.data;

const oldEx = (old.history || []).flatMap((s) => s.exercises || []);
const oldSets = oldEx.flatMap((e) => e.sets || []);
const newItems = v2.sessions.flatMap((s) => s.sections.flatMap((x) => x.items));
const newSets = newItems.flatMap((i) => i.sets);
const sum = (arr, k) => Math.round(arr.reduce((t, x) => t + (Number(x[k]) || 0), 0) * 100) / 100;
const vol = (arr, w, r2) => Math.round(arr.reduce((t, x) => t + (Number(x[w]) || 0) * (Number(x[r2]) || 0), 0));

const rows = [
  ['sessions', (old.history || []).length, v2.sessions.length],
  ['exercise entries', oldEx.length, newItems.length],
  ['sets', oldSets.length, newSets.length],
  ['total reps', sum(oldSets, 'reps'), sum(newSets, 'reps')],
  ['total weight lifted (weight×reps)', vol(oldSets, 'weight', 'reps'), vol(newSets, 'weight', 'reps')],
  ['total logged seconds', sum(oldSets, 'time'), sum(newSets, 'timeSec')],
  ['custom exercises', (old.customExercises || []).length, v2.exercises.filter((e) => !e.builtIn).length],
];
const oldIds = new Set((old.history || []).map((s) => String(s.id)));
const missingSessions = [...oldIds].filter((id) => !v2.sessions.some((s) => s.id === id)).length;
const missingSets = (old.history || []).reduce((n, s) => {
  const ns = v2.sessions.find((x) => x.id === String(s.id));
  const have = new Set(ns ? ns.sections.flatMap((x) => x.items.flatMap((i) => i.sets.map((st) => `${i.id}@${st.at}`))) : []);
  return n + (s.exercises || []).reduce((m, e) => m + (e.sets || []).filter((st) => !have.has(`${e.id}@${st.timestamp}`)).length, 0);
}, 0);
const linked = newItems.filter((i) => v2.exercises.some((e) => e.id === i.exerciseId)).length;

let ok = missingSessions === 0 && missingSets === 0;
console.log('check                               old      new');
for (const [name, a, b] of rows) {
  const same = a === b;
  ok &&= same;
  console.log(`${name.padEnd(34)} ${String(a).padStart(7)}  ${String(b).padStart(7)}  ${same ? 'OK' : 'DIFFERENT'}`);
}
console.log(`sessions missing by id: ${missingSessions}; sets missing by id+time: ${missingSets}`);
console.log(`entries linked to a library exercise: ${linked} of ${newItems.length}`);
console.log(`sessions with end time repaired (left running >4 h): ${v2.sessions.filter((s) => s.legacy?.endTimeFixed).length}`);
const credits = v2.sessions.map(creditFor);
console.log(`credit under new rules: heavy ${credits.filter((c) => c.heavy).length}, zone2 ${credits.filter((c) => c.zone2).length}, hiit ${credits.filter((c) => c.hiit).length}, split ${credits.filter((c) => c.split).length}`);
console.log(`distinct weeks with sessions: ${new Set(v2.sessions.map((s) => weekStart(s.startedAt))).size}`);
const size = JSON.stringify(makeBackup(v2, now)).length;
console.log(`new backup size: ${(size / 1024).toFixed(0)} KB`);
console.log(ok ? 'RESULT: OK — nothing lost' : 'RESULT: PROBLEM — see above');
process.exit(ok ? 0 : 1);
