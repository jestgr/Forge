// Android-app paths: backup goes through Filesystem + Share, keep-awake and
// haptics use native plugins, and no service worker is registered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom, tick } from './helpers/fakedom.js';

installFakeDom({ path: '/' });
const calls = [];
const g = /** @type {any} */ (globalThis);
g.Capacitor = {
  isNativePlatform: () => true,
  Plugins: {
    Filesystem: { writeFile: async (o) => { calls.push(['write', o.path, o.directory]); return { uri: 'file:///cache/' + o.path }; } },
    Share: { share: async (o) => { calls.push(['share', o.files[0]]); } },
    KeepAwake: { keepAwake: async () => { calls.push(['awake']); }, allowSleep: async () => { calls.push(['sleep']); } },
    Haptics: { vibrate: async (o) => { calls.push(['buzz', o.duration]); } },
  },
};

const { download } = await import('../app/js/core/util.js');
const wake = await import('../app/js/platform/wakelock.js');
const { isNative, plugin } = await import('../app/js/platform/native.js');

test('detects the Android app', () => {
  assert.equal(isNative(), true);
  assert.ok(plugin('Share'));
  assert.equal(plugin('Nope'), null);
});

test('backup: write to cache, then open the share sheet', async () => {
  await download('forge_backup_2026-10-16.json', '{}');
  assert.deepEqual(calls.slice(-2), [['write', 'forge_backup_2026-10-16.json', 'CACHE'], ['share', 'file:///cache/forge_backup_2026-10-16.json']]);
});

test('keep awake uses the native plugin', async () => {
  wake.keepAwake('session');
  wake.allowSleep('session');
  await tick(5);
  assert.deepEqual(calls.slice(-2), [['awake'], ['sleep']]);
  assert.equal(wake.supported(), true);
});
