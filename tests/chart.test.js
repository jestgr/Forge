import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceMax, seriesSvg, thumbnail, downsample, pointAt, timeTicks } from '../app/js/core/chart.js';

const pts = (n, gapAt = -1) => Array.from({ length: n }, (_, i) => ({ t: i >= gapAt && gapAt >= 0 ? i + 60 : i, cadence: 80 + (i % 10), watts: 100 + i % 30, resistance: 12 }));

test('nice axis maxima', () => {
  assert.equal(niceMax(0), 10);
  assert.equal(niceMax(87), 100);
  assert.equal(niceMax(140), 150);
  assert.equal(niceMax(212), 250);
});

test('series chart: one line, grid labels, a gap breaks the line', () => {
  const svg = seriesSvg(pts(300), { key: 'watts', color: '#e8650f' });
  assert.match(svg, /^<svg/);
  assert.equal((svg.match(/<path/g) || []).length, 1);
  assert.equal((svg.match(/d="M/g) || []).length, 1);
  assert.match(svg, />150</);
  const gap = seriesSvg(pts(300, 150), { key: 'cadence', color: '#3a8ee6' });
  assert.equal((gap.match(/M\d/g) || []).length, 2, 'line restarts after the dropout');
});

test('saved picture: small SVG data URL, at most 120 points', () => {
  assert.equal(downsample(pts(3600), 120).length, 120);
  const url = thumbnail(pts(3600));
  assert.ok(url.startsWith('data:image/svg+xml,'));
  assert.ok(url.length < 8000, `thumbnail is ${url.length} chars`);
  const svg = decodeURIComponent(url.slice(url.indexOf(',') + 1));
  assert.equal((svg.match(/[ML]/g) || []).length, 120);
  assert.equal((svg.match(/M/g) || []).length, 1, 'no false gaps after downsampling');
});

test('tooltip point = nearest second', () => {
  const p = pointAt(pts(100), 61.4);
  assert.equal(p?.t, 61);
  assert.equal(p?.label, '1:01');
  assert.equal(pointAt([], 5), null);
});

test('time ticks fit the ride: seconds for short rides, minutes for long ones', () => {
  assert.deepEqual(timeTicks(25).map((x) => x.label), ['0', '0:10', '0:20']);
  assert.deepEqual(timeTicks(1200).map((x) => x.label), ['0', '5 min', '10 min', '15 min', '20 min']);
  assert.ok(timeTicks(3 * 3600).length <= 5);
});
