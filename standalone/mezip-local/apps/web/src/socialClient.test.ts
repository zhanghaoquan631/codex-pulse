import { describe, expect, it } from 'vitest';
import { socialClient } from './socialClient.js';

describe('social client boundary', () => {
  it('fails closed without an explicit API origin', async () => {
    const view = await socialClient.load();
    expect(view.availability).toBe('UNAVAILABLE');
    expect(view.accounts).toEqual([]);
    expect(view.archive.items).toEqual([]);
  });
});
