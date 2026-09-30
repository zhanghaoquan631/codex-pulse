import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import {
  AdminAiUsageReader,
  AiUsageError,
  AiUsageService,
} from './ai-usage.js';
import {
  AiUsageArchiveIntegration,
  toAiUsageDailyPackStats,
} from './archive-integration.js';
import { AiUsageApiAdapter } from './api.js';

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
const root: AuthenticatedPrincipal = {
  userId: 'root-user',
  sessionId: 'root-session',
  roles: [],
  issuedAt: '2026-08-18T00:00:00.000Z',
  adminIdentityId: 'root-identity',
};

const phase7MigrationPath = fileURLToPath(
  new URL('../../../infrastructure/database/008_phase7_ai_usage.sql', import.meta.url),
);

function setup() {
  let sequence = 0;
  let now = '2026-08-18T00:00:00.000Z';
  const service = new AiUsageService({
    runtime: {
      now: () => now,
      id: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
      token: () => `credential-${String(++sequence).padStart(40, '0')}`,
      pairingCode: () => `PAIRCODE${String(++sequence).padStart(2, '0')}`,
    },
  });
  return { service, setNow: (value: string) => { now = value; } };
}

function expectCode(operation: () => unknown, code: AiUsageError['code']): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(AiUsageError);
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected AiUsageError(${code})`);
}

function automaticFixture(service: AiUsageService, deviceType: 'WINDOWS_AGENT' | 'BROWSER_EXTENSION') {
  service.updatePreferences(alice, {
    enabled: true,
    windowsAgentEnabled: true,
    browserExtensionEnabled: true,
    timezone: 'UTC',
  });
  const pairing = service.createPairing(alice, { deviceType, deviceLabel: `${deviceType} test` });
  return service.completePairing(pairing.pairingId, { pairingCode: pairing.pairingCode });
}

const event = (overrides: Partial<{
  clientEventId: string;
  appCode: 'CODEX' | 'CHATGPT';
  activityHash: string;
  startedAt: string;
  endedAt: string;
  activeSeconds: number;
  idleSeconds: number;
}> = {}) => ({
  clientEventId: 'event-0001',
  appCode: 'CODEX' as const,
  activityHash: `sha256:${'a'.repeat(64)}`,
  startedAt: '2026-08-18T00:00:00.000Z',
  endedAt: '2026-08-18T00:01:00.000Z',
  activeSeconds: 60,
  idleSeconds: 0,
  ...overrides,
});

describe('Phase 7 AiUsageService', () => {
  it('keeps the durable schema metadata-only, replayable, and inaccessible to direct consumer reads', async () => {
    const migration = await readFile(phase7MigrationPath, 'utf8');
    expect(migration).toContain('ROOT_READ_AI_USAGE');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ai_usage_sessions');
    expect(migration).toContain('accepted_session_ids uuid[]');
    expect(migration).toContain('deduplicated_session_ids uuid[]');
    expect(migration).toContain('ALTER TABLE ai_usage_sessions FORCE ROW LEVEL SECURITY;');
    expect(migration).not.toContain('CREATE POLICY ai_usage_sessions_owner_read');
    expect(migration).not.toMatch(/^\s*(prompt|response|clipboard|keystroke|cookie|token|full_url)\s/imu);
  });

  it('preloads the approved app registry and keeps it distinct from a provider API registry', () => {
    const { service } = setup();
    expect(service.listApps().map((app) => app.code)).toEqual(expect.arrayContaining([
      'CHATGPT', 'CODEX', 'CLAUDE', 'CLAUDE_CODE', 'CURSOR', 'GEMINI', 'COPILOT', 'PERPLEXITY',
    ]));
    expect(service.listApps().find((app) => app.code === 'CODEX')?.providerCode).toBe('OPENAI');
    expect(service.listProviders().map((provider) => provider.code)).toContain('ANTHROPIC');
  });

  it('uses one-time pairing and a scoped credential without exposing verifier material', () => {
    const { service } = setup();
    const pairing = service.createPairing(alice, { deviceType: 'WINDOWS_AGENT', deviceLabel: 'My PC' });
    const grant = service.completePairing(pairing.pairingId, { pairingCode: pairing.pairingCode });
    expect(grant.scopes).toEqual(['AI_USAGE_INGEST']);
    expect(grant.deviceCredential).toContain('credential-');
    expect(service.listDevices(alice)).toEqual([expect.objectContaining({ id: grant.device.id, status: 'ACTIVE' })]);
    expect(JSON.stringify(service.listDevices(alice))).not.toContain('credential-');
    expect(JSON.stringify(service.listPairings(alice))).not.toContain(pairing.pairingCode);
    expectCode(() => service.completePairing(pairing.pairingId, { pairingCode: pairing.pairingCode }), 'CONFLICT');
  });

  it('accepts only enabled paired collector metadata and makes offline batch retries idempotent', () => {
    const { service } = setup();
    const grant = automaticFixture(service, 'WINDOWS_AGENT');
    const input = { batchId: 'batch-0001', events: [event()] };
    const first = service.ingestBatch(grant.deviceCredential, input);
    const replay = service.ingestBatch(grant.deviceCredential, input);
    expect(first.acceptedSessionIds).toHaveLength(1);
    expect(replay).toEqual({ ...first, replayed: true });
    expect(service.getOverview(alice).totalActiveSeconds).toBe(60);
    expectCode(() => service.ingestBatch(grant.deviceCredential, {
      batchId: 'batch-0001',
      events: [event({ activeSeconds: 59 })],
    }), 'IDEMPOTENCY_CONFLICT');
  });

  it('rejects passive tracking while disabled, rejects sensitive payload fields, and stops a revoked device', () => {
    const { service } = setup();
    const pairing = service.createPairing(alice, { deviceType: 'WINDOWS_AGENT' });
    const grant = service.completePairing(pairing.pairingId, { pairingCode: pairing.pairingCode });
    expectCode(() => service.ingestBatch(grant.deviceCredential, { batchId: 'batch-0002', events: [event()] }), 'TRACKING_DISABLED');
    service.updatePreferences(alice, { enabled: true, windowsAgentEnabled: true });
    expectCode(() => service.ingestBatch(grant.deviceCredential, {
      batchId: 'batch-0002',
      events: [{ ...event(), prompt: 'private prompt must never be collected' } as never],
    }), 'PRIVACY_VIOLATION');
    expect(service.getOverview(alice).totalActiveSeconds).toBe(0);
    service.revokeDevice(alice, grant.device.id);
    expectCode(() => service.ingestBatch(grant.deviceCredential, { batchId: 'batch-0003', events: [event()] }), 'DEVICE_REVOKED');
  });

  it('uses server-derived source precedence so multi-device reports never double count', () => {
    const { service } = setup();
    const browser = automaticFixture(service, 'BROWSER_EXTENSION');
    const windows = automaticFixture(service, 'WINDOWS_AGENT');
    const sharedHash = `sha256:${'b'.repeat(64)}`;
    service.ingestBatch(browser.deviceCredential, {
      batchId: 'browser-batch-1',
      events: [event({ clientEventId: 'browser-event-1', activityHash: sharedHash })],
    });
    service.ingestBatch(windows.deviceCredential, {
      batchId: 'windows-batch-1',
      events: [event({ clientEventId: 'windows-event-1', activityHash: sharedHash })],
    });
    const sessions = service.listSessions(alice);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.source).toBe('WINDOWS_AGENT');
    expect(service.getOverview(alice).totalActiveSeconds).toBe(60);
  });

  it('splits aggregates at the account local midnight and supports explicit manual/import records', () => {
    const { service } = setup();
    service.updatePreferences(alice, { timezone: 'Asia/Taipei' });
    const manual = service.createManualSession(alice, {
      appCode: 'CHATGPT',
      startedAt: '2026-08-17T15:59:00.000Z',
      endedAt: '2026-08-17T16:01:00.000Z',
      activeSeconds: 120,
      idleSeconds: 0,
      idempotencyKey: 'manual-0001',
    });
    const imported = service.importSession(alice, {
      appCode: 'CODEX',
      startedAt: '2026-08-18T01:00:00.000Z',
      endedAt: '2026-08-18T01:01:00.000Z',
      activeSeconds: 60,
      idleSeconds: 0,
      externalRecordId: 'import-record-01',
      idempotencyKey: 'import-0001',
    });
    expect(manual.deviceId).toBeNull();
    expect(manual.source).toBe('MANUAL');
    expect(imported.source).toBe('IMPORT');
    expect(JSON.stringify(service.listSessions(alice))).not.toContain(alice.userId);
    expect(JSON.stringify(service.listSessions(alice))).not.toContain('sha256:');
    const daily = service.getOverview(alice).daily.filter((row) => row.appCode === 'CHATGPT');
    expect(daily.map((row) => [row.localDay, row.activeSeconds])).toEqual(expect.arrayContaining([
      ['2026-08-17', 60],
      ['2026-08-18', 60],
    ]));
  });

  it('does not merge separately entered manual sessions merely because their times coincide', () => {
    const { service } = setup();
    const base = {
      appCode: 'CHATGPT' as const,
      startedAt: '2026-08-18T03:00:00.000Z',
      endedAt: '2026-08-18T03:01:00.000Z',
      activeSeconds: 60,
      idleSeconds: 0,
    };
    service.createManualSession(alice, { ...base, idempotencyKey: 'manual-distinct-01' });
    service.createManualSession(alice, { ...base, idempotencyKey: 'manual-distinct-02' });
    expect(service.listSessions(alice)).toHaveLength(2);
    expect(service.getOverview(alice).totalActiveSeconds).toBe(120);
  });

  it('offers a private Daily Pack/Timeline aggregate seam without raw activity metadata', async () => {
    const { service } = setup();
    service.updatePreferences(alice, { timezone: 'Asia/Taipei' });
    service.createManualSession(alice, {
      appCode: 'CODEX',
      startedAt: '2026-08-17T16:00:00.000Z',
      endedAt: '2026-08-17T16:01:00.000Z',
      activeSeconds: 60,
      idleSeconds: 0,
      idempotencyKey: 'daily-pack-usage-01',
    });
    const integration = new AiUsageArchiveIntegration(service);
    const contribution = integration.buildDailyPackContribution(alice, '2026-08-18');
    expect(contribution).toMatchObject({
      localDay: '2026-08-18', timezone: 'Asia/Taipei', activeSeconds: 60,
      apps: [expect.objectContaining({ appCode: 'CODEX', providerCode: 'OPENAI' })],
    });
    const received: unknown[] = [];
    await expect(integration.mergeIntoDailyPack(alice, '2026-08-18', {
      mergeAiUsageDailyPack: (principal, input) => { received.push({ principal, input }); },
    })).resolves.toEqual(contribution);
    const stats = toAiUsageDailyPackStats(contribution!);
    expect(JSON.stringify(stats)).not.toContain(alice.userId);
    expect(JSON.stringify(stats)).not.toContain('sha256:');
    expect(received).toEqual([expect.objectContaining({ principal: alice, input: contribution })]);
    expect(integration.buildDailyPackContribution(alice, '2026-08-19')).toBeNull();
  });

  it('enforces owner-scoped correction, session deletion, and idempotent range deletion', () => {
    const { service } = setup();
    const session = service.createManualSession(alice, {
      appCode: 'CODEX',
      startedAt: '2026-08-18T00:00:00.000Z',
      endedAt: '2026-08-18T00:01:00.000Z',
      activeSeconds: 60,
      idleSeconds: 0,
      idempotencyKey: 'manual-0002',
    });
    expectCode(() => service.correctSession(bob, session.id, { activeSeconds: 30, reason: 'not mine' }), 'NOT_FOUND');
    const corrected = service.correctSession(alice, session.id, { activeSeconds: 30, reason: 'correct duration' });
    expect(corrected.status).toBe('CORRECTED');
    const deleted = service.deleteUsageRange(alice, {
      from: '2026-08-18T00:00:00.000Z',
      to: '2026-08-18T00:02:00.000Z',
      reason: 'remove accidental manual entry',
      idempotencyKey: 'range-delete-001',
    });
    expect(deleted.deletedCount).toBe(1);
    const replay = service.deleteUsageRange(alice, {
      from: '2026-08-18T00:00:00.000Z',
      to: '2026-08-18T00:02:00.000Z',
      reason: 'remove accidental manual entry',
      idempotencyKey: 'range-delete-001',
    });
    expect(replay.replayed).toBe(true);
    expect(service.listSessions(alice)).toHaveLength(0);
  });

  it('keeps Root AI Usage access separate, audited, and free of activity hashes', () => {
    const { service } = setup();
    service.createManualSession(alice, {
      appCode: 'CODEX',
      startedAt: '2026-08-18T00:00:00.000Z',
      endedAt: '2026-08-18T00:01:00.000Z',
      activeSeconds: 60,
      idleSeconds: 0,
      idempotencyKey: 'manual-0003',
    });
    const audits: unknown[] = [];
    const reader = new AdminAiUsageReader(
      service,
      {
        authorize: (principal, capability) => {
          if (principal.adminIdentityId !== 'root-identity' || capability !== 'ROOT_READ_AI_USAGE') {
            throw new AiUsageError('ROOT_DENIED', 'Root access denied.');
          }
          return {
            id: 'root-identity', userId: 'root-user', adminType: 'ORIGINAL_DEVELOPER_ROOT', status: 'ACTIVE',
            capabilities: ['ROOT_READ_AI_USAGE'], createdAt: '2026-08-18T00:00:00.000Z', lastAuthenticatedAt: null,
          };
        },
      },
      { append: (audit) => { audits.push(audit); return { ...audit, id: 'audit-1', timestamp: '2026-08-18T00:00:00.000Z' }; } },
    );
    expectCode(() => reader.readUserUsage(bob, alice.userId), 'ROOT_DENIED');
    const view = reader.readUserUsage(root, alice.userId, { reason: 'owner support request' });
    expect(view.sessions).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain('sha256:');
    expect(audits).toEqual([expect.objectContaining({ action: 'READ_AI_USAGE', targetUserId: alice.userId, adminId: 'root-identity' })]);
  });

  it('keeps adapter inputs strict and never provides a consumer Root route', () => {
    const { service } = setup();
    const api = new AiUsageApiAdapter(service);
    const preferenceResult = api.handle({
      method: 'PATCH',
      path: '/v1/ai-usage/preferences',
      principal: alice,
      body: { enabled: true, root: true },
    });
    expect(preferenceResult.status).toBe(400);
    const rootAttempt = api.handle({
      method: 'GET',
      path: `/v1/admin/users/${alice.userId}/ai-usage`,
      principal: { ...alice, adminIdentityId: 'root-identity' },
    });
    expect(rootAttempt.status).toBe(404);
  });

  it('routes pairing and collector batches without accepting a client owner or source', () => {
    const { service } = setup();
    const api = new AiUsageApiAdapter(service);
    expect(api.handle({
      method: 'PATCH', path: '/v1/ai-usage/preferences', principal: alice,
      body: { enabled: true, windowsAgentEnabled: true },
    }).status).toBe(200);
    const pairingResponse = api.handle({
      method: 'POST', path: '/v1/ai-usage/pairings', principal: alice,
      body: { deviceType: 'WINDOWS_AGENT' },
    });
    expect(pairingResponse.status).toBe(201);
    if (pairingResponse.body.data === undefined) throw new Error('Expected pairing response.');
    const pairing = pairingResponse.body.data as { readonly pairingId: string; readonly pairingCode: string };
    const completion = api.handle({
      method: 'POST', path: `/v1/ai-usage/device-pairings/${pairing.pairingId}/complete`,
      body: { pairingCode: pairing.pairingCode },
    });
    expect(completion.status).toBe(201);
    if (completion.body.data === undefined) throw new Error('Expected device credential response.');
    const credential = (completion.body.data as { readonly deviceCredential: string }).deviceCredential;
    const forged = api.handle({
      method: 'POST', path: '/v1/ai-usage/batches',
      headers: { 'x-mezip-device-credential': credential },
      body: { batchId: 'batch-0004', userId: bob.userId, source: 'MANUAL', events: [event()] },
    });
    expect(forged.status).toBe(400);
    const accepted = api.handle({
      method: 'POST', path: '/v1/ai-usage/batches',
      headers: { 'x-mezip-device-credential': credential },
      body: { batchId: 'batch-0004', events: [event()] },
    });
    expect(accepted.status).toBe(201);
    expect(service.listSessions(alice)).toHaveLength(1);
    expect(service.listSessions(bob)).toHaveLength(0);
  });
});
