import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { useAccountSync } from './useAccountSync.mjs';
import { newQuest } from './galleryQuest.mjs';
import { questImages, mergeQuestProgress } from '../server/quest-sync.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const bindingKey = 'gallery-quest-account-binding-v1';
const identity = { key: 'alice', email: 'alice@example.test', kind: 'email' };
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

async function mountSync(t, { bound = true, quest = newQuest(questImages), handler } = {}) {
  const storage = new Map(bound ? [[bindingKey, JSON.stringify({ identity: 'alice', runId: 'run-one' })]] : []);
  t.mock.method(globalThis, 'fetch', handler);
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.window = new EventTarget();
  let renderer, cloud;
  const accepted = [];
  let game = { quest, pending: null, acceptCloudQuest: q => { if (JSON.stringify(q) !== JSON.stringify(game.quest)) { accepted.push(q); game.quest = q; } } };
  function Probe() { cloud = useAccountSync(game); return null; }
  await act(async () => { renderer = create(React.createElement(Probe)); });
  t.after(async () => { await act(async () => renderer.unmount()); delete globalThis.localStorage; delete globalThis.window; });
  return {
    get cloud() { return cloud; }, game, accepted, storage,
    async call(fn) { let result; await act(async () => { result = await fn(cloud); }); return result; },
    async flush(fn = () => {}) { await act(async () => { fn(); }); }
  };
}

test('unbound account never silently imports; explicit import unions 13 + overlapping points', async t => {
  const q = newQuest(questImages), local = { ...q, cleared: q.order.slice(0, 13) };
  let remote = { runId: 'run-one', quest: { ...q, cleared: q.order.slice(10, 15) } }, posts = 0;
  const h = await mountSync(t, { bound: false, quest: local, handler: async (_url, options) => {
    if (!options.method) return reply(200, { user: identity, record: remote });
    posts++;
    const body = JSON.parse(options.body);
    assert.equal(body.expectedIdentity, 'alice');
    remote = { ...remote, quest: mergeQuestProgress(remote.quest, body.quest) };
    return reply(200, { user: identity, record: remote });
  } });
  assert.equal(posts, 0);
  assert.equal(h.cloud.enabled, false);
  assert.equal(await h.call(c => c.connect()), true);
  assert.equal(h.cloud.enabled, true);
  assert.equal(h.game.quest.cleared.length, 15);
  assert.equal(JSON.parse(h.storage.get(bindingKey)).identity, 'alice');
});

test('other-browser reset adopts new epoch and backs up local points without posting stale data', async t => {
  const q = newQuest(questImages), local = { ...q, cleared: q.order.slice(0, 13) };
  let posted = 0;
  const h = await mountSync(t, { quest: local, handler: async (_url, options) => {
    if (options.method) posted++;
    return reply(200, { user: identity, record: { runId: 'run-two', quest: q } });
  } });
  assert.equal(h.game.quest.cleared.length, 0);
  assert.equal(JSON.parse(h.storage.get('gallery-quest-before-cloud-reset')).cleared.length, 13);
  assert.equal(JSON.parse(h.storage.get(bindingKey)).runId, 'run-two');
  // A follow-up effect may write only the adopted new run, never the old points.
  assert.ok(h.accepted.every(saved => saved.cleared.length === 0));
});

test('in-flight sync never cancels a newly clicked pair awaiting its fade timer', async t => {
  const q = newQuest(questImages);
  let resolvePost;
  const h = await mountSync(t, { quest: q, handler: async (_url, options) => {
    if (!options.method) return reply(200, { user: identity, record: { runId: 'run-one', quest: q } });
    return new Promise(resolve => { resolvePost = resolve; });
  } });
  h.game.pending = q.order[0];
  await h.flush(() => resolvePost(reply(200, { record: { runId: 'run-one', quest: { ...q, cleared: [q.order[1]] } } })));
  assert.equal(h.accepted.length, 0);
  assert.equal(h.game.pending, q.order[0]);
  assert.match(h.cloud.message, /待下一次同步/);
});

test('new local point during request is preserved for next merge', async t => {
  const q = newQuest(questImages);
  let resolvePost;
  const h = await mountSync(t, { quest: q, handler: async (_url, options) => {
    if (!options.method) return reply(200, { user: identity, record: { runId: 'run-one', quest: q } });
    return new Promise(resolve => { resolvePost = resolve; });
  } });
  h.game.quest = { ...q, cleared: [q.order[0]] };
  await h.flush(() => resolvePost(reply(200, { record: { runId: 'run-one', quest: q } })));
  assert.equal(h.accepted.length, 0);
  assert.equal(h.game.quest.cleared.length, 1);
});

test('expired login and network errors never erase local progress or claim saved', async t => {
  const q = newQuest(questImages);
  let offline = false;
  const h = await mountSync(t, { quest: q, handler: async () => { if (offline) throw new Error('fixture offline'); return reply(401, {}); } });
  assert.equal(h.cloud.enabled, false);
  assert.equal(h.cloud.accountBound, true);
  assert.match(h.cloud.message, /未登录/);
  offline = true;
  assert.equal(await h.call(c => c.reset()), false);
  assert.equal(h.game.quest, q);
  assert.equal(h.accepted.length, 0);
  assert.doesNotMatch(h.cloud.message, /已确认保存/);
});

test('account changed mid-request requires fresh explicit consent', async t => {
  const q = newQuest(questImages);
  const h = await mountSync(t, { quest: q, handler: async (_url, options) => !options.method
    ? reply(200, { user: identity, record: { runId: 'run-one', quest: q } })
    : reply(409, { accountChanged: true }) });
  assert.equal(h.cloud.enabled, false);
  assert.equal(h.accepted.length, 0);
  assert.match(h.cloud.message, /重新确认合并/);
});
