import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { XLocalCaptureApiAdapter } from './x-local-capture-api.js';
import { XLocalCaptureService } from './x-local-capture.js';

const principal: AuthenticatedPrincipal = { userId: 'visible-state-fixture', sessionId: 'fixture', roles: ['USER'], issuedAt: '2026-09-28T00:00:00Z' };
const postUrl = 'https://x.com/fixture/status/2100000000000000001';
const observation = { platform: 'X' as const, actionType: 'like' as const, postUrl, source: 'LOCAL_CAPTURE' as const, captureMethod: 'VISIBLE_STATE' as const, observedAt: '2026-09-28T10:00:00.000Z' };

describe('visible X active-state recovery', () => {
  it('accepts the real strict wire schema and labels observation time without inventing the original click time', async () => {
    const service = new XLocalCaptureService();
    const response = await new XLocalCaptureApiAdapter(service).handle({ method: 'POST', path: '/v1/x/local-capture/events', principal, body: { ...observation, capturedAt: '2026-01-01T00:00:00Z' } });
    expect(response.status).toBe(201);
    expect(service.listTimeline(principal).events[0]).toMatchObject({ captureMethod: 'VISIBLE_STATE', recovered: true, observedAt: observation.observedAt, capturedAt: observation.observedAt });
  });

  it('deduplicates already-active state across refreshes, renamed handles and media links', () => {
    const service = new XLocalCaptureService();
    const first = service.capture(principal, observation).event!;
    const retry = service.capture(principal, { ...observation, postUrl: 'https://twitter.com/renamed/status/2100000000000000001/photo/1?s=20', observedAt: '2026-09-29T10:00:00.000Z' });
    expect(retry.deduplicated).toBe(true);
    expect(retry.event?.id).toBe(first.id);
    expect(service.listTimeline(principal).events).toHaveLength(1);
  });

  it('preserves original explicit history and treats like and bookmark as independent states', () => {
    const service = new XLocalCaptureService();
    const first = service.capture(principal, { actionType: 'like', postUrl, capturedAt: '2026-09-15T10:00:00.000Z' }).event!;
    expect(service.capture(principal, observation).event?.id).toBe(first.id);
    const saved = service.capture(principal, { ...observation, actionType: 'bookmark' });
    expect(saved.deduplicated).toBe(false);
    expect(service.listTimeline(principal).events).toHaveLength(2);
    expect(service.listTimeline(principal).events.find((event) => event.id === first.id)?.capturedAt).toBe('2026-09-15T10:00:00.000Z');
  });

  it('recovers after a known cancellation but ignores an older queued observation after a newer cancellation', () => {
    const service = new XLocalCaptureService();
    service.capture(principal, { actionType: 'unlike', postUrl, capturedAt: '2026-09-28T09:00:00.000Z' });
    expect(service.capture(principal, observation).deduplicated).toBe(false);
    const cancellation = service.capture(principal, { actionType: 'unlike', postUrl, capturedAt: '2026-09-28T11:00:00.000Z' }).event!;
    expect(service.capture(principal, observation).event?.id).toBe(cancellation.id);
    expect(service.listTimeline(principal).events).toHaveLength(3);
  });

  it('rejects inferred negative states, non-content pages and missing observation timestamps', async () => {
    const service = new XLocalCaptureService();
    const api = new XLocalCaptureApiAdapter(service);
    for (const patch of [{ actionType: 'unlike' }, { actionType: 'viewed' }, { actionType: 'unbookmark' }, { platform: 'DOUYIN', postUrl: 'https://www.douyin.com/' }, { postUrl: 'https://x.com/home' }, { observedAt: undefined }, { observedAt: 'invalid' }]) {
      const response = await api.handle({ method: 'POST', path: '/v1/x/local-capture/events', principal, body: { ...observation, ...patch } });
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
    expect(service.listTimeline(principal).events).toHaveLength(0);
  });

  it.each([
    ['DOUYIN', 'https://www.douyin.com/video/123456789', 'https://www.douyin.com/user/fixture_one', 'https://www.douyin.com/user/fixture_two'],
    ['BILIBILI', 'https://www.bilibili.com/video/BV1234567890', 'https://space.bilibili.com/12345', 'https://space.bilibili.com/67890'],
  ] as const)('recovers %s and retains visible account identity without merging separate accounts', async (platform, url, firstProfile, secondProfile) => {
    const service = new XLocalCaptureService(), api = new XLocalCaptureApiAdapter(service);
    const input = {...observation, platform, postUrl: url, captureAccount: {profileUrl: firstProfile, displayName: '我的账号'}};
    expect((await api.handle({method: 'POST', path: '/v1/x/local-capture/events', principal, body: input})).status).toBe(201);
    expect(service.capture(principal, input).deduplicated).toBe(true);
    expect(service.capture(principal, {...input, captureAccount: {...input.captureAccount, profileUrl: secondProfile}}).deduplicated).toBe(false);
    expect(service.listTimeline(principal).events).toHaveLength(2);
    expect(() => service.capture(principal, {...input, captureAccount: {...input.captureAccount, profileUrl: 'https://evil.test/profile'}})).toThrow();
  });

  it('respects the existing user capture preferences and owner separation', () => {
    const service = new XLocalCaptureService();
    service.patchSettings(principal, { captureLikes: false });
    expect(service.capture(principal, observation).disabled).toBe(true);
    expect(service.capture({ ...principal, userId: 'separate-owner' }, observation).disabled).toBe(false);
    expect(service.listTimeline(principal).events).toHaveLength(0);
  });
});
