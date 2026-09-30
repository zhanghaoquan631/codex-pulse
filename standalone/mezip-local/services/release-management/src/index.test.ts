import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { createReleaseManagementService, ReleaseManagementError } from './index.js';
const root: AuthenticatedPrincipal = {
  userId: 'root',
  sessionId: 'r',
  roles: ['ROOT'],
  issuedAt: '2026-08-20T00:00:00.000Z',
};
const alice: AuthenticatedPrincipal = {
  userId: 'alice',
  sessionId: 'a',
  roles: [],
  issuedAt: '2026-08-20T00:00:00.000Z',
};
const bob: AuthenticatedPrincipal = {
  userId: 'bob',
  sessionId: 'b',
  roles: [],
  issuedAt: '2026-08-20T00:00:00.000Z',
};
describe('Phase 25 release controls', () => {
  it('keeps tester cohorts separate from membership and account scoped', () => {
    const service = createReleaseManagementService();
    service.enroll(root, 'alice', 'BETA');
    service.acceptEnrollment(alice);
    expect(service.getOwnEnrollment(alice)?.channel).toBe('BETA');
    expect(service.getOwnEnrollment(bob)).toBeNull();
    expect(() => service.enroll(alice, 'bob', 'BETA')).toThrow('restricted');
  });
  it('uses a stable rollout bucket and prevents ordinary users entering an alpha flag', () => {
    const service = createReleaseManagementService();
    service.enroll(root, 'alice', 'ALPHA');
    service.acceptEnrollment(alice);
    service.setFlag(root, {
      key: 'social.posting',
      description: 'posting',
      enabled: true,
      environment: 'ALPHA',
      platform: 'WEB',
      releaseChannel: 'ALPHA',
      rolloutPercentage: 100,
      killSwitch: true,
    });
    expect(service.evaluate(alice, 'social.posting', 'ALPHA', 'WEB')).toEqual({
      enabled: true,
      reason: 'ENABLED',
    });
    expect(service.evaluate(bob, 'social.posting', 'ALPHA', 'WEB')).toEqual({
      enabled: false,
      reason: 'CHANNEL',
    });
  });
  it('makes maintenance a clear server-side stop and audits release control changes', () => {
    const service = createReleaseManagementService();
    service.setMaintenance(root, true);
    expect(service.evaluate(alice, 'missing', 'ALPHA', 'WEB')).toEqual({
      enabled: false,
      reason: 'DISABLED',
    });
    expect(service.listAudit(root).map((item) => item.action)).toContain(
      'maintenance_enabled',
    );
  });
  it('keeps feedback and telemetry free of sensitive private content', () => {
    const service = createReleaseManagementService();
    const feedback = service.submitFeedback(alice, {
      category: 'BUG',
      title: 'Timeline did not load',
      description: 'The list stopped rendering.',
      platform: 'WEB',
      appVersion: '0.25.0',
      buildNumber: 1,
      route: '/timeline',
    });
    expect(service.listFeedback(root)).toContainEqual(feedback);
    expect(() =>
      service.telemetry({
        name: 'error',
        platform: 'WEB',
        route: '/',
        appVersion: '0.25.0',
        buildNumber: 1,
        fields: { token: 'no' },
      }),
    ).toThrow(ReleaseManagementError);
  });
});
