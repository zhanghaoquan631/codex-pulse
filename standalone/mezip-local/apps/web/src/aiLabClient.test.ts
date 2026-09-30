import { describe, expect, it } from 'vitest';

import {
  ApiAiLabClient,
  createRuntimeAiLabClient,
  type AiLabSdkFacade,
} from './aiLabClient';

const meta = { requestId: 'ai-lab-web-test' } as const;

function facade(): AiLabSdkFacade {
  return {
    listProviders: async () => ({
      data: [{
        code: 'LOCAL', displayName: 'Local', adapterType: 'LOCAL_DETERMINISTIC', apiBaseConfigured: false, supportsDynamicModels: false, status: 'ACTIVE', availability: 'LOCAL_DEVELOPMENT', health: 'HEALTHY', credentialModes: ['NONE'], localOnly: true,
      }],
      meta,
    }),
    listModels: async () => ({
      data: [{
        code: 'LOCAL_ECHO_V1', providerCode: 'LOCAL', displayName: 'Local', status: 'ACTIVE', availability: 'LOCAL_DEVELOPMENT', health: 'HEALTHY', capabilityCodes: ['CHAT_COMPLETION', 'STREAMING'], contextWindow: 8192, maxInputTokens: 8192, maxOutputTokens: 512, supportsStreaming: true, pricingMetadata: null, releaseMetadata: null, deprecatedAt: null, lastSyncedAt: null,
      }],
      meta,
    }),
    listCapabilities: async () => ({
      data: [{ code: 'CHAT_COMPLETION', displayName: 'Chat', status: 'ACTIVE', description: 'text', inputModalities: ['TEXT'], outputModalities: ['TEXT'], requiresExplicitToolGrant: false }],
      meta,
    }),
    getQuota: async () => ({
      data: { unit: 'TOKENS', limit: 1000, used: 1, remaining: 999, periodStartedAt: '2026-08-18T00:00:00.000Z', resetsAt: '2026-08-19T00:00:00.000Z' },
      meta,
    }),
    getPreferences: async () => ({
      data: { defaultProviderCode: 'LOCAL', defaultModelCode: 'LOCAL_ECHO_V1', updatedAt: '2026-08-18T00:00:00.000Z' },
      meta,
    }),
    updatePreferences: async () => ({
      data: { defaultProviderCode: 'LOCAL', defaultModelCode: 'LOCAL_ECHO_V1', updatedAt: '2026-08-18T00:00:00.000Z' },
      meta,
    }),
    getByokStatus: async () => ({
      data: [{ providerCode: 'OPENAI', status: 'NOT_CONFIGURED', configuredAt: null, revokedAt: null, maskedFingerprint: null, validationStatus: 'UNKNOWN', lastValidatedAt: null }],
      meta,
    }),
    createInvocation: async () => ({
      data: {
        id: 'invoke-1', providerCode: 'LOCAL', modelCode: 'LOCAL_ECHO_V1', capabilityCode: 'CHAT_COMPLETION', status: 'SUCCEEDED', contextScope: 'NONE', conversationId: null,
        toolPolicy: { execution: 'DISABLED', allowedToolCodes: [] }, fallback: { used: false, fromModelCode: null, reasonCode: null },
        inputMessageCount: 1, inputCharacterCount: 5, outputText: 'server output', finishReason: 'STOP', latencyMs: 0,
        metering: { inputTokens: 1, outputTokens: 2, totalTokens: 3, costFen: 0, currency: 'CNY', meteredAt: '2026-08-18T00:00:00.000Z' },
        createdAt: '2026-08-18T00:00:00.000Z', startedAt: '2026-08-18T00:00:00.000Z', completedAt: '2026-08-18T00:00:00.000Z', cancelledAt: null,
      },
      meta,
    }),
    getInvocation: async () => ({ error: { code: 'NOT_FOUND', message: 'opaque', retryable: false, requestId: 'not-used' } }),
    cancelInvocation: async () => ({ error: { code: 'NOT_FOUND', message: 'opaque', retryable: false, requestId: 'not-used' } }),
    listEvents: async () => ({ data: { invocationId: 'invoke-1', events: [], nextAfterSequence: 0 }, meta }),
    getStreamHandshake: async () => ({ data: { invocationId: 'invoke-1', transport: 'POLL', afterSequence: 0, eventsPath: '/opaque' }, meta }),
    revokeByok: async () => ({ error: { code: 'FORBIDDEN', message: 'opaque', retryable: false, requestId: 'not-used' } }),
  };
}

describe('AI Lab client boundary', () => {
  it('fails closed in production without an explicitly configured HTTPS gateway origin', async () => {
    const noConfig = createRuntimeAiLabClient({ production: true });
    const insecure = createRuntimeAiLabClient({ production: true, apiBaseUrl: 'http://localhost:3000' });
    expect(noConfig.source).toBe('UNAVAILABLE');
    expect(insecure.source).toBe('UNAVAILABLE');
    expect(await noConfig.readSnapshot()).toMatchObject({ ok: false, source: 'UNAVAILABLE' });
  });

  it('uses only safe server projections and maps opaque failures to reviewed copy', async () => {
    const client = new ApiAiLabClient(facade());
    const snapshot = await client.readSnapshot();
    expect(snapshot).toMatchObject({ ok: true, source: 'SERVER' });
    if (!snapshot.ok) return;
    expect(JSON.stringify(snapshot.data)).not.toMatch(/userId|ciphertext|encryptedEnvelope|keyId|providerKey/i);
    const invocation = await client.createInvocation({
      modelCode: 'LOCAL_ECHO_V1', capabilityCode: 'CHAT_COMPLETION', prompt: 'hello', stream: true, idempotencyKey: 'web-invoke-01',
    });
    expect(invocation).toMatchObject({ ok: true, data: { outputText: 'server output', status: 'SUCCEEDED' } });
    const revoke = await client.revokeByok({ providerCode: 'OPENAI', idempotencyKey: 'web-revoke-01' });
    expect(revoke).toMatchObject({ ok: false, error: { code: 'FORBIDDEN', message: '当前账号无权执行此 AI 调用。' } });
  });

  it('does not turn invalid prompt input into a gateway request', async () => {
    const client = new ApiAiLabClient(facade());
    const result = await client.createInvocation({
      modelCode: 'LOCAL_ECHO_V1', capabilityCode: 'CHAT_COMPLETION', prompt: '  ', stream: true, idempotencyKey: 'web-invoke-02',
    });
    expect(result).toMatchObject({ ok: false, source: 'SERVER', error: { code: 'VALIDATION' } });
  });
});
