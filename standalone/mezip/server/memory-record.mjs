// Suggested replacement for validMemory. Not installed in the site checkout.
// The current game uses only these 225 public archive images, never uploads.
export const memoryImageAllowlist = new Set([
  ...Array.from({ length: 75 }, (_, i) => `/media/wechat-cards-20260827/card-${String(i + 1).padStart(3, '0')}.png`),
  ...Array.from({ length: 89 }, (_, i) => `/media/gallery-rewards/wechat-0051/wechat-0051-${String(i + 1).padStart(3, '0')}.jpg`),
  ...Array.from({ length: 56 }, (_, i) => `/media/gallery-rewards/wechat-0327/wechat-0327-${String(i + 1).padStart(3, '0')}.jpg`),
  ...Array.from({ length: 5 }, (_, i) => `/media/personal-drift-wall/${String(i + 1).padStart(3, '0')}.webp`),
])

export function normalizeMemoryRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  if (!Array.isArray(input.cards) || input.cards.length !== 16 || !Array.isArray(input.matched)) return null
  if (!Number.isSafeInteger(input.moves) || input.moves < 0 || input.moves > 100_000) return null
  if (!Number.isSafeInteger(input.seconds) || input.seconds < 0 || input.seconds > 8_640_000) return null
  const ids = new Set(), pairs = new Map(), cards = []
  for (const card of input.cards) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) return null
    if (!Number.isInteger(card.pair) || card.pair < 0 || card.pair > 7) return null
    if (typeof card.id !== 'string' || !new RegExp(`^${card.pair}-[ab]$`).test(card.id) || ids.has(card.id)) return null
    if (typeof card.src !== 'string' || !memoryImageAllowlist.has(card.src)) return null
    ids.add(card.id)
    const pair = pairs.get(card.pair) || []
    pair.push(card.src)
    pairs.set(card.pair, pair)
    cards.push({ id: card.id, pair: card.pair, src: card.src })
  }
  if (pairs.size !== 8 || [...pairs.values()].some(pair => pair.length !== 2 || pair[0] !== pair[1])) return null
  if (new Set([...pairs.values()].map(pair => pair[0])).size !== 8) return null
  const matched = new Set(input.matched)
  if (matched.size !== input.matched.length || matched.size % 2 || input.matched.some(id => !ids.has(id))) return null
  for (const pair of pairs.keys()) {
    if (matched.has(`${pair}-a`) !== matched.has(`${pair}-b`)) return null
  }
  if (typeof input.won !== 'boolean' || input.won !== (matched.size === 16)) return null
  if (input.moves < matched.size / 2) return null
  // Only these properties are stored. Unknown input fields never reach D1.
  return { cards, matched: [...matched], moves: input.moves, seconds: input.seconds, won: input.won }
}
