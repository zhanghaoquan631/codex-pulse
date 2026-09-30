import { describe, expect, it } from 'vitest';

import { AuthorizationError, requireOwnedResource } from './index.js';

const principal = {
  userId: '63f8a2d8-afeb-4cd0-88cc-0e7c4969d4f4',
  sessionId: 'session-a',
  roles: ['USER'],
  issuedAt: '2026-08-16T00:00:00.000Z',
} as const;

describe('tenant ownership boundary', () => {
  it('refuses a guessed record owned by another user', () => {
    expect(() =>
      requireOwnedResource(principal, {
        id: 'b8b5f3f2-1c77-462a-a265-10b2c0c2dd2b',
        ownerId: 'e9921ed4-c097-48df-b5d1-1d9a014008a1',
      }),
    ).toThrow(AuthorizationError);
  });
});
