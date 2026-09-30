import type {
  AiUsageAppRegistryEntry,
  AiUsageDevice,
  AiUsageOverview,
  AiUsageProviderRegistryEntry,
  AiUsageSession,
  AiUsageTrackingPreferences,
  ApiResponse,
} from '@me-zip/shared-types';
import { describe, expect, it } from 'vitest';

import {
  ApiAiUsageDashboardClient,
  UnavailableAiUsageDashboardClient,
  type AiUsageSdkFacade,
} from './aiUsageClient.js';

const preferences: AiUsageTrackingPreferences = {
  enabled: false,
  windowsAgentEnabled: false,
  browserExtensionEnabled: false,
  idleThresholdSeconds: 180,
  timezone: 'Asia/Taipei',
  updatedAt: '2026-08-18T00:00:00.000Z',
};
const overview: AiUsageOverview = {
  preferences,
  daily: [],
  totalActiveSeconds: 0,
  totalIdleSeconds: 0,
  deviceCount: 0,
  generatedAt: '2026-08-18T00:00:00.000Z',
};
const apps: readonly AiUsageAppRegistryEntry[] = [];
const providers: readonly AiUsageProviderRegistryEntry[] = [];
const devices: readonly AiUsageDevice[] = [];
const sessions: readonly AiUsageSession[] = [];

function success<T>(data: T): Promise<ApiResponse<T>> {
  return Promise.resolve({ data, meta: { requestId: 'ai-usage-web-test' } });
}

function sdkWithFailure(path: string | null = null): AiUsageSdkFacade {
  const failed = <T>(name: string, value: T): Promise<ApiResponse<T>> =>
    name === path
      ? Promise.resolve({ error: { code: 'FORBIDDEN', message: 'server detail is hidden', retryable: false, requestId: 'test' } })
      : success(value);
  return {
    getOverview: () => failed('overview', overview),
    listApps: () => failed('apps', apps),
    listProviders: () => failed('providers', providers),
    getPreferences: () => failed('preferences', preferences),
    updatePreferences: () => success(preferences),
    listDevices: () => failed('devices', devices),
    createPairing: () => success({ pairingId: 'pairing', pairingCode: 'PAIRCODE1', deviceType: 'WINDOWS_AGENT', expiresAt: '2026-08-18T00:10:00.000Z' }),
    revokeDevice: () => success(devices[0] as AiUsageDevice),
    listSessions: () => failed('sessions', sessions),
    correctSession: () => success(sessions[0] as AiUsageSession),
    deleteSession: () => success(sessions[0] as AiUsageSession),
    deleteUsageRange: () => success({
      from: '2026-08-18T00:00:00.000Z',
      to: '2026-08-19T00:00:00.000Z',
      deletedCount: 0,
      replayed: false,
    }),
    exportUsage: () => success({ generatedAt: overview.generatedAt, preferences, devices, sessions, daily: [] }),
    createManualSession: () => success(sessions[0] as AiUsageSession),
  };
}

describe('AI Usage browser client', () => {
  it('loads only server projections and never adds an owner or source field', async () => {
    const client = new ApiAiUsageDashboardClient(sdkWithFailure());
    const result = await client.readSnapshot();
    expect(result).toMatchObject({ ok: true, source: 'SERVER' });
    if (!result.ok) return;
    expect(result.data.overview).toBe(overview);
    expect(JSON.stringify(result.data)).not.toContain('prompt');
    expect(JSON.stringify(result.data)).not.toContain('activityHash');
  });

  it('fails closed when any required server projection is denied', async () => {
    const result = await new ApiAiUsageDashboardClient(sdkWithFailure('devices')).readSnapshot();
    expect(result).toMatchObject({ ok: false, source: 'SERVER' });
    if (!result.ok) expect(result.error.message).not.toContain('server detail');
  });

  it('has no synthetic success state when no server client is configured', async () => {
    const result = await new UnavailableAiUsageDashboardClient().readSnapshot();
    expect(result).toMatchObject({ ok: false, source: 'UNAVAILABLE' });
  });
});
