import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import {
  AdminAiGatewayApiAdapter,
  AdminAiGatewayService,
  AiGatewayApiAdapter,
  AiGatewayService,
  InMemoryAiGatewayAdminAuditSink,
  PrincipalAiGatewayAdminAuthorizer,
} from './index.js';

const alice: AuthenticatedPrincipal = {
  userId: '00000000-0000-4000-8000-000000000011',
  sessionId: 'alice-session',
  roles: [],
  issuedAt: '2026-08-18T00:00:00.000Z',
};

const bob: AuthenticatedPrincipal = {
  userId: '00000000-0000-4000-8000-000000000012',
  sessionId: 'bob-session',
  roles: [],
  issuedAt: '2026-08-18T00:00:00.000Z',
};

const root: AuthenticatedPrincipal = {
  userId: '00000000-0000-4000-8000-000000000013',
  sessionId: 'root-session',
  roles: [],
  issuedAt: '2026-08-18T00:00:00.000Z',
  adminIdentityId: '00000000-0000-4000-8000-000000000014',
  adminType: 'ORIGINAL_DEVELOPER_ROOT',
  adminCapabilities: ['ROOT_MANAGE_AI_GATEWAY'],
};

function service() {
  let sequence = 0;
  return new AiGatewayService({
    runtime: {
      now: () => '2026-08-18T00:00:00.000Z',
      id: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    },
  });
}

function consumerInvocationBody() {
  return {
    modelCode: 'LOCAL_ECHO_V1',
    capabilityCode: 'CHAT_COMPLETION',
    messages: [{ role: 'USER', content: '只应由服务端授权处理。' }],
    stream: true,
  };
}

describe('Phase 8 AI Gateway route adapters', () => {
  it('has self-only consumer routes, rejects forged ownership/root fields, and returns no raw internal error', () => {
    const gateway = service();
    const adapter = new AiGatewayApiAdapter(gateway);
    const created = adapter.handle({
      method: 'POST',
      path: '/v1/ai-gateway/invocations',
      principal: alice,
      body: consumerInvocationBody(),
      headers: { 'Idempotency-Key': 'consumer-invoke-01' },
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: 'SUCCEEDED', providerCode: 'LOCAL' });

    const forged = adapter.handle({
      method: 'POST',
      path: '/v1/ai-gateway/invocations',
      principal: alice,
      body: { ...consumerInvocationBody(), ownerId: bob.userId, admin: true, planCode: 'PRO_MAX' },
      headers: { 'Idempotency-Key': 'consumer-invoke-02' },
    });
    expect(forged.status).toBe(400);
    expect(forged.body.error).toMatchObject({ code: 'VALIDATION' });
    expect(JSON.stringify(forged.body)).not.toContain('ownerId');
    expect(JSON.stringify(forged.body)).not.toContain('PRO_MAX');

    const guessed = adapter.handle({
      method: 'GET',
      path: '/v1/ai-gateway/invocations/00000000-0000-4000-8000-000000000001',
      principal: bob,
    });
    expect(guessed.status).toBe(404);
    expect(guessed.body.error?.message).toBe('AI Gateway resource was not found.');
    expect(adapter.handle({ method: 'GET', path: '/v1/admin/ai-gateway/providers', principal: alice }).status).toBe(404);
  });

  it('requires header idempotency keys, exposes only safe BYOK status, and creates private AI conversations', () => {
    const adapter = new AiGatewayApiAdapter(service());
    expect(adapter.handle({
      method: 'POST',
      path: '/v1/ai-gateway/conversations',
      principal: alice,
      body: { title: '我的私有实验' },
    })).toMatchObject({ status: 400, body: { error: { code: 'VALIDATION' } } });

    const conversation = adapter.handle({
      method: 'POST',
      path: '/v1/ai-gateway/conversations',
      principal: alice,
      body: { title: '我的私有实验' },
      headers: { 'Idempotency-Key': 'conversation-api-01' },
    });
    expect(conversation.body.data).toMatchObject({ title: '我的私有实验', status: 'ACTIVE' });
    const byok = adapter.handle({ method: 'GET', path: '/v1/ai-gateway/byok', principal: alice });
    expect(byok.status).toBe(200);
    expect(JSON.stringify(byok.body.data)).not.toMatch(/ciphertext|keyId|encryptedEnvelope|providerKey/i);
    expect(byok.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerCode: 'OPENAI', maskedFingerprint: null }),
    ]));
  });

  it('keeps saved Provider/Model defaults self-scoped and rejects authority fields', () => {
    const adapter = new AiGatewayApiAdapter(service());
    const initial = adapter.handle({ method: 'GET', path: '/v1/ai-gateway/preferences', principal: alice });
    expect(initial).toMatchObject({
      status: 200,
      body: { data: { defaultProviderCode: null, defaultModelCode: null } },
    });
    const forged = adapter.handle({
      method: 'PATCH',
      path: '/v1/ai-gateway/preferences',
      principal: alice,
      body: { defaultProviderCode: 'LOCAL', defaultModelCode: 'LOCAL_ECHO_V1', ownerId: bob.userId, planCode: 'PRO_MAX' },
    });
    expect(forged).toMatchObject({ status: 400, body: { error: { code: 'VALIDATION' } } });

    expect(adapter.handle({
      method: 'PATCH',
      path: '/v1/ai-gateway/preferences',
      principal: alice,
      body: { defaultProviderCode: 'LOCAL', defaultModelCode: 'LOCAL_ECHO_V1' },
    })).toMatchObject({
      status: 200,
      body: { data: { defaultProviderCode: 'LOCAL', defaultModelCode: 'LOCAL_ECHO_V1' } },
    });
    expect(adapter.handle({ method: 'GET', path: '/v1/ai-gateway/preferences', principal: bob })).toMatchObject({
      status: 200,
      body: { data: { defaultProviderCode: null, defaultModelCode: null } },
    });
  });

  it('separates Root provider operations from consumer routes and appends audit data only after authorization', () => {
    const gateway = service();
    const audit = new InMemoryAiGatewayAdminAuditSink();
    const admin = new AdminAiGatewayApiAdapter(
      new AdminAiGatewayService(gateway, new PrincipalAiGatewayAdminAuthorizer(), audit),
    );
    expect(admin.handle({ method: 'GET', path: '/v1/admin/ai-gateway/providers', principal: alice })).toMatchObject({
      status: 403,
      body: { error: { code: 'FORBIDDEN' } },
    });
    const providers = admin.handle({ method: 'GET', path: '/v1/admin/ai-gateway/providers', principal: root });
    expect(providers.status).toBe(200);
    if (!('data' in providers.body)) throw new Error('Expected a successful provider response.');
    expect(JSON.stringify(providers.body.data)).not.toMatch(/secretReference|ciphertext|encryptedEnvelope|fingerprint/i);
    const disabled = admin.handle({
      method: 'POST',
      path: '/v1/admin/ai-gateway/providers/LOCAL/status',
      principal: root,
      body: { status: 'DISABLED', reason: 'maintenance' },
    });
    expect(disabled).toMatchObject({ status: 200, body: { data: { code: 'LOCAL', status: 'DISABLED' } } });
    expect(audit.events).toEqual([expect.objectContaining({
      action: 'PROVIDER_DISABLED', actorUserId: root.userId, providerCode: 'LOCAL', reason: 'maintenance',
    })]);
  });

  it('accepts a Root-only managed credential locator without returning or auditing the locator', () => {
    const gateway = service();
    const audit = new InMemoryAiGatewayAdminAuditSink();
    const admin = new AdminAiGatewayApiAdapter(
      new AdminAiGatewayService(gateway, new PrincipalAiGatewayAdminAuthorizer(), audit),
    );
    const path = '/v1/admin/ai-gateway/providers/OPENAI/system-credential-reference';
    const secretReference = 'kms:ai-gateway/openai-production';
    expect(admin.handle({
      method: 'POST', path, principal: alice,
      body: { secretReference, reason: 'Rotate managed credential reference.' },
    })).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } });
    expect(audit.events).toHaveLength(0);

    const configured = admin.handle({
      method: 'POST', path, principal: root,
      body: { secretReference, reason: 'Rotate managed credential reference.' },
    });
    expect(configured).toMatchObject({ status: 200, body: { data: { providerCode: 'OPENAI', status: 'CONFIGURED' } } });
    expect(JSON.stringify(configured)).not.toContain(secretReference);
    expect(JSON.stringify(audit.events)).not.toContain(secretReference);
    expect(audit.events).toEqual([expect.objectContaining({
      action: 'SYSTEM_CREDENTIAL_CHANGED', providerCode: 'OPENAI', actorUserId: root.userId,
    })]);

    const status = admin.handle({
      method: 'GET',
      path: '/v1/admin/ai-gateway/providers/OPENAI/system-credential-status',
      principal: root,
    });
    expect(status).toMatchObject({ status: 200, body: { data: { providerCode: 'OPENAI', status: 'CONFIGURED' } } });
    expect(JSON.stringify(status)).not.toContain(secretReference);
    expect(audit.events.at(-1)).toMatchObject({ action: 'SYSTEM_CREDENTIAL_STATUS_READ', providerCode: 'OPENAI' });

    expect(admin.handle({
      method: 'POST',
      path: '/v1/admin/ai-gateway/providers/LOCAL/system-credential-reference',
      principal: root,
      body: { secretReference, reason: 'No local secret.' },
    })).toMatchObject({ status: 400, body: { error: { code: 'VALIDATION' } } });
  });
});
