import { describe, expect, it } from 'vitest';

import {
  canTransitionOrder,
  decideCapability,
  resolveCapabilities,
  verifyProviderAmount,
} from './index.js';

describe('payment safety contracts', () => {
  it('does not allow a callback to jump directly to fulfilled', () => {
    expect(canTransitionOrder('PENDING_PAYMENT', 'FULFILLED')).toBe(false);
    expect(canTransitionOrder('PAID', 'FULFILLED')).toBe(true);
  });

  it('rejects a client/provider amount mismatch', () => {
    expect(() => verifyProviderAmount(4_000, 2_000)).toThrow();
  });

  it('resolves additive capabilities without plan-name checks in callers', () => {
    const capabilities = resolveCapabilities(
      'PLUS',
      [],
      new Date('2026-08-16T00:00:00Z'),
    );
    expect(capabilities.has('ARCHIVE_PRIVATE')).toBe(true);
    expect(capabilities.has('COMMUNITY_POST')).toBe(true);
    expect(capabilities.has('FOUNDER_DM')).toBe(true);
    expect(capabilities.has('VIBE_CODING')).toBe(false);
  });

  it('applies only active, non-revoked Benefits grants', () => {
    const now = new Date('2026-08-16T00:00:00Z');
    const grant = {
      id: 'grant-1',
      userId: 'user-1',
      capability: 'VIBE_CODING' as const,
      source: 'TRIAL' as const,
      startsAt: '2026-08-15T00:00:00Z',
      endsAt: '2026-08-17T00:00:00Z',
      revokedAt: null,
      idempotencyKey: 'trial-1',
    };
    expect(decideCapability('VIBE_CODING', 'FREE', [grant], now)).toMatchObject({
      allowed: true,
      source: 'BENEFIT',
      expiresAt: grant.endsAt,
    });
    expect(
      decideCapability(
        'VIBE_CODING',
        'FREE',
        [{ ...grant, revokedAt: '2026-08-15T12:00:00Z' }],
        now,
      ).allowed,
    ).toBe(false);
  });
});
