import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, estimateSec, fillSection, fitsSplit, sectionMinutes, effectiveTargets } from '../app/js/core/generator.js';
import { builtinExercises } from '../app/js/core/migrate.js';
import { SECTION_WINDOWS } from '../app/js/core/model.js';
import { rng } from '../app/js/core/util.js';

const lib = builtinExercises();
const NOW = new Date(2026, 9, 16, 9).getTime();
const base = { exercises: lib, sessions: [], now: NOW, seed: 42 };
const byCat = (secs) => Object.fromEntries(secs.map((s) => [s.category, s.items]));

test('estimate: sets × work + rest between sets + 2 min to move on', () => {
  assert.equal(estimateSec({ sets: 3, reps: 10, restSec: 60 }, 'resistance'), 3 * 20 + 2 * 60 + 120);
  assert.equal(estimateSec({ sets: 3, reps: '8-12' }, 'resistance'), 3 * 20 + 2 * 90 + 120, 'no rest set → 90 s');
  assert.equal(estimateSec({ sets: 2, durationSec: 60 }, 'mobility'), 2 * 60 + 90 + 120);
  assert.equal(estimateSec({ sets: 4, reps: 5, restSec: 180 }, 'resistance'), 4 * 20 + 3 * 180 + 120, 'target sets respected');
  assert.equal(estimateSec({ durationSec: 1500 }, 'cardio'), 1500 + 120);
  assert.deepEqual(effectiveTargets({ sets: null, reps: null, restSec: null, durationSec: null }, 'resistance'), { sets: 3, reps: 10, restSec: 90, durationSec: null });
});

test('a session is about 45 min before cardio', () => {
  for (const split of /** @type {any[]} */ (['lower', 'chest-shoulders', 'back-biceps', 'core'])) {
    for (let seed = 1; seed <= 5; seed++) {
      const s = generate({ ...base, seed, split, includeCardio: false, equipment: 'full-gym' });
      const min = s.reduce((t, x) => t + sectionMinutes(x.items, x.category), 0);
      assert.ok(min >= 38 && min <= 52, `${split} seed ${seed}: ${min.toFixed(1)} min`);
    }
  }
});

for (const split of /** @type {any[]} */ (['lower', 'chest-shoulders', 'back-biceps', 'core'])) {
  test(`${split}: every section inside its time window`, () => {
    const s = byCat(generate({ ...base, split, includeCardio: true, equipment: 'full-gym' }));
    for (const cat of ['mobility', 'posture', 'resistance', 'cardio']) {
      const min = sectionMinutes(s[cat], cat);
      const w = SECTION_WINDOWS[cat];
      assert.ok(s[cat].length > 0, `${cat} empty`);
      assert.ok(min <= w.max + 1, `${cat} ${min.toFixed(1)} min over ${w.max}`);
    }
    for (const it of s.resistance) assert.ok(fitsSplit(lib.find((e) => e.id === it.exerciseId), split), `${it.name} not ${split}`);
  });
}

test('no cardio unless asked; Pure Cardio has no resistance', () => {
  const noCardio = byCat(generate({ ...base, split: 'lower', includeCardio: false, equipment: 'full-gym' }));
  assert.equal(noCardio.cardio.length, 0);
  const pure = byCat(generate({ ...base, split: 'pure-cardio', includeCardio: false, equipment: 'full-gym' }));
  assert.equal(pure.resistance.length, 0);
  assert.ok(pure.cardio.length > 0);
  assert.ok(pure.mobility.length > 0 && pure.posture.length > 0);
});

test('equipment mode respected', () => {
  for (const eq of /** @type {any[]} */ (['bodyweight', 'home-travel', 'minimal-gym'])) {
    const secs = generate({ ...base, split: 'lower', includeCardio: true, equipment: eq });
    for (const sec of secs) for (const it of sec.items) {
      assert.ok(lib.find((e) => e.id === it.exerciseId).equipment.includes(eq), `${it.name} not ${eq}`);
    }
  }
});

test('long cardio is trimmed for the session, library untouched', () => {
  const items = fillSection({ category: 'cardio', exercises: lib, split: 'pure-cardio', equipment: 'full-gym', last: {}, now: NOW, random: rng(1), first: ['card_v3'] });
  assert.equal(items[0].exerciseId, 'card_v3');
  assert.equal(items[0].targets.durationSec, 30 * 60);
  assert.equal(lib.find((e) => e.id === 'card_v3').targets.durationSec, 2700);
});

test('prefers exercises not done recently', () => {
  const lower = lib.filter((e) => e.categories.includes('resistance') && e.splits.includes('lower'));
  const recent = lower.slice(0, 4).map((e) => e.id);
  /** @type {any[]} */
  const sessions = [{ id: 'x', status: 'done', startedAt: NOW - 86400000, sections: [{ category: 'resistance', items: recent.map((id) => ({ exerciseId: id, sets: [{ at: 1 }] })) }] }];
  for (let seed = 1; seed <= 5; seed++) {
    const s = byCat(generate({ ...base, sessions, seed, split: 'lower', includeCardio: false, equipment: 'full-gym' }));
    const picked = s.resistance.map((i) => i.exerciseId);
    const fresh = picked.filter((id) => !recent.includes(id)).length;
    assert.ok(fresh >= Math.min(picked.length, lower.length - 4), `seed ${seed}: picked recent ones first`);
  }
});

test('same seed → same workout; tiny library does not hang', () => {
  const a = generate({ ...base, split: 'back-biceps', includeCardio: true, equipment: 'full-gym' });
  const b = generate({ ...base, split: 'back-biceps', includeCardio: true, equipment: 'full-gym' });
  assert.deepEqual(a.map((s) => s.items.map((i) => i.exerciseId)), b.map((s) => s.items.map((i) => i.exerciseId)));
  const tiny = generate({ ...base, exercises: lib.slice(0, 2), split: 'core', includeCardio: true, equipment: 'full-gym' });
  assert.equal(tiny.length, 4);
});

test('Upper tag counts for both upper-body days', () => {
  const ex = { splits: ['upper'] };
  assert.equal(fitsSplit(ex, 'chest-shoulders'), true);
  assert.equal(fitsSplit(ex, 'back-biceps'), true);
  assert.equal(fitsSplit(ex, 'lower'), false);
  assert.equal(fitsSplit({ splits: [] }, 'core'), true);
});
