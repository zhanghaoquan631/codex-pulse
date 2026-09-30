import { describe, expect, it } from 'vitest';

import {
  AuthApi,
  AuthError,
  AuthService,
  MockEmailDeliveryWebhookAdapter,
  canUseBreakGlass,
  createDevAuthAdapters,
} from './index.js';

describe('Break-Glass policy gate', () => {
  it('does not treat a platform role as enough to inspect private content', () => {
    expect(
      canUseBreakGlass({
        role: 'SUPER_ADMIN',
        recentReauthentication: false,
        reason: 'Credible safety investigation',
        now: new Date('2026-08-16T00:00:00Z'),
        expiresAt: new Date('2026-08-16T00:30:00Z'),
      }),
    ).toBe(false);
  });
});

function createHarness() {
  let current = new Date('2026-08-16T00:00:00.000Z');
  const adapters = createDevAuthAdapters();
  const service = new AuthService({
    secret: 'unit-test-secret-that-is-not-a-production-key',
    now: () => new Date(current),
    otpAdapters: { PHONE: adapters.phone, EMAIL: adapters.email },
    externalAdapters: {
      WECHAT: adapters.wechat,
      GOOGLE: adapters.google,
      APPLE: adapters.apple,
    },
    otpCooldownMs: 0,
    accessTtlMs: 1_000,
  });
  return {
    service,
    adapters,
    consent: { termsVersion: '2026-08', privacyVersion: '2026-08' },
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
  };
}

describe('Phase 1 identity and authentication foundation', () => {
  it('tracks monotonic email delivery states in the local webhook adapter', async () => {
    const adapter = new MockEmailDeliveryWebhookAdapter();
    await adapter.handle({
      providerMessageId: 'message-1',
      status: 'QUEUED',
      occurredAt: new Date('2026-08-16T00:00:00.000Z'),
    });
    await adapter.handle({
      providerMessageId: 'message-1',
      status: 'SENT',
      occurredAt: new Date('2026-08-16T00:00:01.000Z'),
    });
    await adapter.handle({
      providerMessageId: 'message-1',
      status: 'DELIVERED',
      occurredAt: new Date('2026-08-16T00:00:02.000Z'),
    });
    expect(adapter.getStatus('message-1')).toBe('DELIVERED');
    await expect(
      adapter.handle({
        providerMessageId: 'message-1',
        status: 'FAILED',
        occurredAt: new Date('2026-08-16T00:00:03.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('fails closed when production has no injected auth secret', () => {
    expect(() => new AuthService({ environment: 'production' })).toThrow(
      'production auth secret',
    );
  });

  it('creates one unified user from an email OTP and stores no OTP in the result', async () => {
    const harness = createHarness();
    const challenge = await harness.service.startOtp({
      provider: 'EMAIL',
      identifier: 'User@QQ.com',
    });
    const code = harness.adapters.email.getCode(challenge.challengeId);
    expect(code).toMatch(/^\d{6}$/);
    const result = await harness.service.verifyOtp({
      challengeId: challenge.challengeId,
      code: code ?? '',
      consent: harness.consent,
    });

    expect(result.user.id).toBe(result.identity.userId);
    expect(result.identity.provider).toBe('EMAIL');
    expect(result.identity.subject).toBe('u***@qq.com');
    expect(result.accessToken).not.toContain(code ?? 'never');
    expect(harness.service.authenticateAccessToken(result.accessToken).userId).toBe(
      result.user.id,
    );
  });

  it('enforces OTP expiration, one-time replay, and attempt locking', async () => {
    const harness = createHarness();
    const expired = await harness.service.startOtp({
      provider: 'PHONE',
      identifier: '+8613800138000',
    });
    harness.advance(5 * 60 * 1_000 + 1);
    await expect(
      harness.service.verifyOtp({
        challengeId: expired.challengeId,
        code: '000000',
        consent: harness.consent,
      }),
    ).rejects.toMatchObject({ code: 'OTP_EXPIRED' });

    const challenge = await harness.service.startOtp({
      provider: 'PHONE',
      identifier: '+8613800138001',
    });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        harness.service.verifyOtp({
          challengeId: challenge.challengeId,
          code: '000000',
          consent: harness.consent,
        }),
      ).rejects.toMatchObject({ code: 'OTP_INVALID' });
    }
    await expect(
      harness.service.verifyOtp({
        challengeId: challenge.challengeId,
        code: '000000',
        consent: harness.consent,
      }),
    ).rejects.toMatchObject({ code: 'OTP_TOO_MANY_ATTEMPTS' });

    const valid = await harness.service.startOtp({
      provider: 'PHONE',
      identifier: '+8613800138002',
    });
    const validCode = harness.adapters.phone.getCode(valid.challengeId) ?? '';
    await harness.service.verifyOtp({
      challengeId: valid.challengeId,
      code: validCode,
      consent: harness.consent,
    });
    await expect(
      harness.service.verifyOtp({
        challengeId: valid.challengeId,
        code: validCode,
        consent: harness.consent,
      }),
    ).rejects.toMatchObject({ code: 'OTP_REPLAY' });
  });

  it('enforces resend cooldown and IP rate limits before delivery', async () => {
    const current = new Date('2026-08-16T00:00:00.000Z');
    const adapters = createDevAuthAdapters();
    const service = new AuthService({
      secret: 'rate-limit-test-secret',
      now: () => new Date(current),
      otpAdapters: { EMAIL: adapters.email, PHONE: adapters.phone },
      otpCooldownMs: 60_000,
      otpIpLimit: 2,
    });
    await service.startOtp({
      provider: 'EMAIL',
      identifier: 'cooldown@example.com',
      ipAddress: '198.51.100.10',
    });
    await expect(
      service.startOtp({
        provider: 'EMAIL',
        identifier: 'cooldown@example.com',
        ipAddress: '198.51.100.10',
      }),
    ).rejects.toMatchObject({ code: 'OTP_COOLDOWN' });
    await expect(
      service.startOtp({
        provider: 'EMAIL',
        identifier: 'different@example.com',
        ipAddress: '198.51.100.10',
      }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('rotates refresh tokens and revokes a session on replay', async () => {
    const harness = createHarness();
    const challenge = await harness.service.startOtp({
      provider: 'EMAIL',
      identifier: 'rotate@example.com',
    });
    const result = await harness.service.verifyOtp({
      challengeId: challenge.challengeId,
      code: harness.adapters.email.getCode(challenge.challengeId) ?? '',
      platform: 'WECHAT_MINIPROGRAM',
      deviceLabel: 'Test device',
      consent: harness.consent,
    });
    const rotated = await harness.service.refresh(result.refreshToken);
    expect(rotated.refreshToken).not.toBe(result.refreshToken);
    await expect(harness.service.refresh(result.refreshToken)).rejects.toMatchObject({
      code: 'SESSION_REPLAYED',
    });
    expect(() =>
      harness.service.authenticateAccessToken(rotated.accessToken),
    ).toThrowError(expect.objectContaining({ code: 'SESSION_REVOKED' }));
  });

  it('supports verified recovery and logout-all device revocation', async () => {
    const harness = createHarness();
    const firstChallenge = await harness.service.startOtp({
      provider: 'EMAIL',
      identifier: 'recovery@example.com',
    });
    const first = await harness.service.verifyOtp({
      challengeId: firstChallenge.challengeId,
      code: harness.adapters.email.getCode(firstChallenge.challengeId) ?? '',
      consent: harness.consent,
    });
    const recoveryChallenge = await harness.service.startOtp({
      provider: 'EMAIL',
      identifier: 'recovery@example.com',
      purpose: 'RECOVERY',
      userId: first.user.id,
    });
    const recovered = await harness.service.verifyOtp({
      challengeId: recoveryChallenge.challengeId,
      code: harness.adapters.email.getCode(recoveryChallenge.challengeId) ?? '',
      userId: first.user.id,
    });
    expect(recovered.user.id).toBe(first.user.id);
    const secondChallenge = await harness.service.startOtp({
      provider: 'EMAIL',
      identifier: 'recovery@example.com',
    });
    const second = await harness.service.verifyOtp({
      challengeId: secondChallenge.challengeId,
      code: harness.adapters.email.getCode(secondChallenge.challengeId) ?? '',
      consent: harness.consent,
    });
    expect(harness.service.logoutAll(first.user.id)).toBe(3);
    expect(() =>
      harness.service.authenticateAccessToken(recovered.accessToken),
    ).toThrow(AuthError);
    expect(() => harness.service.authenticateAccessToken(second.accessToken)).toThrow(
      AuthError,
    );
  });

  it('does not merge external identities by matching an email-like string', async () => {
    const harness = createHarness();
    harness.adapters.google.register('google-a', 'subject-a', 'A');
    harness.adapters.wechat.register('wechat-a', 'subject-a', 'A');
    const google = await harness.service.authenticateExternal({
      provider: 'GOOGLE',
      credential: 'google-a',
      consent: harness.consent,
    });
    const wechat = await harness.service.authenticateExternal({
      provider: 'WECHAT',
      credential: 'wechat-a',
      consent: harness.consent,
    });
    expect(google.user.id).not.toBe(wechat.user.id);
  });

  it('requires a second verified identity before unlinking the first', async () => {
    const harness = createHarness();
    const first = await harness.service.startOtp({
      provider: 'EMAIL',
      identifier: 'link@example.com',
    });
    const account = await harness.service.verifyOtp({
      challengeId: first.challengeId,
      code: harness.adapters.email.getCode(first.challengeId) ?? '',
      consent: harness.consent,
    });
    expect(() =>
      harness.service.unlinkIdentity(account.user.id, account.identity.id),
    ).toThrowError(expect.objectContaining({ code: 'LAST_IDENTITY' }));

    const second = await harness.service.startOtp({
      provider: 'PHONE',
      identifier: '+8613800138099',
      purpose: 'LINK_IDENTITY',
      userId: account.user.id,
    });
    const linked = await harness.service.linkOtpIdentity({
      userId: account.user.id,
      challengeId: second.challengeId,
      code: harness.adapters.phone.getCode(second.challengeId) ?? '',
    });
    expect(linked.provider).toBe('PHONE');
    harness.service.unlinkIdentity(account.user.id, account.identity.id);
    expect(harness.service.listIdentities(account.user.id)).toHaveLength(1);
  });

  it('records consent and revokes sessions when deletion is requested', async () => {
    const harness = createHarness();
    const challenge = await harness.service.startOtp({
      provider: 'EMAIL',
      identifier: 'delete@example.com',
    });
    const account = await harness.service.verifyOtp({
      challengeId: challenge.challengeId,
      code: harness.adapters.email.getCode(challenge.challengeId) ?? '',
      consent: { termsVersion: '2026-08', privacyVersion: '2026-08' },
    });
    expect(harness.service.getConsent(account.user.id)?.privacyVersion).toBe('2026-08');
    const request = harness.service.requestAccountDeletion({
      userId: account.user.id,
      gracePeriodMs: 0,
    });
    expect(request.status).toBe('REQUESTED');
    expect(harness.service.listSessions(account.user.id)[0]?.revokedAt).not.toBeNull();
    expect(() => harness.service.authenticateAccessToken(account.accessToken)).toThrow(
      AuthError,
    );
  });

  it('requires consent for a first session and keeps AuthApi session actions owner-scoped', async () => {
    const harness = createHarness();
    const first = await harness.service.startOtp({
      provider: 'EMAIL',
      identifier: 'consent@example.com',
    });
    await expect(
      harness.service.verifyOtp({
        challengeId: first.challengeId,
        code: harness.adapters.email.getCode(first.challengeId) ?? '',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const retried = await harness.service.verifyOtp({
      challengeId: first.challengeId,
      code: harness.adapters.email.getCode(first.challengeId) ?? '',
      consent: harness.consent,
    });
    expect(retried.user.id).toBeTruthy();

    const accountAChallenge = await harness.service.startOtp({
      provider: 'EMAIL',
      identifier: 'a@example.com',
    });
    const accountA = await harness.service.verifyOtp({
      challengeId: accountAChallenge.challengeId,
      code: harness.adapters.email.getCode(accountAChallenge.challengeId) ?? '',
      consent: harness.consent,
    });
    const accountBChallenge = await harness.service.startOtp({
      provider: 'EMAIL',
      identifier: 'b@example.com',
    });
    const accountB = await harness.service.verifyOtp({
      challengeId: accountBChallenge.challengeId,
      code: harness.adapters.email.getCode(accountBChallenge.challengeId) ?? '',
      consent: harness.consent,
    });
    const api = new AuthApi(harness.service);
    const consentResponse = api.recordConsent(
      {
        requestId: 'request-consent',
        principal: harness.service.authenticateAccessToken(accountA.accessToken),
      },
      { termsVersion: '2026-09', privacyVersion: '2026-09' },
    );
    expect(consentResponse).toMatchObject({
      data: { userId: accountA.user.id, termsVersion: '2026-09' },
    });
    const unauthenticatedById = api.logout(
      { requestId: 'request-unauthenticated' },
      { sessionId: accountB.session.id, refreshToken: accountB.refreshToken },
    );
    expect(unauthenticatedById).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
    const response = api.logout(
      {
        requestId: 'request-1',
        principal: harness.service.authenticateAccessToken(accountA.accessToken),
      },
      { sessionId: accountB.session.id },
    );
    expect(response).toMatchObject({ error: { code: 'SESSION_NOT_FOUND' } });
    expect(harness.service.authenticateAccessToken(accountB.accessToken).userId).toBe(
      accountB.user.id,
    );
  });
});
