// Service worker sanity: version matches the app, and every app file is precached
// (otherwise the app breaks offline).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { VERSION } from '../app/js/version.js';

const APP = new URL('../app/', import.meta.url).pathname;
const sw = readFileSync(join(APP, 'sw.js'), 'utf8');

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

test('sw.js CACHE equals js/version.js VERSION', () => {
  const m = sw.match(/const CACHE = '([^']+)'/);
  assert.ok(m, 'CACHE constant not found');
  assert.equal(m[1], VERSION);
});

test('every app file is in the precache list', () => {
  const listed = new Set([...sw.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]));
  const missing = files(APP)
    .map((p) => './' + relative(APP, p))
    .filter((p) => p !== './sw.js' && !listed.has(p));
  assert.deepEqual(missing, []);
});

test('every precached path exists', () => {
  const listed = [...sw.matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1]);
  for (const p of listed) assert.ok(statSync(join(APP, p)).isFile(), `${p} is listed but missing`);
});
