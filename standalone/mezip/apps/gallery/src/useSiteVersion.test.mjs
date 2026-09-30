import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { SITE_VERSION, useSiteVersion } from './useSiteVersion.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('version detection bypasses cache, notices new release on focus, never reloads an active game', async t => {
  let version = SITE_VERSION, fail = false, current, renderer;
  const calls = [];
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (fail) throw new Error('offline fixture');
    return { ok: true, json: async () => ({ version }) };
  });
  function Probe() { current = useSiteVersion(); return null; }
  await act(async () => { renderer = create(React.createElement(Probe)); });
  t.after(async () => { await act(async () => renderer.unmount()); delete globalThis.window; delete globalThis.document; });
  assert.equal(current.status, 'current');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.match(calls[0].url, /gallery-version.json\?t=/);
  version = 'future-fixture';
  await act(async () => window.dispatchEvent(new Event('focus')));
  assert.equal(current.status, 'update');
  assert.equal(current.remoteVersion, version);
  fail = true;
  await act(async () => current.check());
  assert.equal(current.status, 'error');
});
