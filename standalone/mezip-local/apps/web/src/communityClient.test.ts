import { describe, expect, it } from 'vitest';

import {
  ApiCommunityClient,
  type CommunityClient,
  type CommunityClientError,
  type CommunityResult,
  type CommunityTransport,
  UnavailableCommunityClient,
} from './communityClient.js';

const unavailableError: CommunityClientError = {
  code: 'SERVICE_UNAVAILABLE',
  message: 'not connected',
  retryable: true,
};

function unavailable<T>(): CommunityResult<T> {
  return { ok: false, source: 'UNAVAILABLE', error: unavailableError };
}

describe('Community client boundary', () => {
  it('fails closed when no approved Community service is configured', async () => {
    const client: CommunityClient = new UnavailableCommunityClient();

    const [feed, post, snapshot, activity] = await Promise.all([
      client.listFeed({ kind: 'LATEST', limit: 10 }),
      client.createPost({
        target: { kind: 'COMMUNITY' },
        body: 'this must not become local social data',
        visibility: 'COMMUNITY',
        idempotencyKey: 'post-1',
      }),
      client.publishSnapshot({
        target: { kind: 'COMMUNITY' },
        sourceEntryId: 'private-record',
        sourceRevision: 1,
        visibility: 'COMMUNITY',
        idempotencyKey: 'snapshot-1',
      }),
      client.changeActivityRegistration({
        activityId: 'activity-1',
        action: 'JOIN',
        idempotencyKey: 'activity-1',
      }),
    ]);

    for (const result of [feed, post, snapshot, activity]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.source).toBe('UNAVAILABLE');
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
      }
    }
  });

  it('keeps author and owner identity out of browser publish requests', async () => {
    const calls: Array<{
      readonly path: string;
      readonly method: string;
      readonly body: unknown;
      readonly idempotencyKey: string | undefined;
    }> = [];
    const transport: CommunityTransport = {
      async request<T>(input: {
        readonly path: string;
        readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
        readonly query?: Readonly<Record<string, string | number | undefined>>;
        readonly body?: unknown;
        readonly idempotencyKey?: string;
      }) {
        calls.push({
          path: input.path,
          method: input.method,
          body: input.body,
          idempotencyKey: input.idempotencyKey,
        });
        return unavailable<T>();
      },
    };
    const client = new ApiCommunityClient(transport);

    await client.publishSnapshot({
      target: { kind: 'CHANNEL', channelId: 'channel-1' },
      sourceEntryId: 'archive-42',
      sourceRevision: 7,
      visibility: 'PUBLIC',
      idempotencyKey: 'snapshot-42',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe('/v1/community/snapshots');
    expect(calls[0]?.body).toEqual({
      target: { kind: 'CHANNEL', channelId: 'channel-1' },
      sourceEntryId: 'archive-42',
      sourceRevision: 7,
      visibility: 'PUBLIC',
    });
    expect(calls[0]?.idempotencyKey).toBe('snapshot-42');
    expect(JSON.stringify(calls[0]?.body)).not.toContain('ownerId');
    expect(JSON.stringify(calls[0]?.body)).not.toContain('authorId');
    expect(JSON.stringify(calls[0]?.body)).not.toContain('selectedContent');
    expect(JSON.stringify(calls[0]?.body)).not.toContain('mediaIds');
  });

  it('maps feed and relation operations to the canonical Community routes', async () => {
    const calls: Array<{
      readonly path: string;
      readonly method: string;
      readonly query: Readonly<Record<string, string | number | undefined>> | undefined;
      readonly idempotencyKey: string | undefined;
    }> = [];
    const transport: CommunityTransport = {
      async request<T>(input: {
        readonly path: string;
        readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
        readonly query?: Readonly<Record<string, string | number | undefined>>;
        readonly body?: unknown;
        readonly idempotencyKey?: string;
      }) {
        calls.push({
          path: input.path,
          method: input.method,
          query: input.query,
          idempotencyKey: input.idempotencyKey,
        });
        return unavailable<T>();
      },
    };
    const client = new ApiCommunityClient(transport);

    await client.listFeed({ kind: 'FOLLOWING', cursor: 'cursor-1', limit: 12 });
    await client.setReaction({ postId: 'post-1', active: true, idempotencyKey: 'reaction-1' });
    await client.setSaved({ postId: 'post-1', saved: false, idempotencyKey: 'save-1' });
    await client.createQuote({ postId: 'post-1', commentary: 'Separate commentary', idempotencyKey: 'quote-1' });
    await client.setRepost({ postId: 'post-1', reposted: true, idempotencyKey: 'repost-1' });
    await client.setFollow({ userId: 'user-2', followed: true, idempotencyKey: 'follow-1' });
    await client.setBlock({ userId: 'user-2', blocked: true, idempotencyKey: 'block-1' });

    expect(calls).toEqual([
      {
        path: '/v1/community/feed',
        method: 'GET',
        query: { mode: 'FOLLOWING', cursor: 'cursor-1', limit: 12, channelId: undefined, groupId: undefined },
        idempotencyKey: undefined,
      },
      {
        path: '/v1/community/posts/post-1/reactions/LIKE',
        method: 'PUT',
        query: undefined,
        idempotencyKey: 'reaction-1',
      },
      {
        path: '/v1/community/posts/post-1/save',
        method: 'DELETE',
        query: undefined,
        idempotencyKey: 'save-1',
      },
      {
        path: '/v1/community/posts/post-1/quote',
        method: 'POST',
        query: undefined,
        idempotencyKey: 'quote-1',
      },
      {
        path: '/v1/community/posts/post-1/repost',
        method: 'PUT',
        query: undefined,
        idempotencyKey: 'repost-1',
      },
      {
        path: '/v1/community/users/user-2/follow',
        method: 'PUT',
        query: undefined,
        idempotencyKey: 'follow-1',
      },
      {
        path: '/v1/community/users/user-2/block',
        method: 'PUT',
        query: undefined,
        idempotencyKey: 'block-1',
      },
    ]);
  });

  it('normalizes canonical service projections before they reach the view', async () => {
    const transport: CommunityTransport = {
      async request<T>(input: {
        readonly path: string;
        readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
        readonly query?: Readonly<Record<string, string | number | undefined>>;
        readonly body?: unknown;
        readonly idempotencyKey?: string;
      }) {
        if (input.path === '/v1/community/feed') {
          return {
            ok: true as const,
            source: 'SERVER' as const,
            data: {
              mode: 'LATEST',
              ranking: { strategy: 'CHRONOLOGICAL', factors: ['visible_to_viewer'] },
              items: [{
                id: 'post-1',
                authorId: 'user-1',
                publishedSnapshotId: 'snapshot-1',
                groupId: null,
                channelId: null,
                activityId: null,
                body: '公开内容',
                media: [],
                visibility: 'PUBLIC',
                founderAudience: null,
                status: 'PUBLISHED',
                reactionCount: 2,
                commentCount: 1,
                repostCount: 0,
                quote: null,
                repostedBy: null,
                createdAt: '2026-08-17T00:00:00.000Z',
                updatedAt: '2026-08-17T00:00:00.000Z',
                deletedAt: null,
                author: {
                  userId: 'user-1',
                  displayName: '公开成员',
                  avatarMediaId: null,
                  profileVisibility: 'PUBLIC',
                },
                viewer: { reacted: true, saved: false, followingAuthor: true, reposted: false },
                context: 'COMMUNITY',
              }],
              nextCursor: null,
              hasMore: false,
            } as T,
          };
        }
        return { ok: false as const, source: 'UNAVAILABLE' as const, error: unavailableError };
      },
    };
    const client = new ApiCommunityClient(transport);
    const result = await client.listFeed({ kind: 'LATEST', limit: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items[0]).toMatchObject({
      id: 'post-1',
      body: '公开内容',
      snapshot: { id: 'snapshot-1' },
      author: { displayName: '公开成员' },
      context: { kind: 'COMMUNITY', label: '社区' },
      viewer: { reacted: true, authorFollowed: true },
    });
  });
});
