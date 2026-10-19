import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakedom.js';

installFakeDom();
const { safeUrl } = await import('../app/js/ui/dom.js');

test('demo links: only http(s); bare domains get https://', () => {
  assert.equal(safeUrl('https://www.instagram.com/reel/abc/'), 'https://www.instagram.com/reel/abc/');
  assert.equal(safeUrl('  http://youtu.be/x '), 'http://youtu.be/x');
  assert.equal(safeUrl('youtube.com/watch?v=1'), 'https://youtube.com/watch?v=1');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl(''), null);
  assert.equal(safeUrl('not a link'), null);
});
