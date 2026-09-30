import { describe, expect, it } from 'vitest';

import { initialAuthState, maskIdentifier, reduceAuthState } from './authModel.js';

describe('auth state machine', () => {
  it('moves from provider selection to a single-use OTP state', () => {
    const selected = reduceAuthState(initialAuthState, {
      type: 'SELECT_PROVIDER',
      provider: 'EMAIL',
    });
    const sent = reduceAuthState(selected, {
      type: 'OTP_SENT',
      challengeId: 'challenge-1',
      identifier: 'person@example.com',
      cooldownSeconds: 30,
    });

    expect(sent.kind).toBe('OTP_SENT');
    expect(sent.challengeId).toBe('challenge-1');
    expect(sent.cooldownSeconds).toBe(30);
  });

  it('keeps security failure states explicit', () => {
    const invalid = reduceAuthState(initialAuthState, {
      type: 'OTP_INVALID',
      attempts: 4,
    });
    expect(invalid.kind).toBe('OTP_INVALID');
    expect(invalid.attempts).toBe(4);
    expect(reduceAuthState(invalid, { type: 'TOO_MANY_ATTEMPTS' }).kind).toBe(
      'TOO_MANY_ATTEMPTS',
    );
    expect(reduceAuthState(invalid, { type: 'SESSION_EXPIRED' }).kind).toBe(
      'SESSION_EXPIRED',
    );
  });

  it('masks identifiers before they reach UI copy', () => {
    expect(maskIdentifier('person@example.com')).toBe('pe***@example.com');
    expect(maskIdentifier('13800138000')).toBe('138****00');
  });

  it('clears a pending challenge when the user returns to login choices', () => {
    const pending = reduceAuthState(initialAuthState, {
      type: 'OTP_SENT',
      challengeId: 'challenge-1',
      identifier: 'person@example.com',
      cooldownSeconds: 30,
    });

    expect(reduceAuthState(pending, { type: 'RESET' })).toEqual(initialAuthState);
  });
});
