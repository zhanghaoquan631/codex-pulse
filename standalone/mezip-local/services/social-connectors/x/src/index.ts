import {
  SocialConnectorError,
} from '@me-zip/social-connectors';
import type {
  SocialConnectorProvider,
  SocialProviderAuthorizationInput,
  SocialProviderContent,
  SocialProviderExchangeInput,
  SocialProviderImportResult,
  SocialProviderRecord,
  SocialProviderSyncInput,
} from '@me-zip/social-connectors';
import type {
  ExternalSocialAccount,
  JsonObject,
  SocialConnectorCapabilityView,
  SocialSyncStatus,
} from '@me-zip/shared-types';

export interface XConnectorContract {
  readonly status: 'UNVERIFIED' | 'DISCONNECTED' | 'CONNECTED';
  readonly importVisibility: 'FOUNDER_PRIVATE_LIBRARY';
}

export const xProviderCode = 'X' as const;

/**
 * X API v2 OAuth 2.0 / PKCE provider.
 *
 * This adapter never scrapes x.com, never accepts a browser cookie, and never
 * returns an access or refresh token to the caller. A deployment must inject a
 * server-side credential vault before this provider can be composed.
 */
export const xConnectorImplementationGate =
  'Use only X API v2 OAuth 2.0 Authorization Code with PKCE; do not scrape x.com or store credentials in the client.';

export const xRequestedReadScopes = Object.freeze([
  'tweet.read',
  'users.read',
  'offline.access',
  'like.read',
  'bookmark.read',
] as const);

export type XFeedKind = 'MY_TWEETS' | 'LIKED' | 'BOOKMARKED';

export interface XTokenRecord {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: string | null;
  readonly scopes: readonly string[];
}

/** A deployment-owned vault. It must encrypt at rest and is never a browser store. */
export interface XCredentialVault {
  readonly durable: boolean;
  read(externalAccountId: string): Promise<XTokenRecord | null>;
  write(externalAccountId: string, token: XTokenRecord): Promise<void>;
  remove(externalAccountId: string): Promise<void>;
}

/** Test-only vault; production composition rejects it. */
export class InMemoryXCredentialVault implements XCredentialVault {
  public readonly durable = false;
  private readonly values = new Map<string, XTokenRecord>();

  public async read(externalAccountId: string): Promise<XTokenRecord | null> {
    return this.values.get(externalAccountId) ?? null;
  }

  public async write(externalAccountId: string, token: XTokenRecord): Promise<void> {
    this.values.set(externalAccountId, structuredClone(token));
  }

  public async remove(externalAccountId: string): Promise<void> {
    this.values.delete(externalAccountId);
  }
}

export interface XFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { readonly get: (name: string) => string | null };
  json(): Promise<unknown>;
}

export type XFetch = (
  input: string,
  init?: {
    readonly method?: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: string;
  },
) => Promise<XFetchResponse>;

export interface XOfficialApiProviderOptions {
  readonly clientId: string;
  /** Confidential web apps keep this only in their server environment. */
  readonly clientSecret?: string;
  readonly credentialVault: XCredentialVault;
  readonly fetch?: XFetch;
  readonly authorizationEndpoint?: string;
  readonly tokenEndpoint?: string;
  readonly apiBaseUrl?: string;
  readonly clock?: () => Date;
}

interface XUser {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly profileImageUrl: string | null;
  readonly publicMetrics: {
    readonly followersCount: number | null;
    readonly followingCount: number | null;
    readonly tweetCount: number | null;
  };
}

interface XMedia {
  readonly key: string;
  readonly type: 'photo' | 'video' | 'animated_gif' | 'unknown';
  readonly url: string | null;
  readonly previewImageUrl: string | null;
}

interface XPost {
  readonly id: string;
  readonly text: string;
  readonly authorId: string | null;
  readonly createdAt: string | null;
  readonly mediaKeys: readonly string[];
  readonly references: readonly { readonly type: string; readonly id: string }[];
  readonly metrics: {
    readonly likeCount: number | null;
    readonly replyCount: number | null;
    readonly repostCount: number | null;
    readonly quoteCount: number | null;
    readonly impressionCount: number | null;
  };
}

interface XPostPage {
  readonly posts: readonly XPost[];
  readonly referencedPosts: ReadonlyMap<string, XPost>;
  readonly users: ReadonlyMap<string, XUser>;
  readonly media: ReadonlyMap<string, XMedia>;
  readonly nextToken: string | null;
}

interface XCursor {
  readonly myTweets: string | null;
  readonly liked: string | null;
  readonly bookmarked: string | null;
}

export class XOfficialApiError extends Error {
  public constructor(
    public readonly code:
      | 'AUTH_EXPIRED'
      | 'PERMISSION_DENIED'
      | 'RATE_LIMITED'
      | 'NOT_CONFIGURED'
      | 'PROVIDER_UNAVAILABLE'
      | 'VALIDATION',
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'XOfficialApiError';
  }
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new XOfficialApiError('NOT_CONFIGURED', `${label} is not configured.`);
  return normalized;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function oauthError(error: unknown): XOfficialApiError {
  if (error instanceof XOfficialApiError) return error;
  return new XOfficialApiError('PROVIDER_UNAVAILABLE', 'X API request failed.', true);
}

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function readCursor(value: string | null): XCursor {
  if (value === null) return { myTweets: null, liked: null, bookmarked: null };
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    const record = asRecord(decoded);
    return {
      myTweets: text(record.myTweets),
      liked: text(record.liked),
      bookmarked: text(record.bookmarked),
    };
  } catch {
    throw new XOfficialApiError('VALIDATION', 'X synchronization cursor is invalid.');
  }
}

function writeCursor(cursor: XCursor): string | null {
  if (cursor.myTweets === null && cursor.liked === null && cursor.bookmarked === null) return null;
  return base64Url(JSON.stringify(cursor));
}

function toUser(value: unknown): XUser | null {
  const row = asRecord(value);
  const id = text(row.id);
  const name = text(row.name);
  const username = text(row.username);
  if (id === null || name === null || username === null) return null;
  const metrics = asRecord(row.public_metrics);
  return {
    id,
    name,
    username,
    profileImageUrl: text(row.profile_image_url),
    publicMetrics: {
      followersCount: numberValue(metrics.followers_count),
      followingCount: numberValue(metrics.following_count),
      tweetCount: numberValue(metrics.tweet_count),
    },
  };
}

function toMedia(value: unknown): XMedia | null {
  const row = asRecord(value);
  const key = text(row.media_key);
  if (key === null) return null;
  const type = text(row.type);
  return {
    key,
    type: type === 'photo' || type === 'video' || type === 'animated_gif' ? type : 'unknown',
    url: text(row.url),
    previewImageUrl: text(row.preview_image_url),
  };
}

function toPost(value: unknown): XPost | null {
  const row = asRecord(value);
  const id = text(row.id);
  const body = text(row.text);
  if (id === null || body === null) return null;
  const attachments = asRecord(row.attachments);
  const metrics = asRecord(row.public_metrics);
  const references = Array.isArray(row.referenced_tweets)
    ? row.referenced_tweets.map((entry) => asRecord(entry)).flatMap((entry) => {
      const type = text(entry.type);
      const referenceId = text(entry.id);
      return type === null || referenceId === null ? [] : [{ type, id: referenceId }];
    })
    : [];
  return {
    id,
    text: body,
    authorId: text(row.author_id),
    createdAt: text(row.created_at),
    mediaKeys: stringList(attachments.media_keys),
    references,
    metrics: {
      likeCount: numberValue(metrics.like_count),
      replyCount: numberValue(metrics.reply_count),
      repostCount: numberValue(metrics.retweet_count),
      quoteCount: numberValue(metrics.quote_count),
      impressionCount: numberValue(metrics.impression_count),
    },
  };
}

function postPage(payload: unknown): XPostPage {
  const row = asRecord(payload);
  const posts = Array.isArray(row.data)
    ? row.data.map(toPost).filter((value): value is XPost => value !== null)
    : [];
  const includes = asRecord(row.includes);
  const referencedPosts = new Map<string, XPost>();
  if (Array.isArray(includes.tweets)) {
    for (const entry of includes.tweets) {
      const post = toPost(entry);
      if (post !== null) referencedPosts.set(post.id, post);
    }
  }
  const users = new Map<string, XUser>();
  if (Array.isArray(includes.users)) {
    for (const entry of includes.users) {
      const user = toUser(entry);
      if (user !== null) users.set(user.id, user);
    }
  }
  const media = new Map<string, XMedia>();
  if (Array.isArray(includes.media)) {
    for (const entry of includes.media) {
      const parsed = toMedia(entry);
      if (parsed !== null) media.set(parsed.key, parsed);
    }
  }
  const meta = asRecord(row.meta);
  return { posts, referencedPosts, users, media, nextToken: text(meta.next_token) };
}

function contentKind(post: XPost, media: readonly XMedia[]): 'POST' | 'IMAGE' | 'VIDEO' {
  if (media.some((entry) => entry.type === 'video' || entry.type === 'animated_gif')) return 'VIDEO';
  return media.some((entry) => entry.type === 'photo') ? 'IMAGE' : 'POST';
}

function hasReference(post: XPost, type: string): boolean {
  return post.references.some((reference) => reference.type === type);
}

function referenceUrl(id: string, author: XUser | null): string {
  return author === null
    ? `https://x.com/i/web/status/${encodeURIComponent(id)}`
    : `https://x.com/${encodeURIComponent(author.username)}/status/${encodeURIComponent(id)}`;
}

function postContent(
  feed: XFeedKind,
  post: XPost,
  referencedPosts: ReadonlyMap<string, XPost>,
  users: ReadonlyMap<string, XUser>,
  mediaByKey: ReadonlyMap<string, XMedia>,
  fallbackAuthor: XUser,
): SocialProviderContent {
  const author = post.authorId === null ? fallbackAuthor : users.get(post.authorId) ?? fallbackAuthor;
  const media = post.mediaKeys.flatMap((key) => {
    const item = mediaByKey.get(key);
    return item === undefined ? [] : [item];
  });
  const mediaProjection = media.map((item) => ({ type: item.type, url: item.url, previewImageUrl: item.previewImageUrl }));
  const canonicalUrl = `https://x.com/${encodeURIComponent(author.username)}/status/${encodeURIComponent(post.id)}`;
  const references = post.references.map((reference) => {
    const referenced = referencedPosts.get(reference.id) ?? null;
    const referencedAuthor = referenced?.authorId === null || referenced === null
      ? null
      : users.get(referenced.authorId) ?? null;
    return {
      type: reference.type,
      id: reference.id,
      canonicalUrl: referenceUrl(reference.id, referencedAuthor),
      textExcerpt: referenced?.text ?? null,
      authorName: referencedAuthor?.name ?? null,
      authorUsername: referencedAuthor?.username ?? null,
    };
  });
  const metadata: JsonObject = {
    xFeed: feed,
    xTweetId: post.id,
    originalAuthor: author.name,
    authorUsername: author.username,
    authorAvatarUrl: author.profileImageUrl,
    media: mediaProjection,
    references,
    metrics: {
      likeCount: post.metrics.likeCount,
      replyCount: post.metrics.replyCount,
      repostCount: post.metrics.repostCount,
      quoteCount: post.metrics.quoteCount,
      impressionCount: post.metrics.impressionCount,
    },
    isReply: hasReference(post, 'replied_to'),
    isQuote: hasReference(post, 'quoted'),
  };
  return {
    // Feed name is part of the stable external id: the same X Post can be both
    // liked and bookmarked, and those two private views must remain distinct.
    externalContentId: `${feed}:${post.id}`,
    contentType: contentKind(post, media),
    canonicalUrl,
    textExcerpt: post.text,
    publishedAt: post.createdAt,
    metadata,
    contentStatus: 'AVAILABLE',
  };
}

function endpoint(base: string, path: string, query: Readonly<Record<string, string | null>>): string {
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(query)) if (value !== null) url.searchParams.set(key, value);
  return url.toString();
}

function scopes(input: SocialProviderAuthorizationInput): readonly string[] {
  const requested = input.scopes?.filter((value) => value.trim().length > 0) ?? [];
  return requested.length > 0 ? requested : xRequestedReadScopes;
}

export class XOfficialApiProvider implements SocialConnectorProvider {
  public readonly code = 'X' as const;
  public readonly officialApiVerified = true;
  private readonly fetch: XFetch;
  private readonly authorizationEndpoint: string;
  private readonly tokenEndpoint: string;
  private readonly apiBaseUrl: string;
  private readonly clock: () => Date;

  public constructor(private readonly options: XOfficialApiProviderOptions) {
    required(options.clientId, 'X_CLIENT_ID');
    this.fetch = options.fetch ?? ((input, init) => fetch(input, init) as Promise<XFetchResponse>);
    this.authorizationEndpoint = options.authorizationEndpoint ?? 'https://x.com/i/oauth2/authorize';
    this.tokenEndpoint = options.tokenEndpoint ?? 'https://api.x.com/2/oauth2/token';
    this.apiBaseUrl = options.apiBaseUrl ?? 'https://api.x.com/2/';
    this.clock = options.clock ?? (() => new Date());
  }

  public listSupportedCapabilities(): readonly SocialConnectorCapabilityView[] {
    const supported = (capability: SocialConnectorCapabilityView['capability'], notes: string): SocialConnectorCapabilityView => ({ provider: 'X', capability, status: 'SUPPORTED', credentialRequired: true, notes });
    return [
      supported('PROFILE_READ', 'X API v2 users/me and public profile metrics.'),
      supported('POST_READ', 'X API v2 authenticated user timeline.'),
      supported('MEDIA_READ', 'Media metadata and provider-hosted media references only.'),
      { provider: 'X', capability: 'PUBLISH', status: 'UNSUPPORTED', credentialRequired: true, notes: 'X publishing is intentionally not enabled in the read-only X Connection Center.' },
      supported('LIKES_READ', 'X API v2 liked Posts endpoint; requires like.read.'),
      supported('BOOKMARKS_READ', 'X API v2 bookmarks endpoint; requires bookmark.read.'),
      { provider: 'X', capability: 'FAVORITES_READ', status: 'UNSUPPORTED', credentialRequired: true, notes: 'Use LIKES_READ for X likes.' },
      supported('COLLECTION_READ', 'X bookmark folders are not imported as authoritative ME.zip collections; ME.zip collections remain private.'),
      supported('ANALYTICS_READ', 'Only metrics returned by the authorized X API endpoint and plan are displayed.'),
    ];
  }

  public async getAuthorizationUrl(input: SocialProviderAuthorizationInput): Promise<string> {
    const challenge = input.codeChallenge?.trim();
    if (challenge === undefined || challenge.length < 43) throw new XOfficialApiError('VALIDATION', 'X OAuth requires a PKCE code challenge.');
    const url = new URL(this.authorizationEndpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.options.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('scope', scopes(input).join(' '));
    url.searchParams.set('state', input.state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  public async exchangeAuthorization(input: SocialProviderExchangeInput): Promise<SocialProviderRecord> {
    if (input.codeVerifier === undefined || input.codeVerifier.length < 43) throw new XOfficialApiError('VALIDATION', 'X OAuth requires a PKCE code verifier.');
    const token = await this.exchangeToken(new URLSearchParams({ grant_type: 'authorization_code', code: input.code, redirect_uri: input.redirectUri, client_id: this.options.clientId, code_verifier: input.codeVerifier }));
    const user = await this.currentUser(token.accessToken);
    await this.options.credentialVault.write(user.id, token);
    return { externalAccountId: user.id, displayName: user.name, username: user.username, avatarReference: user.profileImageUrl, profileMetrics: { followersCount: user.publicMetrics.followersCount, followingCount: user.publicMetrics.followingCount, postCount: user.publicMetrics.tweetCount }, encryptedCredential: `ciphertext:x:${user.id}` };
  }

  public async refreshAuthorization(account: ExternalSocialAccount): Promise<SocialProviderRecord> {
    const prior = await this.token(account.externalAccountId);
    if (prior.refreshToken === null) throw new XOfficialApiError('AUTH_EXPIRED', 'X did not grant a refresh token. Reconnect with offline.access.');
    const refreshed = await this.exchangeToken(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: prior.refreshToken, client_id: this.options.clientId }));
    const merged: XTokenRecord = { ...refreshed, refreshToken: refreshed.refreshToken ?? prior.refreshToken };
    const user = await this.currentUser(merged.accessToken);
    await this.options.credentialVault.write(user.id, merged);
    if (user.id !== account.externalAccountId) await this.options.credentialVault.remove(account.externalAccountId);
    return { externalAccountId: user.id, displayName: user.name, username: user.username, avatarReference: user.profileImageUrl, profileMetrics: { followersCount: user.publicMetrics.followersCount, followingCount: user.publicMetrics.followingCount, postCount: user.publicMetrics.tweetCount }, encryptedCredential: `ciphertext:x:${user.id}` };
  }

  public async disconnect(account: ExternalSocialAccount): Promise<void> { await this.options.credentialVault.remove(account.externalAccountId); }

  public async getAccount(account: ExternalSocialAccount): Promise<SocialProviderRecord> {
    const user = await this.currentUser((await this.token(account.externalAccountId)).accessToken);
    return { externalAccountId: user.id, displayName: user.name, username: user.username, avatarReference: user.profileImageUrl, profileMetrics: { followersCount: user.publicMetrics.followersCount, followingCount: user.publicMetrics.followingCount, postCount: user.publicMetrics.tweetCount }, encryptedCredential: null };
  }

  public async importContent(input: SocialProviderSyncInput): Promise<SocialProviderImportResult> { return this.syncContent(input); }

  public async syncContent(input: SocialProviderSyncInput): Promise<SocialProviderImportResult> {
    const token = await this.token(input.account.externalAccountId);
    const cursor = readCursor(input.cursor);
    const me = await this.currentUser(token.accessToken);
    const emptyPage = (): XPostPage => ({ posts: [], referencedPosts: new Map(), users: new Map(), media: new Map(), nextToken: null });
    const [myTweets, liked, bookmarked] = await Promise.all([
      input.account.requestedScopes.includes('tweet.read') ? this.readPosts(token.accessToken, `users/${encodeURIComponent(me.id)}/tweets`, cursor.myTweets) : emptyPage(),
      input.account.requestedScopes.includes('like.read') ? this.readOptionalPosts(token.accessToken, `users/${encodeURIComponent(me.id)}/liked_tweets`, cursor.liked) : emptyPage(),
      input.account.requestedScopes.includes('bookmark.read') ? this.readOptionalPosts(token.accessToken, `users/${encodeURIComponent(me.id)}/bookmarks`, cursor.bookmarked) : emptyPage(),
    ]);
    return {
      items: [
        ...myTweets.posts.map((post) => postContent('MY_TWEETS', post, myTweets.referencedPosts, myTweets.users, myTweets.media, me)),
        ...liked.posts.map((post) => postContent('LIKED', post, liked.referencedPosts, liked.users, liked.media, me)),
        ...bookmarked.posts.map((post) => postContent('BOOKMARKED', post, bookmarked.referencedPosts, bookmarked.users, bookmarked.media, me)),
      ],
      nextCursor: writeCursor({ myTweets: myTweets.nextToken, liked: liked.nextToken, bookmarked: bookmarked.nextToken }),
    };
  }

  public async getSyncStatus(
    account: ExternalSocialAccount,
    cursor: string | null,
  ): Promise<SocialSyncStatus> {
    const credential = await this.options.credentialVault.read(account.externalAccountId);
    return {
      accountId: account.id,
      provider: 'X',
      status: credential === null ? 'DISCONNECTED' : cursor === null ? 'IDLE' : 'SUCCESS',
      lastSyncedAt: account.lastSyncedAt,
      nextCursor: cursor,
      importedCount: 0,
      errorCode: credential === null ? 'AUTH_EXPIRED' : null,
      retryAfterSeconds: null,
    };
  }

  public normalizeError(error: unknown): SocialConnectorError {
    const normalized = oauthError(error);
    return new SocialConnectorError(normalized.code, normalized.message, normalized.retryable);
  }

  private async token(externalAccountId: string): Promise<XTokenRecord> {
    const token = await this.options.credentialVault.read(externalAccountId);
    if (token === null) throw new XOfficialApiError('AUTH_EXPIRED', 'The X authorization is no longer available. Reconnect the account.');
    if (token.expiresAt !== null && Date.parse(token.expiresAt) <= this.clock().getTime()) throw new XOfficialApiError('AUTH_EXPIRED', 'The X access token has expired. Refresh or reconnect the account.');
    return token;
  }

  private async exchangeToken(body: URLSearchParams): Promise<XTokenRecord> {
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
    if (this.options.clientSecret !== undefined && this.options.clientSecret.trim().length > 0) headers.Authorization = `Basic ${Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`, 'utf8').toString('base64')}`;
    const response = await this.fetch(this.tokenEndpoint, { method: 'POST', headers, body: body.toString() });
    const payload = await response.json();
    if (!response.ok) throw this.responseError(response.status, payload);
    const row = asRecord(payload);
    const accessToken = text(row.access_token);
    if (accessToken === null) throw new XOfficialApiError('PROVIDER_UNAVAILABLE', 'X OAuth response did not include an access token.', true);
    const expiresIn = numberValue(row.expires_in);
    return { accessToken, refreshToken: text(row.refresh_token), expiresAt: expiresIn === null ? null : new Date(this.clock().getTime() + expiresIn * 1_000).toISOString(), scopes: stringList(row.scope) };
  }

  private async currentUser(accessToken: string): Promise<XUser> {
    const response = await this.fetch(endpoint(this.apiBaseUrl, 'users/me', { 'user.fields': 'profile_image_url,public_metrics,username,name' }), { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok) throw this.responseError(response.status, payload);
    const user = toUser(asRecord(payload).data);
    if (user === null) throw new XOfficialApiError('PROVIDER_UNAVAILABLE', 'X API did not return the authenticated user.', true);
    return user;
  }

  private async readPosts(accessToken: string, path: string, paginationToken: string | null): Promise<XPostPage> {
    const response = await this.fetch(endpoint(this.apiBaseUrl, path, {
      max_results: '100', pagination_token: paginationToken,
      'tweet.fields': 'created_at,author_id,attachments,public_metrics,referenced_tweets,conversation_id',
      expansions: 'author_id,attachments.media_keys,referenced_tweets.id',
      'user.fields': 'profile_image_url,username,name',
      'media.fields': 'media_key,type,url,preview_image_url,alt_text,duration_ms',
    }), { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new XOfficialApiError('PROVIDER_UNAVAILABLE', 'X API returned an unreadable response.', true);
    }
    if (!response.ok) throw this.responseError(response.status, payload);
    return postPage(payload);
  }

  /**
   * A denied Likes or Bookmarks endpoint must not prevent permitted personal
   * posts from syncing.  The UI represents the empty feed as unavailable;
   * no cached or invented replacement is returned here.
   */
  private async readOptionalPosts(accessToken: string, path: string, paginationToken: string | null): Promise<XPostPage> {
    try {
      return await this.readPosts(accessToken, path, paginationToken);
    } catch (error) {
      const normalized = oauthError(error);
      if (normalized.code === 'PERMISSION_DENIED') return { posts: [], referencedPosts: new Map(), users: new Map(), media: new Map(), nextToken: null };
      throw normalized;
    }
  }

  private responseError(status: number, payload: unknown): XOfficialApiError {
    const row = asRecord(payload);
    const detail = text(row.detail) ?? text(row.title) ?? 'X API request was rejected.';
    if (status === 401) return new XOfficialApiError('AUTH_EXPIRED', 'X authorization expired or was revoked. Reconnect the account.');
    if (status === 402 || status === 403) return new XOfficialApiError('PERMISSION_DENIED', 'The current X API plan or OAuth scopes do not allow this data.');
    if (status === 429) return new XOfficialApiError('RATE_LIMITED', 'X API rate limit reached. Try again after the provider reset.', true);
    if (status >= 500) return new XOfficialApiError('PROVIDER_UNAVAILABLE', 'X API is temporarily unavailable.', true);
    return new XOfficialApiError('PROVIDER_UNAVAILABLE', detail, true);
  }
}
