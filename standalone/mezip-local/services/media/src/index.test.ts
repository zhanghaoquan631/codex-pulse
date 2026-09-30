import { describe, expect, it } from 'vitest';

import { canIssueDownload, canTransitionMedia } from './index.js';

describe('media quarantine flow', () => {
  it('does not issue a download before scan approval', () => {
    expect(canTransitionMedia('QUARANTINE', 'PUBLISHED')).toBe(false);
    expect(canIssueDownload('APPROVED', true)).toBe(false);
    expect(canIssueDownload('PUBLISHED', true)).toBe(true);
  });
});
