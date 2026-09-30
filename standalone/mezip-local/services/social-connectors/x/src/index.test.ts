import { describe, expect, it } from 'vitest';
import type { ExternalSocialAccount } from '@me-zip/shared-types';
import {
  InMemoryXCredentialVault,
  XOfficialApiProvider,
  type XFetch,
} from './index.js';

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body };
}

function userPayload() {
  return { data: { id: 'x-user-1', name: 'Owner', username: 'owner', profile_image_url: 'https://img.example/avatar.jpg', public_metrics: { followers_count: 12, following_count: 7, tweet_count: 3 } } };
}

function postPayload(id: string, body: string) {
  return { data: [{ id, text: body, author_id: 'x-user-1', created_at: '2026-08-20T00:00:00.000Z', public_metrics: { like_count: 2, reply_count: 1, retweet_count: 1, quote_count: 0, impression_count: 10 } }], includes: { users: [userPayload().data] }, meta: {} };
}

const account: ExternalSocialAccount = {
  id: 'account-1', ownerId: 'owner-1', provider: 'X', externalAccountId: 'x-user-1', displayName: 'Owner', username: 'owner', avatarReference: null,
  status: 'CONNECTED', connectedAt: '2026-08-20T00:00:00.000Z', lastSyncedAt: null, capabilities: [], consentVersion: 'x-center-v1', requestedScopes: ['tweet.read', 'users.read', 'like.read', 'bookmark.read'], autoSync: false,
};

describe('XOfficialApiProvider', () => {
  it('builds a least-privilege PKCE OAuth URL and stores credentials only in its server vault', async () => {
    const vault = new InMemoryXCredentialVault();
    const fetch: XFetch = async (input) => {
      if (input.includes('/oauth2/token')) return response(200, { access_token: 'test-access-token', refresh_token: 'test-refresh-token', expires_in: 7200, scope: 'tweet.read users.read offline.access' });
      if (input.includes('/users/me')) return response(200, userPayload());
      throw new Error(`unexpected request ${input}`);
    };
    const provider = new XOfficialApiProvider({ clientId: 'client-id', credentialVault: vault, fetch, authorizationEndpoint: 'https://auth.example/authorize', tokenEndpoint: 'https://api.example/oauth2/token', apiBaseUrl: 'https://api.example/2/' });
    const url = new URL(await provider.getAuthorizationUrl({ state: 'state-1', redirectUri: 'http://127.0.0.1:5174/x', codeChallenge: 'a'.repeat(43) }));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toContain('bookmark.read');
    const result = await provider.exchangeAuthorization({ code: 'oauth-code', redirectUri: 'http://127.0.0.1:5174/x', codeVerifier: 'b'.repeat(43) });
    expect(result).toMatchObject({ externalAccountId: 'x-user-1', username: 'owner', profileMetrics: { followersCount: 12, followingCount: 7, postCount: 3 } });
    expect(JSON.stringify(result)).not.toMatch(/test-access-token|test-refresh-token/i);
    expect(await vault.read('x-user-1')).not.toBeNull();
  });

  it('imports posts, likes, and bookmarks as distinct private provider records without copying an X token', async () => {
    const vault = new InMemoryXCredentialVault();
    await vault.write('x-user-1', { accessToken: 'test-access-token', refreshToken: 'test-refresh-token', expiresAt: '2099-01-01T00:00:00.000Z', scopes: [] });
    const requestPaths: string[] = [];
    const fetch: XFetch = async (input) => {
      requestPaths.push(new URL(input).pathname);
      if (input.includes('/users/me')) return response(200, userPayload());
      if (input.includes('/liked_tweets')) return response(200, postPayload('liked-1', 'A liked post'));
      if (input.includes('/bookmarks')) return response(200, postPayload('bookmark-1', 'A bookmarked post'));
      if (input.includes('/tweets')) return response(200, postPayload('post-1', 'My post'));
      throw new Error(`unexpected request ${input}`);
    };
    const provider = new XOfficialApiProvider({ clientId: 'client-id', credentialVault: vault, fetch, apiBaseUrl: 'https://api.example/2/' });
    const imported = await provider.syncContent({ account, cursor: null });
    expect(imported.items.map((item) => item.externalContentId)).toEqual(['MY_TWEETS:post-1', 'LIKED:liked-1', 'BOOKMARKED:bookmark-1']);
    expect(requestPaths).toEqual(expect.arrayContaining([
      '/2/users/x-user-1/tweets',
      '/2/users/x-user-1/liked_tweets',
      '/2/users/x-user-1/bookmarks',
    ]));
    expect(imported.items.every((item) => item.metadata?.xFeed !== undefined)).toBe(true);
    expect(JSON.stringify(imported)).not.toMatch(/test-access-token|test-refresh-token/i);
  });

  it('preserves authorized reply, quote, media, and original-post links for the UI', async () => {
    const vault = new InMemoryXCredentialVault();
    await vault.write('x-user-1', { accessToken: 'test-access-token', refreshToken: null, expiresAt: null, scopes: [] });
    const fetch: XFetch = async (input) => {
      if (input.includes('/users/me')) return response(200, userPayload());
      if (input.includes('/tweets')) return response(200, {
        data: [{
          id: 'reply-quote-1', text: 'My reply with an image', author_id: 'x-user-1', created_at: '2026-08-20T00:00:00.000Z',
          attachments: { media_keys: ['photo-1'] },
          referenced_tweets: [{ type: 'replied_to', id: 'reply-root' }, { type: 'quoted', id: 'quote-root' }],
          public_metrics: {},
        }],
        includes: {
          users: [userPayload().data, { id: 'reference-user', name: 'Reference', username: 'reference_user' }],
          tweets: [
            { id: 'reply-root', text: 'Reply root text', author_id: 'reference-user' },
            { id: 'quote-root', text: 'Quote root text', author_id: 'reference-user' },
          ],
          media: [{ media_key: 'photo-1', type: 'photo', url: 'https://img.example/photo.jpg' }],
        },
        meta: {},
      });
      throw new Error(`unexpected request ${input}`);
    };
    const provider = new XOfficialApiProvider({ clientId: 'client-id', credentialVault: vault, fetch, apiBaseUrl: 'https://api.example/2/' });
    const imported = await provider.syncContent({ account: { ...account, requestedScopes: ['tweet.read', 'users.read'] }, cursor: null });
    expect(imported.items).toHaveLength(1);
    expect(imported.items[0]).toMatchObject({ contentType: 'IMAGE' });
    expect(imported.items[0]?.metadata).toMatchObject({
      isReply: true,
      isQuote: true,
      media: [{ type: 'photo', url: 'https://img.example/photo.jpg' }],
      references: [
        { type: 'replied_to', canonicalUrl: 'https://x.com/reference_user/status/reply-root', textExcerpt: 'Reply root text' },
        { type: 'quoted', canonicalUrl: 'https://x.com/reference_user/status/quote-root', textExcerpt: 'Quote root text' },
      ],
    });
  });

  it('maps an X permission response to a fail-closed Social Connector error', async () => {
    const vault = new InMemoryXCredentialVault();
    await vault.write('x-user-1', { accessToken: 'test-access-token', refreshToken: null, expiresAt: null, scopes: [] });
    const provider = new XOfficialApiProvider({ clientId: 'client-id', credentialVault: vault, fetch: async () => response(403, { title: 'Forbidden' }), apiBaseUrl: 'https://api.example/2/' });
    await expect(provider.getAccount(account)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('keeps permitted posts available when the X plan or scope denies likes and bookmarks', async () => {
    const vault = new InMemoryXCredentialVault();
    await vault.write('x-user-1', { accessToken: 'test-access-token', refreshToken: null, expiresAt: null, scopes: [] });
    const provider = new XOfficialApiProvider({
      clientId: 'client-id',
      credentialVault: vault,
      apiBaseUrl: 'https://api.example/2/',
      fetch: async (input) => {
        if (input.includes('/users/me')) return response(200, userPayload());
        if (input.includes('/liked_tweets') || input.includes('/bookmarks')) return response(403, { title: 'Forbidden' });
        if (input.includes('/tweets')) return response(200, postPayload('post-1', 'My post'));
        throw new Error(`unexpected request ${input}`);
      },
    });
    const imported = await provider.syncContent({ account, cursor: null });
    expect(imported.items.map((item) => item.externalContentId)).toEqual(['MY_TWEETS:post-1']);
  });
});
