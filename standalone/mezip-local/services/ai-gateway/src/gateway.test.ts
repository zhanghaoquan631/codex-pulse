import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import {
  AiGatewayError,
  AiGatewayService,
  InMemoryAiGatewayByokVault,
  type AiGatewayByokCredentialValidator,
  type AiGatewayEntitlementResolver,
  type AiGatewayLocalAdapter,
} from './gateway.js';

const alice: AuthenticatedPrincipal = {
  userId: 'alice-user',
  sessionId: 'alice-session',
  roles: [],
  issuedAt: '2026-08-18T00:00:00.000Z',
};

const bob: AuthenticatedPrincipal = {
  userId: 'bob-user',
  sessionId: 'bob-session',
  roles: [],
  issuedAt: '2026-08-18T00:00:00.000Z',
};

const phase8MigrationPath = fileURLToPath(
  new URL('../../../infrastructure/database/009_phase8_ai_gateway.sql', import.meta.url),
);

function setup(options: ConstructorParameters<typeof AiGatewayService>[0] = {}) {
  let sequence = 0;
  const service = new AiGatewayService({
    runtime: {
      now: () => '2026-08-18T00:00:00.000Z',
      id: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    },
    ...options,
  });
  return service;
}

function expectCode(operation: () => unknown, code: AiGatewayError['code']): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(AiGatewayError);
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected AiGatewayError(${code})`);
}

function invocationInput(overrides: Partial<{
  modelCode: string;
  capabilityCode: 'CHAT_COMPLETION' | 'TEXT' | 'VISION';
  stream: boolean;
  context: { readonly scope: 'NONE' | 'SELECTED_ENTRY' };
  conversationId: string;
}> = {}) {
  return {
    modelCode: 'LOCAL_ECHO_V1',
    capabilityCode: 'CHAT_COMPLETION' as const,
    messages: [{ role: 'USER' as const, content: '请生成一条安全的本地测试回复。' }],
    stream: true,
    ...overrides,
  };
}

describe('Phase 8 AiGatewayService', () => {
  it('keeps the durable schema encrypted/metadata-only, Root-audited, and raw-table RLS protected', async () => {
    const migration = await readFile(phase8MigrationPath, 'utf8');
    expect(migration).toContain('ROOT_MANAGE_AI_GATEWAY');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ai_gateway_user_byok_credentials');
    expect(migration).toContain('encrypted_envelope text NOT NULL');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ai_gateway_invocations');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ai_gateway_admin_audit');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ai_gateway_model_availability');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ai_gateway_policies');
    expect(migration).toContain('SYSTEM_CREDENTIAL_CHANGED');
    expect(migration).toContain("'DEFAULT_TOOLS', '{\"execution\":\"DISABLED\",\"allowedToolCodes\":[]}'::jsonb");
    expect(migration).toContain('ALTER TABLE ai_gateway_user_byok_credentials FORCE ROW LEVEL SECURITY;');
    expect(migration).toContain('ALTER TABLE ai_gateway_invocations FORCE ROW LEVEL SECURITY;');
    expect(migration).toContain('ALTER TABLE ai_gateway_admin_audit FORCE ROW LEVEL SECURITY;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION mezip_guard_ai_gateway_admin_audit() FROM PUBLIC;');
    expect(migration).not.toMatch(/^\s*(api_key|provider_key|plaintext_key|prompt|response)\s/im);
  });

  it('keeps Phase 8 provider registry distinct from Phase 7 usage classification and preloads the capability vocabulary', () => {
    const service = setup();
    expect(service.listProviders(alice).map((entry) => entry.code)).toEqual(expect.arrayContaining([
      'LOCAL', 'OPENAI', 'OPENAI_COMPATIBLE', 'ANTHROPIC', 'GOOGLE', 'CUSTOM',
    ]));
    expect(service.listModels(alice).find((entry) => entry.code === 'LOCAL_ECHO_V1')).toMatchObject({
      providerCode: 'LOCAL', status: 'ACTIVE', supportsStreaming: true,
    });
    expect(service.listCapabilities(alice).map((entry) => entry.code)).toEqual(expect.arrayContaining([
      'TEXT', 'VISION', 'CODE', 'REASONING', 'IMAGE_GENERATION', 'AUDIO_INPUT',
      'AUDIO_OUTPUT', 'TOOL_CALLING', 'STRUCTURED_OUTPUT', 'STREAMING', 'EMBEDDING',
    ]));
    expect(service.listProviders(alice).find((entry) => entry.code === 'OPENAI')).toMatchObject({
      status: 'DISABLED', availability: 'NOT_CONFIGURED',
    });
  });

  it('runs only an explicit owner request, streams safe output events, meters server-side, and does not project the prompt or owner', () => {
    const service = setup();
    const invocation = service.createInvocation(alice, invocationInput(), 'invoke-0001');
    expect(invocation).toMatchObject({
      status: 'SUCCEEDED',
      providerCode: 'LOCAL',
      contextScope: 'NONE',
      toolPolicy: { execution: 'DISABLED', allowedToolCodes: [] },
      fallback: { used: false },
      metering: expect.objectContaining({ currency: 'CNY', costFen: 0 }),
    });
    expect(JSON.stringify(invocation)).not.toContain('alice-user');
    expect(JSON.stringify(invocation)).not.toContain('安全的本地测试回复');
    const events = service.listEvents(alice, invocation.id);
    expect(events.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      'INVOCATION_CREATED', 'STATUS_CHANGED', 'OUTPUT_DELTA', 'COMPLETED',
    ]));
    expect(events.events.filter((event) => event.textDelta !== null).map((event) => event.textDelta).join('')).toContain('本地 AI Gateway');
    expect(service.getQuota(alice).used).toBeGreaterThan(0);
  });

  it('enforces owner isolation, explicit no-context, idempotency, quota and server entitlement decisions', () => {
    const service = setup({ quotaTokensPerDay: 10_000, autoRunLocal: false });
    const conversation = service.createConversation(alice, { title: '我的实验' }, 'conversation-0001');
    const invocation = service.createInvocation(
      alice,
      invocationInput({ stream: false, conversationId: conversation.id }),
      'invoke-0002',
    );
    expectCode(() => service.getInvocation(bob, invocation.id), 'NOT_FOUND');
    expectCode(() => service.listEvents(bob, invocation.id), 'NOT_FOUND');
    expectCode(() => service.createInvocation(alice, invocationInput({ context: { scope: 'SELECTED_ENTRY' } }), 'invoke-0003'), 'VALIDATION');
    expect(service.createInvocation(alice, invocationInput({ stream: false, conversationId: conversation.id }), 'invoke-0002')).toMatchObject({ id: invocation.id });
    expectCode(() => service.createInvocation(alice, invocationInput({ capabilityCode: 'TEXT' }), 'invoke-0002'), 'IDEMPOTENCY_CONFLICT');
    expectCode(() => service.createInvocation(alice, invocationInput({ capabilityCode: 'VISION' }), 'invoke-0004'), 'VALIDATION');

    const denied: AiGatewayEntitlementResolver = { has: () => false };
    const deniedService = setup({ entitlementResolver: denied });
    expectCode(() => deniedService.createInvocation(alice, invocationInput(), 'invoke-denied'), 'ENTITLEMENT_REQUIRED');

    const labOnly: AiGatewayEntitlementResolver = {
      has: (_principal, entitlement) => entitlement === 'AI_LAB_ACCESS',
    };
    const capabilityDenied = setup({ entitlementResolver: labOnly });
    expectCode(() => capabilityDenied.createInvocation(alice, invocationInput(), 'invoke-capability-denied'), 'ENTITLEMENT_REQUIRED');
  });

  it('keeps private defaults owner-scoped and requires a currently active matching registry model', () => {
    const service = setup();
    expect(service.getPreferences(alice)).toMatchObject({ defaultProviderCode: null, defaultModelCode: null });
    expect(service.updatePreferences(alice, {
      defaultProviderCode: 'LOCAL', defaultModelCode: 'LOCAL_ECHO_V1',
    })).toMatchObject({ defaultProviderCode: 'LOCAL', defaultModelCode: 'LOCAL_ECHO_V1' });
    expect(service.getPreferences(bob)).toMatchObject({ defaultProviderCode: null, defaultModelCode: null });
    expectCode(() => service.updatePreferences(alice, {
      defaultProviderCode: 'OPENAI', defaultModelCode: 'LOCAL_ECHO_V1',
    }), 'VALIDATION');
  });

  it('uses bounded retry/circuit policy and a cancellation path without sending a request to another provider', () => {
    let attempts = 0;
    const failingAdapter: AiGatewayLocalAdapter = {
      invoke: () => {
        attempts += 1;
        throw new Error('simulated transport failure');
      },
      normalizeError: () => ({ code: 'TRANSIENT', retryable: true }),
    };
    const service = setup({
      localAdapter: failingAdapter,
      executionPolicy: { maxAttempts: 2, circuitFailureThreshold: 1, circuitOpenMs: 10_000 },
    });
    const first = service.createInvocation(alice, invocationInput({ stream: false }), 'invoke-circuit-01');
    expect(first.status).toBe('FAILED');
    expect(attempts).toBe(2);
    expectCode(() => service.createInvocation(alice, invocationInput({ stream: false }), 'invoke-circuit-02'), 'PROVIDER_UNAVAILABLE');

    const queued = setup({ autoRunLocal: false });
    const pending = queued.createInvocation(alice, invocationInput({ stream: false }), 'invoke-cancel-01');
    expect(queued.cancelInvocation(alice, pending.id, 'cancel-0001')).toMatchObject({ status: 'CANCELLED' });
    expect(queued.getQuota(alice).used).toBe(0);
  });

  it('keeps BYOK envelope status owner-scoped and never returns key material', () => {
    const vault = new InMemoryAiGatewayByokVault();
    const validator: AiGatewayByokCredentialValidator = {
      validate: () => ({ validationStatus: 'VALID', maskedFingerprint: '••••••••ABCD' }),
    };
    const service = setup({ byokVault: vault, byokCredentialValidator: validator });
    const configured = service.configureByok(
      alice,
      'OPENAI',
      {
        algorithm: 'RSA-OAEP-256',
        keyId: 'server-public-key-v1',
        ciphertext: 'A'.repeat(64),
      },
      'byok-configure-01',
    );
    expect(configured).toMatchObject({
      providerCode: 'OPENAI', status: 'CONFIGURED', validationStatus: 'VALID', maskedFingerprint: '••••••••ABCD',
    });
    expect(JSON.stringify(service.listByokStatus(alice))).not.toContain('server-public-key-v1');
    expect(JSON.stringify(service.listByokStatus(alice))).not.toContain('A'.repeat(64));
    expect(service.listByokStatus(bob).find((entry) => entry.providerCode === 'OPENAI')).toMatchObject({ status: 'NOT_CONFIGURED' });
    expect(service.revokeByok(alice, 'OPENAI', 'byok-revoke-0001')).toMatchObject({ status: 'REVOKED' });
  });
});
