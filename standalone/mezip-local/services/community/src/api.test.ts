import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal, JsonObject } from '@me-zip/shared-types';

import {
  CommunityApiAdapter,
  type CommunityApiResponse,
} from './api.js';
import { CommunityService, InMemoryCommunityEntitlements } from './index.js';

const owner: AuthenticatedPrincipal = {
  userId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000011',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};
const member: AuthenticatedPrincipal = {
  userId: '00000000-0000-4000-8000-000000000002',
  sessionId: '00000000-0000-4000-8000-000000000022',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};

function adapter(): CommunityApiAdapter {
  const entitlements = new InMemoryCommunityEntitlements({
    now: () => new Date('2026-08-17T12:00:00.000Z'),
  });
  entitlements.set(owner.userId, { planCode: 'GO' });
  entitlements.set(member.userId, { planCode: 'GO' });
  return new CommunityApiAdapter(
    new CommunityService({
      entitlements,
      runtime: { now: () => '2026-08-17T12:00:00.000Z', id: (() => {
        let sequence = 0;
        return () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
      })() },
    }),
  );
}

function data<T>(response: CommunityApiResponse): T {
  return response.body.data as T;
}

describe('Phase 4 Community API adapter', () => {
  it('derives author identity from the authenticated principal, not JSON fields', () => {
    const api = adapter();
    const response = api.handle({
      method: 'POST',
      path: '/v1/community/posts',
      principal: owner,
      body: {
        authorId: member.userId,
        ownerId: member.userId,
        body: 'server derives this author',
        visibility: 'COMMUNITY',
        idempotencyKey: 'api-post-1',
      },
    });
    expect(response.status).toBe(201);
    expect(data<{ readonly authorId: string }>(response).authorId).toBe(owner.userId);
  });

  it('validates direct-share recipient IDs and does not accept them as arbitrary strings', () => {
    const api = adapter();
    const invalid = api.handle({
      method: 'POST',
      path: '/v1/community/posts',
      principal: owner,
      body: {
        body: 'bad recipient',
        visibility: 'DIRECT_SHARE',
        directShareRecipientIds: ['not-a-uuid'],
      },
    });
    expect(invalid.status).toBe(400);

    const valid = api.handle({
      method: 'POST',
      path: '/v1/community/posts',
      principal: owner,
      body: {
        body: 'private recipient',
        visibility: 'DIRECT_SHARE',
        directShareRecipientIds: [member.userId],
        idempotencyKey: 'api-direct-1',
      },
    });
    expect(valid.status).toBe(201);
  });

  it('returns a fixed safe error message instead of internal exception text', () => {
    const api = adapter();
    const response = api.handle({
      method: 'POST',
      path: '/v1/community/groups',
      principal: owner,
      body: {
        name: 'not allowed for ordinary GO',
      } as JsonObject,
    });
    expect(response.status).toBe(403);
    expect(response.body.error).toMatchObject({
      code: 'FORBIDDEN',
      message: 'This Community resource is not available to this principal.',
    });
    expect(JSON.stringify(response.body)).not.toContain('group-create');
  });

  it('resolves the self profile alias from the trusted principal', () => {
    const api = adapter();
    const response = api.handle({
      method: 'GET',
      path: '/v1/community/users/self',
      principal: owner,
    });
    expect(response.status).toBe(200);
    expect(data<{ readonly userId: string }>(response).userId).toBe(owner.userId);
  });

  it('routes strict, idempotent quote and repost mutations without accepting client ownership', () => {
    const api = adapter();
    const original = api.handle({
      method: 'POST',
      path: '/v1/community/posts',
      principal: owner,
      body: { body: 'A public post', visibility: 'PUBLIC', idempotencyKey: 'api-public-post' },
    });
    const postId = data<{ readonly id: string }>(original).id;
    const quote = api.handle({
      method: 'POST',
      path: `/v1/community/posts/${postId}/quote`,
      principal: member,
      body: { commentary: 'My quote', ownerId: owner.userId },
      idempotencyKey: 'api-quote-1',
    });
    expect(quote.status).toBe(400);

    const created = api.handle({
      method: 'POST',
      path: `/v1/community/posts/${postId}/quote`,
      principal: member,
      body: { commentary: 'My quote' },
      idempotencyKey: 'api-quote-2',
    });
    expect(created.status).toBe(201);
    expect(data<{ readonly authorId: string }>(created).authorId).toBe(member.userId);

    const first = api.handle({ method: 'PUT', path: `/v1/community/posts/${postId}/repost`, principal: member, idempotencyKey: 'api-repost-1' });
    const second = api.handle({ method: 'PUT', path: `/v1/community/posts/${postId}/repost`, principal: member, idempotencyKey: 'api-repost-2' });
    expect(first.status).toBe(201);
    expect(data<{ readonly repostCount: number }>(first).repostCount).toBe(1);
    expect(data<{ readonly repostCount: number }>(second).repostCount).toBe(1);
    const undo = api.handle({ method: 'DELETE', path: `/v1/community/posts/${postId}/repost`, principal: member, idempotencyKey: 'api-repost-undo' });
    expect(undo.status).toBe(200);
    expect(data<{ readonly reposted: boolean; readonly repostCount: number }>(undo)).toEqual(
      expect.objectContaining({ reposted: false, repostCount: 0 }),
    );
  });
});
