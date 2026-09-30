import { describe, expect, it } from 'vitest';

import {
  adminAccessRequestSchema,
  aiUsageBatchIngestSchema,
  aiUsageManualSessionCreateSchema,
  aiUsagePreferencesPatchSchema,
  authExternalVerifySchema,
  authVerifyOtpSchema,
  channelCreateSchema,
  channelPostCreateSchema,
  communityQuoteCreateSchema,
  cnyFenSchema,
  personalAiExportRequestSchema,
  personalAiExportStatusSchema,
  privateRecordCreateSchema,
} from './index.js';

describe('input schemas', () => {
  it('permits integer fen and rejects floating point money', () => {
    expect(cnyFenSchema.safeParse(4_000).success).toBe(true);
    expect(cnyFenSchema.safeParse(4_001).success).toBe(true);
    expect(cnyFenSchema.safeParse(4_000.5).success).toBe(false);
  });

  it('does not give a client a public visibility switch for private records', () => {
    const result = privateRecordCreateSchema.safeParse({
      kind: 'LIFE',
      occurredAt: '2026-08-16T12:00:00.000Z',
      timezone: 'Asia/Taipei',
      visibility: 'COMMUNITY',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect('visibility' in result.data).toBe(false);
    }
  });

  it('keeps consent in the auth verification payload', () => {
    const result = authVerifyOtpSchema.safeParse({
      challengeId: '00000000-0000-4000-8000-000000000000',
      code: '123456',
      consent: { termsVersion: '2026-08', privacyVersion: '2026-08' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.consent?.privacyVersion).toBe('2026-08');
    }

    const external = authExternalVerifySchema.safeParse({
      provider: 'GOOGLE',
      credential: 'mock-credential',
      consent: { termsVersion: '2026-08', privacyVersion: '2026-08' },
    });
    expect(external.success).toBe(true);
  });

  it('keeps admin actor and root role server-derived', () => {
    const result = adminAccessRequestSchema.safeParse({
      targetUserId: '00000000-0000-4000-8000-000000000000',
      resourceType: 'life',
      action: 'READ_LIFE',
      adminType: 'ORIGINAL_DEVELOPER_ROOT',
      adminId: '00000000-0000-4000-8000-000000000001',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect('adminType' in result.data).toBe(false);
      expect('adminId' in result.data).toBe(false);
    }
  });

  it('requires explicit channel publication content', () => {
    const channel = channelCreateSchema.safeParse({
      type: 'COMMUNITY',
      slug: 'reading-notes',
      name: 'Reading notes',
      ownerId: '00000000-0000-4000-8000-000000000000',
    });
    expect(channel.success).toBe(true);
    if (channel.success) expect('ownerId' in channel.data).toBe(false);

    expect(
      channelPostCreateSchema.safeParse({
        channelId: '00000000-0000-4000-8000-000000000000',
      }).success,
    ).toBe(false);
    expect(
      channelPostCreateSchema.safeParse({
        channelId: '00000000-0000-4000-8000-000000000000',
        body: 'explicit post',
      }).success,
    ).toBe(true);
  });

  it('keeps Quote input to commentary only; the original post comes from the route', () => {
    expect(communityQuoteCreateSchema.safeParse({ commentary: 'My view' }).success).toBe(true);
    expect(communityQuoteCreateSchema.safeParse({}).success).toBe(true);
    expect(communityQuoteCreateSchema.safeParse({ originalPostId: '00000000-0000-4000-8000-000000000000' }).success).toBe(false);
    expect(communityQuoteCreateSchema.safeParse({ body: 'copied source text' }).success).toBe(false);
    expect(communityQuoteCreateSchema.safeParse({ ownerId: '00000000-0000-4000-8000-000000000000' }).success).toBe(false);
  });

  it('makes AI Usage collection metadata-only and keeps manual entry separate', () => {
    const event = {
      clientEventId: 'event-0001',
      appCode: 'CODEX',
      activityHash: `sha256:${'a'.repeat(64)}`,
      startedAt: '2026-08-18T00:00:00.000Z',
      endedAt: '2026-08-18T00:01:00.000Z',
      activeSeconds: 60,
      idleSeconds: 0,
    };
    expect(aiUsageBatchIngestSchema.safeParse({ batchId: 'batch-0001', events: [event] }).success).toBe(true);
    expect(aiUsageBatchIngestSchema.safeParse({
      batchId: 'batch-0001', events: [{ ...event, prompt: 'must never be accepted' }],
    }).success).toBe(false);
    expect(aiUsageBatchIngestSchema.safeParse({
      batchId: 'batch-0001', events: [{ ...event, fullUrl: 'https://private.example/path' }],
    }).success).toBe(false);
    expect(aiUsagePreferencesPatchSchema.safeParse({ enabled: true, root: true }).success).toBe(false);
    expect(aiUsageManualSessionCreateSchema.safeParse({
      appCode: 'CHATGPT',
      startedAt: '2026-08-18T00:00:00.000Z',
      endedAt: '2026-08-18T00:01:00.000Z',
      activeSeconds: 60,
      idempotencyKey: 'manual-0001',
      source: 'WINDOWS_AGENT',
    }).success).toBe(false);
  });

  it('keeps Personal AI export self-only and metadata-only', () => {
    expect(personalAiExportRequestSchema.safeParse({
      includeConversations: true,
      includeDeletedInsights: false,
    }).success).toBe(true);
    expect(personalAiExportRequestSchema.safeParse({}).success).toBe(true);

    for (const forbidden of [
      { ownerId: '00000000-0000-4000-8000-000000000000' },
      { root: true },
      { sourceId: '00000000-0000-4000-8000-000000000001' },
      { originalArchiveContent: 'must remain in Archive export' },
      { chunkText: 'must not be exported' },
      { embeddingVector: [0.1, 0.2] },
      { question: 'must not be exported' },
      { providerSecret: 'must not be exported' },
    ]) {
      expect(personalAiExportRequestSchema.safeParse(forbidden).success).toBe(false);
    }

    expect(personalAiExportStatusSchema.safeParse('READY').success).toBe(true);
    expect(personalAiExportStatusSchema.safeParse('COMPLETED').success).toBe(false);
  });
});
