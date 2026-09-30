import { describe, expect, it } from 'vitest';
import { createCreatorEcosystemClient, resolveCreatorEcosystemApiBase } from './creatorEcosystemClient.js';

describe('creator ecosystem client configuration', () => {
  it('fails closed for absent, credentialed, or production HTTP origins', async () => {
    expect(resolveCreatorEcosystemApiBase(undefined, false)).toBeNull();
    expect(resolveCreatorEcosystemApiBase('https://user:pass@example.com', false)).toBeNull();
    expect(resolveCreatorEcosystemApiBase('http://localhost:3000', true)).toBeNull();
    const client = createCreatorEcosystemClient(undefined, true);
    expect(client.source).toBe('UNAVAILABLE');
    await expect(client.getHome()).resolves.toMatchObject({ ok: false, code: 'SERVICE_UNAVAILABLE' });
  });

  it('normalizes only an explicit configured API origin', () => {
    expect(resolveCreatorEcosystemApiBase('https://api.example.com/v1/', true)).toBe('https://api.example.com/v1');
    expect(resolveCreatorEcosystemApiBase('https://api.example.com?token=no', true)).toBeNull();
  });
});
