import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import { CommunityApiAdapter } from '../../services/community/src/api.js';
import { CommunityService, InMemoryCommunityEntitlements } from '../../services/community/src/index.js';

const owner: AuthenticatedPrincipal = {
  userId: '00000000-0000-4000-8000-000000000101',
  sessionId: '00000000-0000-4000-8000-000000000111',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};
const goViewer: AuthenticatedPrincipal = {
  userId: '00000000-0000-4000-8000-000000000102',
  sessionId: '00000000-0000-4000-8000-000000000112',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};
const freeViewer: AuthenticatedPrincipal = {
  userId: '00000000-0000-4000-8000-000000000103',
  sessionId: '00000000-0000-4000-8000-000000000113',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};

function service(): CommunityService {
  const entitlements = new InMemoryCommunityEntitlements({
    now: () => new Date('2026-08-17T12:00:00.000Z'),
  });
  entitlements.set(owner.userId, { planCode: 'GO' });
  entitlements.set(goViewer.userId, { planCode: 'GO' });
  entitlements.set(freeViewer.userId, { planCode: 'FREE' });
  return new CommunityService({
    entitlements,
    runtime: {
      now: () => '2026-08-17T12:00:00.000Z',
      id: (() => {
        let sequence = 0;
        return () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
      })(),
    },
  });
}

describe('Phase 4 Community integration boundary', () => {
  it('keeps FREE public browse separate from GO interaction visibility', () => {
    const community = service();
    const publicPost = community.createPost(owner, {
      body: 'explicitly public',
      visibility: 'PUBLIC',
      idempotencyKey: 'public-1',
    });
    const communityPost = community.createPost(owner, {
      body: 'GO community content',
      visibility: 'COMMUNITY',
      idempotencyKey: 'community-1',
    });

    expect(community.getPost(freeViewer, publicPost.id).id).toBe(publicPost.id);
    expect(() => community.getPost(freeViewer, communityPost.id)).toThrow();
    expect(community.getPost(goViewer, communityPost.id).id).toBe(communityPost.id);
  });

  it('keeps direct-share visibility recipient-scoped through the API boundary', () => {
    const community = service();
    const api = new CommunityApiAdapter(community);
    const response = api.handle({
      method: 'POST',
      path: '/v1/community/posts',
      principal: owner,
      body: {
        body: 'recipient-only',
        visibility: 'DIRECT_SHARE',
        directShareRecipientIds: [goViewer.userId],
        idempotencyKey: 'direct-1',
      },
    });
    expect(response.status).toBe(201);
    const postId = (response.body.data as { readonly id: string }).id;
    expect(community.getPost(goViewer, postId).id).toBe(postId);
    expect(() => community.getPost(freeViewer, postId)).toThrow();
  });

  it('resolves self profile through the trusted adapter principal', () => {
    const api = new CommunityApiAdapter(service());
    const response = api.handle({ method: 'GET', path: '/v1/community/users/self', principal: owner });
    expect(response.status).toBe(200);
    expect((response.body.data as { readonly userId: string }).userId).toBe(owner.userId);
  });
});
