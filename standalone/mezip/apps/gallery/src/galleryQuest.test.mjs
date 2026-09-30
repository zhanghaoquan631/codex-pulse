import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerspectiveCamera, Vector3 } from 'three';
import { newQuest, restoreQuest, matchGalleryCards, nearestGalleryCard, companionCard, galleryFocusDistance, redeemQuest, searchSeparation, hideGalleryCard, companionDirection, galleryCardStatus, populateGalleryCell, galleryMedia } from './galleryQuest.mjs';

const images = Array.from({ length: 220 }, (_, i) => ({ url: '/personal/' + i + '.jpg', width: 3, height: 4 }));
const card = (url, id, x = 0, y = 0, z = 0) => ({ url, id, px: x, py: y, pz: z, size: 14, scaleX: 10.5, scaleY: 14 });

test('real gallery IDs: same image, different physical cards earns exactly one point', () => {
  const q = newQuest(images), a = card(images[0].url, '0,0,0|110|5|14-1'), b = card(a.url, '1,0,0|110|5|14-2');
  const next = matchGalleryCards(q, a, b);
  assert.deepEqual(next.cleared, [a.url]);
  assert.equal(q.cleared.length, 0);
  assert.equal(matchGalleryCards(next, a, b), next);
});

test('wrong images, the same card, and example images cannot earn points', () => {
  const q = newQuest(images), a = card(images[0].url, 'a');
  assert.equal(matchGalleryCards(q, a, a), q);
  assert.equal(matchGalleryCards(q, a, card(images[1].url, 'b')), q);
  assert.equal(matchGalleryCards(q, card('/sample.jpg', 'x'), card('/sample.jpg', 'y')), q);
});

test('next target is nearest in original world space, excluding all cleared-image copies', () => {
  let q = newQuest(images);
  q = matchGalleryCards(q, card(images[0].url, 'a'), card(images[0].url, 'b'));
  const origin = card('', '', 20, 30, -40);
  const near = card(images[1].url, 'near', 21, 30, -40);
  const far = card(images[2].url, 'far', 80, 30, -40);
  assert.equal(nearestGalleryCard([far, card(images[0].url, 'cleared-copy', 20, 30, -40), near], origin, q), near);
  assert.equal(nearestGalleryCard([card(images[0].url, 'cleared', 20, 30, -40)], origin, q), null);
});

test('every selected card gets a distinct matching companion without relocating its original', () => {
  for (const image of images) {
    const a = card(image.url, image.url, 15, -23, -180), original = { ...a };
    const b = companionCard(a, { seed: 42, progress: 0 });
    assert.notEqual(a.id, b.id);
    assert.equal(a.url, b.url);
    assert.deepEqual(a, original);
    assert.ok(Math.hypot(a.px - b.px, a.py - b.py) > a.size);
  }
});

test('target fits phone and desktop; distant mate becomes visible after navigating to its position', () => {
  for (const aspect of [.46, .5625, .75, 1, 1.4, 1.78, 2.4]) {
    const a = card(images[0].url, 'original-card', 40, 20, -100), b = companionCard(a, { seed: 93, progress: 120 });
    const camera = new PerspectiveCamera(60, aspect, 1, 500);
    for (const item of [a, b]) {
      camera.position.set(item.px, item.py, item.pz + galleryFocusDistance(item, aspect));
      camera.updateMatrixWorld();
      for (const x of [-.5, .5]) for (const y of [-.5, .5]) {
      const p = new Vector3(item.px + x * item.scaleX, item.py + y * item.scaleY, item.pz).project(camera);
        assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1, 'searched card is reachable at aspect ' + aspect);
      }
    }
  }
});

test('220 successive matches finish with 220 points and no remaining eligible cards', () => {
  let q = newQuest(images);
  const world = images.map((image, i) => card(image.url, 'cell-' + i, i % 10, i % 7, -i));
  let origin = card('', 'origin');
  for (let i = 0; i < 220; i++) {
    const a = nearestGalleryCard(world, origin, q);
    assert.ok(a);
    const b = companionCard(a, { seed: q.seed, progress: i });
    q = matchGalleryCards(q, a, b);
    assert.equal(q.cleared.length, i + 1);
    origin = b;
  }
  assert.equal(nearestGalleryCard(world, origin, q), null);
  assert.equal(new Set(q.cleared).size, 220);
});

test('saved progress restores, restart resets, reward allows only one image after winning', () => {
  const fresh = newQuest(images);
  assert.equal(redeemQuest(fresh, images[0].url), fresh);
  const won = { ...fresh, cleared: [...fresh.order] };
  const redeemed = redeemQuest(won, images[19].url);
  assert.equal(redeemed.redeemed, images[19].url);
  assert.equal(redeemQuest(redeemed, images[20].url), redeemed);
  assert.deepEqual(restoreQuest(JSON.stringify(redeemed), images), redeemed);
  assert.equal(restoreQuest(JSON.stringify({ ...fresh, cleared: ['/not-in-library'] }), images), null);
  assert.equal(newQuest(images).cleared.length, 0);
});

test('integration uses one original Canvas and a transparent click-through HUD, not the old board', () => {
  const main = readFileSync(new URL('./main.jsx', import.meta.url), 'utf8');
  const hud = readFileSync(new URL('./LiveGalleryQuest.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./galleryQuest.css', import.meta.url), 'utf8');
  assert.equal((main.match(/<Canvas\s/g) || []).length, 1);
  assert.ok(main.includes('<InfiniteField images={images} game={questGame}'));
  assert.ok(!hud.includes('<Canvas') && !hud.includes('stageCards'));
  assert.ok(main.includes('if (hideGalleryCard(game,'));
  assert.ok(main.includes('if (game?.active) {'));
  assert.ok(main.includes('if (game.searching) {'));
  assert.ok(main.includes('focusPlane(target, { force: true, ease: 0.055 });'));
  assert.ok(main.includes('clearFocus(); game.pick(target);'));
  assert.ok(main.includes('!hit.object.userData.galleryCard || hit.object.userData.hitReady'));
  assert.ok(css.includes('.quest-in-scene{background:transparent;pointer-events:none'));
  const hook = readFileSync(new URL('./useGalleryQuest.mjs', import.meta.url), 'utf8');
  assert.ok(hook.includes('clearTimeout(timer.current)'));
});

test('search mode spreads every pair, varies direction and depth, and preserves a stable answer', () => {
  const quadrants = new Set(), depths = new Set();
  for (let i = 0; i < 220; i++) {
    const a = card(images[i].url, 'cell-' + i, 10, -20, -90);
    const b = companionCard(a, { seed: 789, progress: i });
    const radius = Math.hypot(b.px - a.px, b.py - a.py);
    assert.ok(radius >= searchSeparation(i) + 20 && radius < searchSeparation(i) + 55);
    assert.ok(a.pz - b.pz >= 25 && a.pz - b.pz <= 75);
    assert.ok(radius < 190, 'bounded search range, not an unreachable random location');
    assert.deepEqual(b, companionCard(a, { seed: 789, progress: i }));
    assert.notDeepEqual(b, companionCard(a, { seed: 790, progress: i }));
    quadrants.add([Math.sign(b.px - a.px), Math.sign(b.py - a.py)].join(','));
    depths.add(Math.round(a.pz - b.pz));
    const game = { active: true, target: a, quest: { cleared: [] } };
    assert.equal(hideGalleryCard(game, b), false, 'guaranteed mate remains available');
    assert.equal(galleryCardStatus(game, b), 'card', 'answer is not highlighted or drawn over distractors');
  }
  assert.equal(quadrants.size, 4);
  assert.ok(depths.size > 20);
  assert.deepEqual([0, 55, 110, 165, 220].map(searchSeparation), [85, 100, 115, 130, 130]);
});

test('all unplayed original cards stay visible, including neighbours; close restores cleared originals', () => {
  const a = card(images[0].url, 'target');
  const close = card(a.url, 'near-copy', 15);
  const far = card(a.url, 'far-copy', 200);
  const distractor = card(images[1].url, 'other', 15);
  const game = { active: true, target: a, quest: { cleared: [] } };
  assert.equal(hideGalleryCard(game, a), false);
  assert.equal(hideGalleryCard(game, close), false);
  assert.equal(hideGalleryCard(game, far), false);
  assert.equal(hideGalleryCard(game, distractor), false);
  game.quest.cleared.push(a.url);
  assert.equal(hideGalleryCard(game, far), true);
  game.active = false;
  for (const item of [a, close, far, distractor]) assert.equal(hideGalleryCard(game, item), false);
});

test('nearby game cells add twelve cards while preserving every original position', () => {
  const base = [card(images[0].url, 'original-1'), card(images[1].url, 'original-2', 10)];
  const cell = { cx: 1, cy: -2, cz: -1, crowded: true };
  const result = populateGalleryCell(base, cell, true, 110, 14);
  assert.equal(result.length, base.length + 12);
  assert.deepEqual(result.slice(0, base.length), base);
  assert.equal(new Set(result.map(item => item.id)).size, result.length);
  assert.deepEqual(result, populateGalleryCell(base, cell, true, 110, 14));
  for (const item of result.slice(base.length)) {
    assert.ok(item.px >= 110 && item.px < 220);
    assert.ok(item.py >= -220 && item.py < -110);
    assert.ok(item.pz >= -110 && item.pz < 0);
  }
  assert.equal(populateGalleryCell(base, cell, false, 110, 14), base);
  assert.equal(populateGalleryCell(base, { ...cell, crowded: false }, true, 110, 14), base);
});

test('fillers remain playable using only remaining works without reviving cleared images', () => {
  const archive = [...images, { url: '/example.jpg' }];
  const game = { active: true, quest: { order: images.map(image => image.url), cleared: [images[0].url] } };
  const remaining = images.slice(1);
  for (let i = 0; i < 1000; i++) {
    const media = galleryMedia({ id: 'search-fill:' + i, imageIndex: i }, archive, remaining, game);
    assert.ok(remaining.includes(media));
  }
  const original = { id: 'base', imageIndex: 9 };
  assert.equal(galleryMedia(original, archive, remaining, game), images[9]);
  const sample = { id: 'base-sample', imageIndex: 220 };
  assert.ok(remaining.includes(galleryMedia(sample, archive, remaining, game)));
  game.active = false;
  assert.equal(galleryMedia(sample, archive, remaining, game), archive[220]);
});

test('optional hints use current camera direction without moving the card or camera', () => {
  const camera = { x: 0, y: 0, z: 50 }, mate = card(images[0].url, 'mate', 120, -80, -90);
  const before = JSON.stringify({ camera, mate });
  assert.match(companionDirection(camera, mate), /右侧偏下、更深处/);
  assert.match(companionDirection({ x: 200, y: -200, z: -200 }, mate), /左侧偏上、身后/);
  assert.equal(JSON.stringify({ camera, mate }), before);
});
