import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { useGalleryQuest, useAutoGalleryTarget } from './useGalleryQuest.mjs';
import { QUEST_KEY, galleryCardStatus } from './galleryQuest.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const images = Array.from({ length: 220 }, (_, i) => ({ url: '/personal/' + i + '.jpg', width: 3, height: 4 }));
const first = { id: 'actual-cell-a', url: images[0].url, px: 12, py: 3, pz: -40 };
const mate = { ...first, id: 'actual-cell-b', px: 24 };
const nextFirst = { ...first, id: 'next-a', url: images[1].url, px: 50 };
const nextMate = { ...nextFirst, id: 'next-b', px: 62 };
const world = [first, mate, nextFirst, nextMate];
const origin = { px: 0, py: 0, pz: 50 };

test('balance sync preserves reference and first click; payment temporarily blocks pair clicks', async t => {
  const h = await mountGame(t);
  await h.call(g => { g.setQuest(q => ({ ...q, cleared: [images[2].url, images[3].url] })); g.open(); });
  await h.call(g => g.pick(first));
  const targetBefore = h.game.target;
  await h.call(g => { g.setInteractionBusy(true); g.pick(mate); });
  assert.equal(h.game.pending, null);
  await h.call(g => g.acceptCloudQuest({ ...g.quest, hintPurchases: ['purchase-test'] }));
  assert.equal(h.game.target, targetBefore);
  assert.equal(h.game.picked.id, first.id);
  await h.call(g => { g.setInteractionBusy(false); g.pick(mate); });
  await h.tick(420);
  assert.equal(h.game.quest.cleared.length, 3);
  assert.deepEqual(h.game.quest.hintPurchases, ['purchase-test']);
});

async function mountGame(t) {
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  let current, renderer;
  function Probe() {
    current = useGalleryQuest(images);
    useAutoGalleryTarget(current, world, origin, images);
    return null;
  }
  await act(async () => { renderer = create(React.createElement(Probe)); });
  t.after(async () => { await act(async () => renderer.unmount()); delete globalThis.localStorage; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  return {
    get game() { return current; }, storage,
    async call(fn) { await act(async () => fn(current)); },
    async tick(ms) { await act(async () => t.mock.timers.tick(ms)); },
    async remount() {
      await act(async () => renderer.unmount());
      await act(async () => { renderer = create(React.createElement(Probe)); });
    }
  };
}

test('real hook: original card selection, wrong choice, and double click during elimination', async t => {
  const h = await mountGame(t);
  await h.call(g => g.open());
  assert.equal(h.game.target.id, first.id, 'system locks a hint without a click');
  assert.equal(h.game.picked, null, 'automatic hint is NOT a player selection');
  await h.call(g => g.pick(first));
  assert.equal(h.game.picked.id, first.id);
  assert.equal(h.game.target.id, first.id);
  assert.equal(h.game.quest.cleared.length, 0);
  await h.call(g => { g.pick(mate); g.pick(mate); });
  assert.equal(h.game.pending, first.url);
  assert.equal(galleryCardStatus(h.game, first), 'removing');
  assert.equal(galleryCardStatus(h.game, mate), 'removing');
  await h.tick(419);
  assert.equal(h.game.quest.cleared.length, 0);
  await h.tick(1);
  assert.deepEqual(h.game.quest.cleared, [first.url]);
  assert.equal(h.game.anchor.id, mate.id);
  assert.equal(h.game.target.id, nextFirst.id, 'nearest next hint locks automatically');
  assert.equal(h.game.picked, null, 'next round still needs TWO fresh clicks');
  await h.call(g => g.pick(first));
  assert.equal(h.game.target.id, nextFirst.id, 'cleared images cannot replace the next target');
  assert.equal(h.game.picked, null);
});

test('two matching non-target pictures cannot override the required image or score', async t => {
  const h = await mountGame(t);
  await h.call(g => g.open());
  const focusBefore = h.game.focusRequest;
  assert.equal(h.game.target.id, first.id);
  await h.call(g => g.pick(nextFirst));
  assert.equal(h.game.target.id, first.id);
  assert.equal(h.game.picked, null);
  assert.equal(h.game.focusRequest, focusBefore);
  await h.call(g => g.pick(nextMate));
  await h.tick(420);
  assert.deepEqual(h.game.quest.cleared, []);
  assert.equal(h.game.pending, null);
  assert.equal(h.game.target.id, first.id);
});

test('wrong image gives feedback and preserves the first correct click and target', async t => {
  const h = await mountGame(t);
  await h.call(g => g.open());
  await h.call(g => g.pick(first));
  await h.call(g => g.pick(nextFirst));
  assert.equal(h.game.picked.id, first.id);
  assert.equal(h.game.target.id, first.id);
  assert.match(h.game.notice, /点击已收到/);
  assert.equal(h.game.quest.cleared.length, 0);
  await h.call(g => g.pick(nextMate));
  await h.tick(420);
  assert.deepEqual(h.game.quest.cleared, []);
  await h.call(g => g.pick(mate));
  await h.tick(420);
  assert.deepEqual(h.game.quest.cleared, [first.url]);
});

test('real hook: closing during fade cancels pending points and restores inactive state', async t => {
  const h = await mountGame(t);
  await h.call(g => g.open());
  await h.call(g => g.pick(first));
  await h.call(g => g.pick(mate));
  await h.call(g => g.close());
  await h.tick(1000);
  assert.equal(h.game.active, false);
  assert.equal(h.game.target, null);
  assert.equal(h.game.pending, null);
  assert.equal(h.game.quest.cleared.length, 0);
  await h.call(g => g.open());
  assert.equal(h.game.quest.cleared.length, 0);
});

test('real hook: restarting during fade cannot leak points into the new game', async t => {
  const h = await mountGame(t);
  await h.call(g => g.open());
  await h.call(g => g.pick(first));
  await h.call(g => g.pick(mate));
  await h.call(g => g.restart());
  await h.tick(1000);
  assert.equal(h.game.active, true);
  assert.deepEqual(h.game.quest.cleared, []);
  assert.equal(h.game.target.id, first.id);
  assert.equal(h.game.picked, null);
  assert.equal(h.game.anchor, null);
});

test('real hook: completed points survive close and a fresh component mount', async t => {
  const h = await mountGame(t);
  await h.call(g => g.open());
  await h.call(g => g.pick(first));
  await h.call(g => g.pick(mate));
  await h.tick(420);
  await h.call(g => g.close());
  const saved = JSON.parse(h.storage.get(QUEST_KEY));
  assert.deepEqual(saved.cleared, [first.url]);
  await h.remount();
  assert.equal(h.game.active, false, 'reload never starts a game without asking');
  assert.deepEqual(h.game.quest.cleared, [first.url]);
  await h.call(g => g.open());
  assert.equal(h.game.quest.cleared.length, 1);
});

test('real hook: unloading during elimination cancels the pending completion', async t => {
  const h = await mountGame(t);
  await h.call(g => g.open());
  await h.call(g => g.pick(first));
  await h.call(g => g.pick(mate));
  await h.remount();
  await h.tick(1000);
  assert.equal(h.game.quest.cleared.length, 0);
  assert.deepEqual(JSON.parse(h.storage.get(QUEST_KEY)).cleared, []);
});

test('both distinct pictures must be clicked; one picture clicked repeatedly never scores', async t => {
  const h = await mountGame(t);
  await h.call(g => g.open());
  await h.tick(1000);
  assert.equal(h.game.quest.cleared.length, 0);
  await h.call(g => g.pick(mate));
  assert.equal(h.game.picked.id, mate.id, 'either of the two pictures may be clicked first');
  assert.equal(galleryCardStatus(h.game, mate, 'mate'), 'picked');
  assert.equal(galleryCardStatus(h.game, first), 'target');
  for (let i = 0; i < 3; i++) await h.call(g => g.pick(mate));
  await h.tick(1000);
  assert.equal(h.game.pending, null);
  assert.equal(h.game.quest.cleared.length, 0);
  await h.call(g => g.pick(first));
  await h.tick(420);
  assert.equal(h.game.quest.cleared.length, 1);
  assert.equal(h.game.target.id, nextFirst.id);
  await h.call(g => g.pick(nextMate));
  await h.tick(1000);
  assert.equal(h.game.quest.cleared.length, 1, 'next round one click is still insufficient');
  await h.call(g => g.pick(nextFirst));
  await h.tick(420);
  assert.equal(h.game.quest.cleared.length, 2);
  assert.equal(h.game.picked, null);
});

test('closing after only one selection clears that selection without consuming the pair', async t => {
  const h = await mountGame(t);
  await h.call(g => g.open());
  await h.call(g => g.pick(first));
  await h.call(g => g.close());
  assert.equal(h.game.picked, null);
  await h.call(g => g.open());
  await h.call(g => g.pick(mate));
  await h.tick(1000);
  assert.equal(h.game.quest.cleared.length, 0, 'the old selection must not survive a close');
  await h.call(g => g.pick(first));
  await h.tick(420);
  assert.equal(h.game.quest.cleared.length, 1);
});

test('search mode rejects a wrong candidate without exiting or changing score', async t => {
  const h = await mountGame(t);
  await h.call(g => g.open());
  await h.call(g => g.startSearch());
  await h.call(g => g.inspect(nextFirst));
  assert.equal(h.game.candidate.id, nextFirst.id);
  await h.call(g => g.confirmCandidate());
  assert.equal(h.game.searching, true);
  assert.equal(h.game.candidate, null);
  assert.equal(h.game.picked, null);
  assert.deepEqual(h.game.quest.cleared, []);
  assert.match(h.game.notice, /重新寻找/);
});

test('search mode confirms two distinct matching cards and stays active between them', async t => {
  const h = await mountGame(t);
  await h.call(g => g.open());
  await h.call(g => g.startSearch());
  await h.call(g => g.inspect(first));
  await h.call(g => g.confirmCandidate());
  assert.equal(h.game.searching, true, 'search remains available while finding the second copy');
  assert.equal(h.game.picked.id, first.id);
  await h.call(g => g.inspect(mate));
  await h.call(g => g.confirmCandidate());
  assert.equal(h.game.searching, false);
  assert.equal(h.game.pending, first.url);
  await h.tick(420);
  assert.deepEqual(h.game.quest.cleared, [first.url]);
});
