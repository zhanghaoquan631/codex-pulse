import { describe, expect, it } from 'vitest';

import {
  ProductionConfigError,
  validateProductionConfig,
} from './production-config.js';

const valid = {
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
  providerModes: ['WECHAT_PAY', 'ALIPAY', 'APPLE_IAP'],
} as const;

describe('validateProductionConfig', () => {
  it('returns only validated references and public endpoint metadata', () => {
    const config = validateProductionConfig(valid);
    expect(config).toMatchObject({
      environment: 'PRODUCTION',
      publicAppOrigin: 'https://app.mezip.example',
      storageBucket: 'mezip-private-production',
      databaseUrlReference: 'secret://production/database-url',
    });
    expect(JSON.stringify(config)).not.toContain('password');
  });

  it('rejects localhost, private targets, raw secret text and a mock provider in production', () => {
    for (const changes of [
      { publicAppOrigin: 'http://localhost:5173' },
      { apiOrigin: 'https://127.0.0.1' },
      { storageEndpoint: 'https://192.168.0.1' },
      { databaseUrlReference: 'postgresql://user:password@db.example/mezip' },
      {
        secretReferences: {
          ...valid.secretReferences,
          SESSION_SECRET: 'not-a-secret-reference',
        },
      },
      { providerModes: ['FAKE_PAYMENT'] },
    ]) {
      expect(() => validateProductionConfig({ ...valid, ...changes })).toThrow(
        ProductionConfigError,
      );
    }
  });

  it('requires each app origin in the CORS allow-list and all required references', () => {
    expect(() => validateProductionConfig({ ...valid, allowedOrigins: [] })).toThrow(
      ProductionConfigError,
    );
    expect(() =>
      validateProductionConfig({
        ...valid,
        secretReferences: { AUTH_SECRET: 'kms://mezip/auth-v1' },
      }),
    ).toThrow(ProductionConfigError);
  });
});
