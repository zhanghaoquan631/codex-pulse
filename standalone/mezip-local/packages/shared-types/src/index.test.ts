import { describe, expect, it } from 'vitest';

import {
  adminCapabilityCodes,
  aiUsageAppCodes,
  aiUsageSources,
  archiveSnapshotVisibilities,
  contentVisibilityCodes,
  membershipPriceFen,
  personalAiExportExcludedDataCategories,
  personalAiExportSections,
  personalAiExportStatuses,
  planCodes,
  recordKinds,
  accountScopedCacheKey,
  canUsePlatformCapability,
  isOfflineQueueableOperation,
  parseMezipDeepLink,
  PlatformCapabilityRegistry,
} from './index.js';

describe('shared ME.zip contracts', () => {
  it('keeps the frozen plans and private-record categories available to every client', () => {
    expect(planCodes).toEqual(['FREE', 'GO', 'PLUS', 'PRO', 'PRO_MAX']);
    expect(membershipPriceFen).toEqual({
      FREE: 0,
      GO: 1_000,
      PLUS: 2_000,
      PRO: 4_000,
      PRO_MAX: 8_000,
    });
    expect(Object.values(membershipPriceFen).every(Number.isSafeInteger)).toBe(true);
    expect(recordKinds).toContain('LIFE');
    expect(recordKinds).toContain('AI');
  });

  it('keeps ordinary privacy independent from membership plans', () => {
    expect(contentVisibilityCodes).toEqual([
      'PRIVATE',
      'COMMUNITY',
      'GROUP',
      'DIRECT_SHARE',
      'PUBLIC',
      'SNAPSHOT',
    ]);
    expect(archiveSnapshotVisibilities).not.toContain('PRO_MAX');
    expect(adminCapabilityCodes).toContain('ROOT_READ_PRIVATE_MESSAGES');
    expect(adminCapabilityCodes).toContain('ROOT_READ_AI_USAGE');
    expect(adminCapabilityCodes).toContain('ROOT_BULK_EXPORT');
    expect(aiUsageAppCodes).toEqual(expect.arrayContaining([
      'CHATGPT', 'CODEX', 'CLAUDE', 'CLAUDE_CODE', 'CURSOR', 'GEMINI', 'COPILOT', 'PERPLEXITY',
    ]));
    expect(aiUsageSources).toEqual(expect.arrayContaining(['WINDOWS_AGENT', 'BROWSER_EXTENSION', 'MANUAL', 'MOBILE', 'IMPORT']));
  });

  it('keeps Personal AI export limited to metadata and citation references', () => {
    expect(personalAiExportStatuses).toEqual(['PENDING', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED', 'DELETED']);
    expect(personalAiExportSections).toEqual(expect.arrayContaining([
      'PREFERENCES',
      'CONSENT_HISTORY',
      'INDEX_MANIFEST',
      'INSIGHT_METADATA',
      'CITATION_REFERENCES',
      'CONVERSATION_METADATA',
    ]));
    expect(personalAiExportExcludedDataCategories).toEqual(expect.arrayContaining([
      'ORIGINAL_ARCHIVE_CONTENT',
      'KNOWLEDGE_CHUNK_TEXT',
      'RAW_EMBEDDING_VECTORS',
      'QUERY_PROMPT_OR_QUESTION_TEXT',
      'PROVIDER_SECRETS',
    ]));
  });

  it('keeps platform capability and offline behavior explicit', () => {
    expect(canUsePlatformCapability({ status: 'READ_ONLY' }, 'READ')).toBe(true);
    expect(canUsePlatformCapability({ status: 'READ_ONLY' }, 'WRITE')).toBe(false);
    expect(canUsePlatformCapability({ status: 'PRODUCTION_PENDING' }, 'READ')).toBe(false);
    expect(isOfflineQueueableOperation('LIFE_DRAFT')).toBe(true);
    expect(isOfflineQueueableOperation('PAYMENT')).toBe(false);
  });

  it('parses only trusted internal deep links and scopes client caches per account', () => {
    expect(parseMezipDeepLink('https://app.mezip.example/social/post/post_42', 'https://app.mezip.example'))
      .toEqual({ kind: 'POST', resourceId: 'post_42' });
    expect(parseMezipDeepLink('https://other.example/social/post/post_42', 'https://app.mezip.example'))
      .toBeUndefined();
    expect(parseMezipDeepLink('https://app.mezip.example/social/post/post_42?ownerId=other', 'https://app.mezip.example'))
      .toBeUndefined();
    expect(accountScopedCacheKey('drafts', 'user_1')).not.toEqual(accountScopedCacheKey('drafts', 'user_2'));
  });

  it('fails closed when a client capability was never registered', () => {
    const capabilities = new PlatformCapabilityRegistry([{
      platform: 'WEB_DESKTOP',
      feature: 'LIFE',
      status: 'FULL',
      message: '可用',
    }]);
    expect(capabilities.canUse('WEB_DESKTOP', 'LIFE', 'WRITE')).toBe(true);
    expect(capabilities.canUse('IOS', 'BILLING_HISTORY', 'READ')).toBe(false);
    expect(capabilities.get('IOS', 'BILLING_HISTORY').status).toBe('NOT_SUPPORTED');
  });
});
