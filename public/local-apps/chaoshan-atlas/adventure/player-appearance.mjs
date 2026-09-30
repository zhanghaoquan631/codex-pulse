/** Cosmetic character choices. These never alter combat or movement stats. */
export const DEFAULT_APPEARANCE = 'traveler';

export const APPEARANCES = Object.freeze([
  Object.freeze({
    id: 'traveler',
    name: '红巾旅人',
    description: '原来的纸笔旅人，红巾随行。',
  }),
]);

/** Old saves and malformed ids retain the original playable character. */
export function normalizeAppearance(id) {
  return APPEARANCES.some(appearance => appearance.id === id) ? id : DEFAULT_APPEARANCE;
}
