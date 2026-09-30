import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import {
  InMemorySocialCredentialStore,
  InMemorySocialPersistence,
  MockSocialConnectorProvider,
  SocialConnectorError,
  SocialConnectorService,
  UnavailableSocialConnectorProvider,
} from './index.js';

const alice: AuthenticatedPrincipal = { userId: '11111111-1111-4111-8111-111111111111', sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', roles: ['USER'], issuedAt: new Date(0).toISOString() };
const bob: AuthenticatedPrincipal = { ...alice, userId: '22222222-2222-4222-8222-222222222222', sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
const service = (extra: ConstructorParameters<typeof SocialConnectorService>[0] = {}) => new SocialConnectorService({
  credentialStore: new InMemorySocialCredentialStore(),
  providers: { X: new MockSocialConnectorProvider('X'), DOUYIN: new MockSocialConnectorProvider('DOUYIN'), ...(extra.providers ?? {}) },
  id: (() => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; })(),
  ...extra,
});

async function connected(instance: SocialConnectorService, principal = alice, code = 'mock_account'): Promise<string> {
  const started = await instance.startOAuth(principal, { provider: 'X', redirectUri: 'http://localhost:5173/social/callback', consentVersion: 'social-v1', requestedScopes: ['profile.read', 'post.read'], codeChallenge: 'A'.repeat(43) });
  const account = await instance.completeOAuth(principal, { provider: 'X', state: started.state, code: `mock_${code}`, redirectUri: 'http://localhost:5173/social/callback', codeVerifier: 'B'.repeat(43) });
  return account.id;
}

describe('SocialConnectorService', () => {
  it('defaults real providers to unavailable instead of implicit synthetic data', () => {
    const instance = new SocialConnectorService();
    const providers = instance.listProviders();
    expect(providers.find((entry) => entry.provider === 'X')).toMatchObject({ oauthAvailable: false, officialApiVerified: false });
    expect(providers.find((entry) => entry.provider === 'DOUYIN')).toMatchObject({ oauthAvailable: false, officialApiVerified: false });
  });

  it('rejects accidental production composition without durable reviewed adapters', () => {
    expect(() => new SocialConnectorService({ deploymentMode: 'PRODUCTION' })).toThrowError(SocialConnectorError);
  });

  it('keeps OAuth state owner-bound, single-use, PKCE-aware, and never projects credentials', async () => {
    const instance = service();
    const started = await instance.startOAuth(alice, { provider: 'X', redirectUri: 'http://localhost:5173/social/callback', consentVersion: 'social-v1', requestedScopes: ['profile.read'], codeChallenge: 'A'.repeat(43) });
    await expect(instance.completeOAuth(bob, { provider: 'X', state: started.state, code: 'mock_x', redirectUri: 'http://localhost:5173/social/callback', codeVerifier: 'B'.repeat(43) })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const account = await instance.completeOAuth(alice, { provider: 'X', state: started.state, code: 'mock_x', redirectUri: 'http://localhost:5173/social/callback', codeVerifier: 'B'.repeat(43) });
    expect(Object.keys(account)).not.toContain('encryptedCredentialRef');
    expect(JSON.stringify(account)).not.toMatch(/ciphertext|access_token|refresh_token|client_secret/i);
    await expect(instance.completeOAuth(alice, { provider: 'X', state: started.state, code: 'mock_x', redirectUri: 'http://localhost:5173/social/callback', codeVerifier: 'B'.repeat(43) })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('does not merge the same external account across owners', async () => {
    const instance = service();
    await connected(instance, alice, 'same');
    const started = await instance.startOAuth(bob, { provider: 'X', redirectUri: 'http://localhost:5173/social/callback', consentVersion: 'social-v1', requestedScopes: ['profile.read'] });
    await expect(instance.completeOAuth(bob, { provider: 'X', state: started.state, code: 'mock_same', redirectUri: 'http://localhost:5173/social/callback' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('syncs incrementally and deduplicates the provider external id', async () => {
    const instance = service();
    const accountId = await connected(instance);
    const first = await instance.syncAccount(alice, accountId, 'sync-key-01');
    expect(first.status).toBe('SUCCESS');
    const second = await instance.syncAccount(alice, accountId, 'sync-key-02');
    expect(second.status).toBe('SUCCESS');
    const archive = instance.listArchive(alice);
    expect(archive.items).toHaveLength(1);
    expect(archive.items[0]?.syncSource).toBe('OFFICIAL_API');
  });

  it('persists a denied provider sync so the UI can explain the unavailable data after reload', async () => {
    const deniedProvider = new MockSocialConnectorProvider('X');
    deniedProvider.syncContent = async () => { throw new SocialConnectorError('PERMISSION_DENIED', 'Provider plan denied content read.'); };
    const instance = service({ providers: { X: deniedProvider } });
    const accountId = await connected(instance);
    await expect(instance.syncAccount(alice, accountId, 'denied-sync-01')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(instance.getSyncStatus(alice, accountId)).toMatchObject({ status: 'FAILED', errorCode: 'PERMISSION_DENIED' });
  });

  it('keeps manual saves metadata-first, normalizes tracking parameters, and rejects SSRF targets', () => {
    const instance = service();
    const saved = instance.saveManualLink(alice, { url: 'https://example.com/post?utm_source=chat&real_id=7', note: 'my note', tags: ['design'] }, 'manual-key-01');
    expect(saved.canonicalUrl).toBe('https://example.com/post?real_id=7');
    expect(saved.contentStatus).toBe('UNKNOWN');
    expect(saved.metadata.metadataStatus).toBe('UNAVAILABLE');
    expect(() => instance.saveManualLink(alice, { url: 'http://127.0.0.1/private' })).toThrowError(SocialConnectorError);
    expect(() => instance.saveManualLink(alice, { url: 'http://169.254.169.254/latest' })).toThrowError(SocialConnectorError);
    expect(() => instance.saveManualLink(alice, { url: 'http://[::1]/private' })).toThrowError(SocialConnectorError);
  });

  it('rehydrates owner-scoped archive state through the explicit local persistence seam', () => {
    const persistence = new InMemorySocialPersistence();
    const first = service({ persistence });
    const item = first.saveManualLink(alice, { url: 'https://example.com/restart', note: 'persisted' });
    const second = service({ persistence });
    expect(second.getArchiveItem(alice, item.id).personalNote).toBe('persisted');
    expect(second.listArchive(bob).items).toHaveLength(0);
  });

  it('enforces private archive and collection IDOR boundaries', () => {
    const instance = service();
    const collection = instance.createCollection(alice, { name: 'Ideas' });
    const item = instance.saveManualLink(alice, { url: 'https://example.com/a' });
    expect(() => instance.getArchiveItem(bob, item.id)).toThrowError(SocialConnectorError);
    expect(() => instance.patchCollection(bob, collection.id, { name: 'hijack' })).toThrowError(SocialConnectorError);
    expect(instance.listArchive(bob).items).toHaveLength(0);
  });

  it('separates disconnect from delete and clears credential references', async () => {
    const store = new InMemorySocialCredentialStore();
    const instance = service({ credentialStore: store });
    const accountId = await connected(instance);
    expect(store.has(accountId)).toBe(true);
    await instance.disconnect(alice, accountId);
    expect(store.has(accountId)).toBe(false);
    expect(instance.listAccounts(alice)[0]?.status).toBe('DISCONNECTED');
    const item = instance.saveManualLink(alice, { url: 'https://example.com/keep' });
    expect(instance.getArchiveItem(alice, item.id)).toBeTruthy();
  });

  it('persists owner-bound scope settings and refuses fake automatic sync', async () => {
    const instance = service();
    const accountId = await connected(instance);
    const updated = instance.updateAccountSettings(alice, accountId, { requestedScopes: ['tweet.read', 'users.read'] });
    expect(updated.requestedScopes).toEqual(['tweet.read', 'users.read']);
    expect(instance.listAccounts(alice)[0]?.requestedScopes).toEqual(['tweet.read', 'users.read']);
    expect(() => instance.updateAccountSettings(bob, accountId, { requestedScopes: ['tweet.read'] })).toThrowError(SocialConnectorError);
    expect(() => instance.updateAccountSettings(alice, accountId, { autoSync: true })).toThrowError(SocialConnectorError);
  });

  it('does not expose unverified X/Douyin publish or unsupported likes as success', async () => {
    const instance = service();
    const accountId = await connected(instance);
    const item = instance.saveManualLink(alice, { url: 'https://example.com/publish' });
    const result = await instance.publishExternal(alice, { archiveItemId: item.id, accountId });
    expect(result.status).toBe('NOT_SUPPORTED');
    expect(instance.listProviders().find((entry) => entry.provider === 'DOUYIN')?.officialApiVerified).toBe(false);
    expect(instance.getProviderCapabilities('DOUYIN').find((entry) => entry.capability === 'FAVORITES_READ')?.status).toBe('UNSUPPORTED');
  });

  it('requires the server-derived Founder entitlement and keeps Founder content separate', async () => {
    const instance = service({ founderUserId: alice.userId, entitlementResolver: { hasUser: (userId, capability) => userId === bob.userId && capability === 'FOUNDER_CURATED_SOCIAL_ACCESS' } });
    const item = instance.saveManualLink(alice, { url: 'https://example.com/founder' });
    const curated = instance.curateFounder(alice, { archiveItemId: item.id, audience: 'PRO_MAX' });
    expect(curated.isFounderCurated).toBe(true);
    await expect(instance.listFounderFeed(alice)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await instance.listFounderFeed(bob)).items).toHaveLength(1);
  });

  it('uses the shared Founder directory seam instead of an admin-shaped role', () => {
    const directory = { getFounderUserId: () => alice.userId, isFounder: (principal: AuthenticatedPrincipal) => principal.userId === alice.userId };
    const instance = service({ founderDirectory: directory });
    const item = instance.saveManualLink(alice, { url: 'https://example.com/founder-directory' });
    expect(instance.curateFounder(alice, { archiveItemId: item.id, audience: 'PUBLIC' }).isFounderCurated).toBe(true);
    expect(() => instance.curateFounder(bob, { archiveItemId: item.id, audience: 'PUBLIC' })).toThrowError(SocialConnectorError);
  });

  it('does not allow a normal admin-shaped principal to invoke Root social reads', async () => {
    const instance = service({ rootAuthorizer: { canReadSocialArchive: () => false } });
    const item = instance.saveManualLink(alice, { url: 'https://example.com/root' });
    expect(item.ownerId).toBe(alice.userId);
    await expect(instance.getRootArchive({ ...bob, roles: ['ADMIN'] }, alice.userId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('fails closed when real provider adapters are not configured', async () => {
    const instance = service({ providers: { X: new UnavailableSocialConnectorProvider('X') } });
    await expect(instance.startOAuth(alice, { provider: 'X', redirectUri: 'http://localhost:5173/social/callback', consentVersion: 'social-v1', requestedScopes: ['profile.read'] })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });
});
