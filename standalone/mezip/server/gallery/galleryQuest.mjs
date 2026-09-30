export const QUEST_TOTAL = 220;
export const PAIRS_PER_STAGE = 6;
export const LOCK_COST = 2;
export function questBalance(q) {
  return Math.max(0, q.cleared.length - (q.hintPurchases?.length || 0) * LOCK_COST - (q.redeemed ? QUEST_TOTAL : 0));
}
export function purchaseLock(q, requestId) {
  if (q.hintPurchases?.includes(requestId)) return q;
  if (!requestId || q.redeemed || questBalance(q) < LOCK_COST) return null;
  return { ...q, hintPurchases: [...(q.hintPurchases || []), requestId] };
}
export const QUEST_KEY = 'infinite-gallery-quest-v1';

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function newQuest(images) {
  const urls = [...new Set(images.map(image => image.url))];
  if (urls.length !== QUEST_TOTAL) throw new Error('闯关图片库应包含 220 张个人图片');
  return { version: 1, order: shuffle(urls), seed: Math.floor(Math.random() * 1000000), cleared: [], redeemed: null };
}

export function restoreQuest(raw, images) {
  try {
    const q = JSON.parse(raw), allowed = new Set(images.map(image => image.url));
    if (q.version !== 1 || !Number.isInteger(q.seed) || !Array.isArray(q.order) || q.order.length !== QUEST_TOTAL || new Set(q.order).size !== QUEST_TOTAL || !q.order.every(url => allowed.has(url))) return null;
    if (!Array.isArray(q.cleared) || new Set(q.cleared).size !== q.cleared.length || !q.cleared.every(url => allowed.has(url))) return null;
    if (q.redeemed !== null && (q.cleared.length !== QUEST_TOTAL || !allowed.has(q.redeemed))) return null;
    const purchases = q.hintPurchases || [];
    if (!Array.isArray(purchases) || new Set(purchases).size !== purchases.length || !purchases.every(id => typeof id === 'string' && id.length >= 8 && id.length <= 100)) return null;
    if (purchases.length * LOCK_COST + (q.redeemed ? QUEST_TOTAL : 0) > q.cleared.length) return null;
    return q;
  } catch { return null; }
}

export function stageCards(q) {
  const removed = new Set(q.cleared);
  const first = q.order.findIndex(url => !removed.has(url));
  if (first < 0) return { stage: Math.ceil(QUEST_TOTAL / PAIRS_PER_STAGE), cards: [], target: null };
  const stage = Math.floor(first / PAIRS_PER_STAGE);
  let seed = q.seed + stage * 7919;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const full = shuffle(q.order.slice(stage * PAIRS_PER_STAGE, (stage + 1) * PAIRS_PER_STAGE).flatMap(url => [
    { id: `${url}:a`, url }, { id: `${url}:b`, url },
  ]), random).map((card, slot) => ({ ...card, slot, dx: random() - .5, dy: random() - .5, depth: random() * 3 }));
  const cards = full.filter(card => !removed.has(card.url));
  const target = [...cards].sort((a, b) => b.depth - a.depth)[0];
  return { stage, cards, target };
}

export function matchQuest(q, firstId, secondId) {
  const { cards, target } = stageCards(q);
  const first = cards.find(card => card.id === firstId), second = cards.find(card => card.id === secondId);
  if (!first || !second || first.id === second.id || first.id !== target.id || first.url !== second.url || q.cleared.includes(first.url)) return q;
  return { ...q, cleared: [...q.cleared, first.url] };
}

export function redeemQuest(q, url) {
  if ((!q.redeemed && questBalance(q) < QUEST_TOTAL) || q.cleared.length !== QUEST_TOTAL || !q.order.includes(url) || (q.redeemed && q.redeemed !== url)) return q;
  return { ...q, redeemed: url };
}

// The live game uses actual world-space gallery cards, never stage/grid slots.
export function matchGalleryCards(q, first, second) {
  if (!first || !second || first.id === second.id || first.url !== second.url || !q.order.includes(first.url) || q.cleared.includes(first.url)) return q;
  return { ...q, cleared: [...q.cleared, first.url] };
}

export function nearestGalleryCard(cards, origin, q) {
  const allowed = new Set(q.order), removed = new Set(q.cleared);
  let nearest = null, distance = Infinity;
  for (const card of cards) {
    if (!allowed.has(card.url) || removed.has(card.url)) continue;
    const d = (card.px - origin.px) ** 2 + (card.py - origin.py) ** 2 + (card.pz - origin.pz) ** 2;
    if (d < distance || (d === distance && card.id < nearest.id)) { nearest = card; distance = d; }
  }
  return nearest;
}

export function searchSeparation(progress = 0) {
  return 85 + Math.min(3, Math.floor(Math.max(0, progress) / 55)) * 15;
}

export function companionCard(target, { seed = 0, progress = 0 } = {}) {
  // Stable world-space search location: dragging/resizing never moves the answer.
  // Restart uses a new seed; each target varies direction, depth and apparent size.
  let state = 2166136261;
  for (const char of target.id + '|' + seed + '|' + progress) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const angle = random() * Math.PI * 2;
  const radius = searchSeparation(progress) + 20 + random() * 35;
  const depth = 25 + random() * 50;
  const ratio = .8 + random() * .25;
  return { ...target, id: `mate:${target.id}`, px: target.px + Math.cos(angle) * radius, py: target.py + Math.sin(angle) * radius, pz: target.pz - depth, size: target.size * ratio, scaleX: target.scaleX * ratio, scaleY: target.scaleY * ratio };
}

export function hideGalleryCard(game, card) {
  if (!game?.active) return false;
  // Only completed pairs disappear. Never hide unplayed original cards.
  return game.quest.cleared.includes(card.url);
}

export function populateGalleryCell(base, cell, active, cellSize, imageSize) {
  if (!active || !cell.crowded) return base;
  let seed = 2166136261;
  for (const char of cell.cx + ',' + cell.cy + ',' + cell.cz) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const extra = Array.from({ length: 12 }, (_, i) => ({
    id: 'search-fill:' + cell.cx + ',' + cell.cy + ',' + cell.cz + ':' + i,
    px: (cell.cx + random()) * cellSize,
    py: (cell.cy + random()) * cellSize,
    pz: (cell.cz + random()) * cellSize,
    size: imageSize * (.75 + random() * .65),
    imageIndex: Math.floor(random() * 1000000)
  }));
  return [...base, ...extra];
}

export function galleryMedia(info, images, remaining, game) {
  const original = images[info.imageIndex % images.length];
  // Fillers use only remaining personal works, so the search stays populated
  // without bringing back cleared pictures or creating unplayable sample cards.
  if (game?.active && info.id.startsWith('search-fill:')) return remaining[info.imageIndex % remaining.length];
  // Existing sample slots remain visible and playable in game; restore on close.
  if (game?.active && original && !game.quest.order.includes(original.url)) return remaining[info.imageIndex % remaining.length];
  return original;
}

export function companionDirection(camera, mate) {
  const dx = mate.px - camera.x, dy = mate.py - camera.y;
  const horizontal = Math.abs(dx) < 16 ? '中间' : dx > 0 ? '右侧' : '左侧';
  const vertical = Math.abs(dy) < 16 ? '' : dy > 0 ? '偏上' : '偏下';
  return '方向提示：另一张在当前视野的' + horizontal + vertical +
    (mate.pz < camera.z - 55 ? '、更深处。滚轮向前探索，拖动调整视角。' : mate.pz > camera.z ? '、身后。滚轮向后退，再拖动寻找。' : '附近。拖动视角仔细寻找。');
}

export function galleryFocusDistance(target, aspect) {
  return Math.max(4.3, 3 / aspect) * Math.max(target.scaleX, target.scaleY);
}

export function galleryCardStatus(game, card, fallback = 'card') {
  if (!game?.active) return 'card';
  if (game.pending === card.url) return 'removing';
  if (game.picked?.id === card.id) return 'picked';
  if (game.target?.id === card.id) return 'target';
  return fallback;
}
