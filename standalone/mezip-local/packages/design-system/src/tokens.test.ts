import { describe, expect, it } from 'vitest';

import { colors, motion } from './tokens.js';

describe('ME.zip design tokens', () => {
  it('keeps the frozen motion timings and archive canvas', () => {
    expect(motion).toEqual({ fast: 160, normal: 220, slow: 320 });
    expect(colors.canvas0).toBe('#080A0D');
  });
});
