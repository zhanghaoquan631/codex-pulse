import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import { CommunityApiAdapter } from '../../services/community/src/api.js';
import {
  CommunityService,
  InMemoryCommunityEntitlements,
} from '../../services/community/src/index.js';

const alice: AuthenticatedPrincipal = {
  userId: '00000000-0000-4000-8000-000000000201',
  sessionId: '00000000-0000-4000-8000-000000000211',
  roles: ['USER'],
  issuedAt: '2026-08-20T00:00:00.000Z',
};
const bob: AuthenticatedPrincipal = {
  userId: '00000000-0000-4000-8000-000000000202',
  sessionId: '00000000-0000-4000-8000-000000000212',
  roles: ['USER'],
  issuedAt: '2026-08-20T00:00:00.000Z',
};
const carol: AuthenticatedPrincipal = {
  userId: '00000000-0000-4000-8000-000000000203',
  sessionId: '00000000-0000-4000-8000-000000000213',
  roles: ['USER'],
  issuedAt: '2026-08-20T00:00:00.000Z',
};

function makeApi(): CommunityApiAdapter {
  const entitlements = new InMemoryCommunityEntitlements({ now: () => new Date('2026-08-20T00:00:00.000Z') });
  for (const principal of [alice, bob, carol]) entitlements.set(principal.userId, { planCode: 'GO' });
  let sequence = 0;
  return new CommunityApiAdapter(new CommunityService({
    entitlements,
    runtime: {
      now: () => '2026-08-20T00:00:00.000Z',
      id: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    },
  }));
}

function body<T>(response: { readonly body: Readonly<Record<string, unknown>> }): T {
  return response.body.data as T;
}

describe('Phase 17 Social Quote/Repost integration', () => {
  it('creates a relationship-backed quote and fails closed after the source is deleted', () => {
    const api = makeApi();
    const original = api.handle({
      method: 'POST', path: '/v1/community/posts', principal: alice,
      body: { body: 'Published only; not a private Life original.', visibility: 'PUBLIC' },
      idempotencyKey: 'phase17-original',
    });
    const originalId = body<{ readonly id: string }>(original).id;
    const quote = api.handle({
      method: 'POST', path: `/v1/community/posts/${originalId}/quote`, principal: bob,
      body: { commentary: 'Bob adds his own commentary.' }, idempotencyKey: 'phase17-quote',
    });
    const quoteData = body<{ readonly id: string; readonly quote: { readonly state: string; readonly post?: { readonly id: string } } }>(quote);
    expect(quote.status).toBe(201);
    expect(quoteData.quote).toMatchObject({ state: 'AVAILABLE', post: { id: originalId } });

    api.handle({ method: 'DELETE', path: `/v1/community/posts/${originalId}`, principal: alice, idempotencyKey: 'phase17-delete' });
    const reread = api.handle({ method: 'GET', path: `/v1/community/posts/${quoteData.id}`, principal: bob });
    expect(body<{ readonly quote: unknown }>(reread).quote).toEqual({ state: 'UNAVAILABLE' });
    expect(JSON.stringify(reread.body)).not.toContain('Published only; not a private Life original.');
  });

  it('uses one server-side repost relationship, follows feed attribution, undo, and viewer isolation', () => {
    const api = makeApi();
    const original = api.handle({
      method: 'POST', path: '/v1/community/posts', principal: alice,
      body: { body: 'Public repost source', visibility: 'PUBLIC' }, idempotencyKey: 'phase17-repost-source',
    });
    const postId = body<{ readonly id: string }>(original).id;
    for (const key of ['one', 'two', 'three', 'four', 'five']) {
      const repost = api.handle({ method: 'PUT', path: `/v1/community/posts/${postId}/repost`, principal: bob, idempotencyKey: `phase17-repost-${key}` });
      expect(body<{ readonly repostCount: number }>(repost).repostCount).toBe(1);
    }
    api.handle({ method: 'PUT', path: `/v1/community/users/${bob.userId}/follow`, principal: carol, idempotencyKey: 'phase17-follow-bob' });
    const feed = api.handle({ method: 'GET', path: '/v1/community/feed', principal: carol, query: { mode: 'FOLLOWING' } });
    const items = body<{ readonly items: readonly { readonly id: string; readonly body: string; readonly repostedBy: { readonly author: { readonly userId: string } } | null }[] }>(feed).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: postId, body: 'Public repost source', repostedBy: { author: { userId: bob.userId } } });
    const aliceRead = api.handle({ method: 'GET', path: `/v1/community/posts/${postId}`, principal: alice });
    expect(body<{ readonly viewer: { readonly reposted: boolean } }>(aliceRead).viewer.reposted).toBe(false);

    const undo = api.handle({ method: 'DELETE', path: `/v1/community/posts/${postId}/repost`, principal: bob, idempotencyKey: 'phase17-undo' });
    expect(body<{ readonly reposted: boolean; readonly repostCount: number }>(undo)).toEqual(
      expect.objectContaining({ reposted: false, repostCount: 0 }),
    );
  });
});
