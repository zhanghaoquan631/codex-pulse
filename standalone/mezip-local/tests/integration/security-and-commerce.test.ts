import { describe, expect, it } from 'vitest';

import { requireOwnedResource } from '../../services/api/src/index.js';
import {
  canTransitionOrder,
  verifyProviderAmount,
} from '../../services/payment/src/index.js';

const owner = {
  userId: '7c166b05-3668-4c2d-8b3a-04a51ca71bb1',
  sessionId: 'session-owner',
  roles: ['USER'],
  issuedAt: '2026-08-16T00:00:00.000Z',
} as const;

describe('Phase 0 integration boundaries', () => {
  it('keeps tenant ownership, money validation, and order transition checks together', () => {
    expect(
      requireOwnedResource(owner, {
        id: '045a4bb4-6d55-4dae-ae7c-769d17b4b0d5',
        ownerId: owner.userId,
      }).id,
    ).toBe('045a4bb4-6d55-4dae-ae7c-769d17b4b0d5');
    expect(canTransitionOrder('PENDING_PAYMENT', 'PAID')).toBe(true);
    expect(() => verifyProviderAmount(1_000, 1_001)).toThrow();
  });

  it('rejects a cross-user resource before any Phase 2 shell can present it', () => {
    expect(() =>
      requireOwnedResource(owner, {
        id: 'foreign-private-record',
        ownerId: '8c9bf5a6-9702-46d1-941b-3aa4404cba1c',
      }),
    ).toThrow();
  });
});
