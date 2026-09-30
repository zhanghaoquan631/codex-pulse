import { describe, expect, it } from 'vitest';

import { calculateActiveSeconds, cnyFenToDisplay } from './index.js';

describe('archive utilities', () => {
  it('subtracts idle time without deleting the session', () => {
    expect(calculateActiveSeconds(new Date(0), new Date(60_000), 180)).toBe(0);
  });

  it('formats only integer fen amounts', () => {
    expect(cnyFenToDisplay(4_000)).toBe('¥40.00');
    expect(() => cnyFenToDisplay(19.9)).toThrow();
  });
});
