import { describe, expect, it, vi } from 'vitest';

import {
  createProductionRuntime,
  recordRequestMetrics,
  redactOperationalMetadata,
  writeOperationalEvent,
} from './production-runtime.js';

const config = {
  environment: 'PRODUCTION',
  publicAppOrigin: 'https://app.mezip.example',
  apiOrigin: 'https://api.mezip.example',
  allowedOrigins: ['https://app.mezip.example'],
  callbackUrls: ['https://api.mezip.example/v1/oauth/github/callback'],
  databaseUrlReference: 'secret://production/database-url',
  queueUrlReference: 'secret://production/queue-url',
  storageEndpoint: 'https://storage.mezip.example',
  storageBucket: 'mezip-private-production',
  secretReferences: {
    AUTH_SECRET: 'kms://mezip/auth-v1',
    SESSION_SECRET: 'kms://mezip/session-v1',
    ENCRYPTION_KEY: 'kms://mezip/encryption-v1',
  },
} as const;

describe('production runtime foundation', () => {
  it('fails closed before startup on unsafe configuration and has only safe health output', async () => {
    expect(() =>
      createProductionRuntime({ ...config, apiOrigin: 'http://localhost:3000' }, []),
    ).toThrow('Production configuration');
    const runtime = createProductionRuntime(config, [
      { name: 'DATABASE', required: true, isReady: async () => true },
      { name: 'QUEUE', required: true, isReady: async () => false },
      { name: 'STORAGE', required: false, isReady: async () => false },
    ]);
    expect(runtime.liveness()).toEqual({ status: 'LIVE' });
    expect(await runtime.readiness()).toEqual({
      status: 'NOT_READY',
      unavailable: ['QUEUE'],
    });
    expect(JSON.stringify(await runtime.readiness())).not.toContain('secret://');
  });

  it('emits exact-origin CORS and defensive response headers', () => {
    const runtime = createProductionRuntime(config, []);
    expect(runtime.http.corsHeaders('https://app.mezip.example')).toMatchObject({
      'Access-Control-Allow-Origin': 'https://app.mezip.example',
      'Access-Control-Allow-Credentials': 'true',
    });
    expect(runtime.http.corsHeaders('https://evil.example')).toEqual({});
    expect(runtime.http.headers['Content-Security-Policy']).toContain(
      "frame-ancestors 'none'",
    );
    expect(runtime.http.headers['Strict-Transport-Security']).toContain('max-age=');
  });

  it('redacts request body, tokens and signed URLs from logs and metrics', () => {
    const logger = { write: vi.fn() };
    writeOperationalEvent(logger, {
      requestId: 'request_123',
      service: 'api',
      route: '/v1/messages',
      method: 'POST',
      status: 201,
      durationMs: 12.7,
      metadata: {
        body: 'private message',
        authorization: 'Bearer secret',
        signedUrl: 'https://storage/?signature=secret',
        count: 3,
      },
    });
    expect(logger.write).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          body: '[REDACTED]',
          authorization: '[REDACTED]',
          signedUrl: '[REDACTED]',
          count: 3,
        },
      }),
    );
    expect(redactOperationalMetadata({ prompt: 'private prompt' })).toEqual({
      prompt: '[REDACTED]',
    });

    const sink = { increment: vi.fn(), observe: vi.fn() };
    recordRequestMetrics(sink, {
      service: 'api',
      route: '/v1/messages',
      method: 'POST',
      status: 201,
      durationMs: 12,
    });
    expect(sink.increment).toHaveBeenCalledWith(
      'mezip_request_total',
      1,
      expect.objectContaining({ statusClass: '2xx' }),
    );
  });
});
