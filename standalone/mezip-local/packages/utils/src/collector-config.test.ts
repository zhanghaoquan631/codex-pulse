import { describe, expect, it } from 'vitest';

import {
  isCollectorNetworkConfigured,
  resolveCollectorRuntimeConfig,
} from './collector-config.js';

describe('resolveCollectorRuntimeConfig', () => {
  it('requires an explicit recognized mode before any network origin is usable', () => {
    expect(
      resolveCollectorRuntimeConfig({
        apiOrigin: 'https://collector.example.com',
      }),
    ).toEqual({
      mode: 'PRODUCTION',
      state: 'FAIL_CLOSED',
      reason: 'INVALID_RUNTIME_MODE',
    });
    expect(
      resolveCollectorRuntimeConfig({
        mode: 'staging',
        apiOrigin: 'https://collector.example.com',
      }),
    ).toEqual({
      mode: 'PRODUCTION',
      state: 'FAIL_CLOSED',
      reason: 'INVALID_RUNTIME_MODE',
    });
  });

  it('allows an explicit mock-only development or test composition without a network endpoint', () => {
    expect(resolveCollectorRuntimeConfig({ mode: 'DEVELOPMENT' })).toEqual({
      mode: 'DEVELOPMENT',
      state: 'MOCK_ONLY',
    });
    expect(resolveCollectorRuntimeConfig({ mode: 'TEST' })).toEqual({
      mode: 'TEST',
      state: 'MOCK_ONLY',
    });
  });

  it('allows loopback development and an explicit HTTPS test collector', () => {
    const development = resolveCollectorRuntimeConfig({
      mode: 'DEVELOPMENT',
      apiOrigin: 'http://localhost:4310',
    });
    expect(development).toEqual({
      mode: 'DEVELOPMENT',
      state: 'NETWORK_CONFIGURED',
      apiOrigin: 'http://localhost:4310',
      hostPermission: 'http://localhost:4310/*',
    });
    expect(isCollectorNetworkConfigured(development)).toBe(true);
    expect(
      resolveCollectorRuntimeConfig({
        mode: 'TEST',
        apiOrigin: 'https://collector.example.com',
      }),
    ).toEqual({
      mode: 'TEST',
      state: 'NETWORK_CONFIGURED',
      apiOrigin: 'https://collector.example.com',
      hostPermission: 'https://collector.example.com/*',
    });
    expect(
      resolveCollectorRuntimeConfig({
        mode: 'TEST',
        apiOrigin: 'http://collector.example.com',
      }),
    ).toMatchObject({
      mode: 'TEST',
      state: 'FAIL_CLOSED',
      reason: 'ORIGIN_NOT_ALLOWED_FOR_RUNTIME_MODE',
    });
  });

  it('requires a public exact HTTPS root origin in production', () => {
    expect(resolveCollectorRuntimeConfig({ mode: 'PRODUCTION' })).toMatchObject({
      mode: 'PRODUCTION',
      state: 'FAIL_CLOSED',
      reason: 'MISSING_ORIGIN',
    });
    for (const apiOrigin of [
      'http://collector.example.com',
      'https://localhost:4310',
      'https://127.0.0.1:4310',
      'https://collector.example.com/api',
      'https://name:password@collector.example.com/',
      'https://collector.example.com/?token=no',
    ]) {
      expect(
        resolveCollectorRuntimeConfig({ mode: 'PRODUCTION', apiOrigin }),
      ).toMatchObject({ mode: 'PRODUCTION', state: 'FAIL_CLOSED' });
    }
    expect(
      resolveCollectorRuntimeConfig({
        mode: 'PRODUCTION',
        apiOrigin: 'https://collector.example.com:8443/',
      }),
    ).toEqual({
      mode: 'PRODUCTION',
      state: 'NETWORK_CONFIGURED',
      apiOrigin: 'https://collector.example.com:8443',
      hostPermission: 'https://collector.example.com:8443/*',
    });
  });

  it('does not trust a caller-forged network state', () => {
    expect(
      isCollectorNetworkConfigured({
        mode: 'PRODUCTION',
        state: 'NETWORK_CONFIGURED',
        apiOrigin: 'http://localhost:4310',
        hostPermission: 'http://localhost:4310/*',
      }),
    ).toBe(false);
  });
});
