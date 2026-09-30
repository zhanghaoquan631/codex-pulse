import { describe, expect, it } from 'vitest';
import { xCaptureEventInputSchema } from '@me-zip/schemas';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { XLocalCaptureApiAdapter } from './x-local-capture-api.js';
import { XLocalCaptureService } from './x-local-capture.js';

const principal: AuthenticatedPrincipal = { userId: 'capture-fixture-owner', sessionId: 'fixture', roles: ['USER'], issuedAt: '2026-09-28T00:00:00Z' };
const legacy = { actionType: 'like', platform: 'X', postUrl: 'https://x.com/fixture/status/2100000000000000001', profileUrl: null, profileName: '', capturedAt: '2026-09-28T09:00:00Z', source: 'LOCAL_CAPTURE', tags: ['X'] };

describe('legacy extension DOM hints', () => {
  it('reproduces the strict schema rejection behind queued browser actions', () => {
    const result = xCaptureEventInputSchema.safeParse(legacy);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'unrecognized_keys', keys: ['profileUrl', 'profileName'] })]));
  });

  it('accepts the two old DOM hints without changing event identity or requiring a new like', async () => {
    const service = new XLocalCaptureService();
    const api = new XLocalCaptureApiAdapter(service);
    for (const actionType of ['like', 'bookmark']) {
      const response = await api.handle({ method: 'POST', path: '/v1/x/local-capture/events', principal, body: { ...legacy, actionType } });
      expect(response.status).toBe(201);
    }
    const result = service.listTimeline(principal);
    expect(result.events.map((event) => event.actionType).sort()).toEqual(['bookmark', 'like']);
    expect(result.events.every((event) => event.userId === principal.userId)).toBe(true);
    expect(result.events[0]).not.toHaveProperty('profileUrl');
    expect(result.events[0]).not.toHaveProperty('profileName');
  });

  it('continues rejecting all other extra fields and invalid values', async () => {
    const service = new XLocalCaptureService();
    const api = new XLocalCaptureApiAdapter(service);
    for (const patch of [{ ownerId: 'other-owner' }, { arbitrary: true }, { postUrl: 'invalid' }, { actionType: 'invented' }]) {
      const response = await api.handle({ method: 'POST', path: '/v1/x/local-capture/events', principal, body: { ...legacy, ...patch } });
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
    expect(service.listTimeline(principal).events).toHaveLength(0);
  });

  it('keeps the authenticated principal gate for legacy payloads', async () => {
    const api = new XLocalCaptureApiAdapter(new XLocalCaptureService());
    expect((await api.handle({ method: 'POST', path: '/v1/x/local-capture/events', body: legacy })).status).toBe(401);
  });
});
