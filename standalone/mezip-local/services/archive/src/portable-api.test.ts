import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal, JsonValue } from '@me-zip/shared-types';

import { PortableArchiveApiAdapter } from './portable-api.js';
import {
  InMemoryPortableArchiveTarget,
  PortableArchiveService,
  type PortableArchiveDataSource,
} from './portable.js';

const owner: AuthenticatedPrincipal = {
  userId: 'api-owner',
  sessionId: 'api-session',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};
const other: AuthenticatedPrincipal = {
  userId: 'api-other',
  sessionId: 'other-session',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};

function adapter(): PortableArchiveApiAdapter {
  const source: PortableArchiveDataSource = {
    collect: () => ({
      sections: { LIFE: [{ id: 'life-1', title: 'private' } as unknown as JsonValue] },
    }),
  };
  return new PortableArchiveApiAdapter(
    new PortableArchiveService({
      dataSource: source,
      restoreTarget: new InMemoryPortableArchiveTarget(),
      now: () => '2026-08-17T12:00:00.000Z',
      id: (() => {
        let index = 0;
        return () => `api-${++index}`;
      })(),
    }),
  );
}

describe('PortableArchiveApiAdapter', () => {
  it('derives ownership from the trusted principal and supports export/download/verify', () => {
    const api = adapter();
    const created = api.handle({
      method: 'POST',
      path: '/v1/archive/exports',
      principal: owner,
      body: { type: 'FULL_ARCHIVE' },
    });
    expect(created.status).toBe(201);
    const jobId = (created.body.data as { id: string }).id;
    const metadata = api.handle({
      method: 'GET',
      path: `/v1/archive/exports/${jobId}/download`,
      principal: owner,
    });
    expect(metadata.status).toBe(200);
    const token = (metadata.body.data as { token: string }).token;
    const payload = api.handle({
      method: 'GET',
      path: `/v1/archive/exports/${jobId}/bytes`,
      principal: owner,
      body: { token },
    });
    expect(payload.status).toBe(200);
    const verified = api.handle({
      method: 'POST',
      path: '/v1/archive/verify',
      principal: owner,
      body: {
        archiveBase64: (payload.body.data as { archiveBase64: string }).archiveBase64,
      },
    });
    expect(verified.status).toBe(201);
    expect((verified.body.data as { integrity: string }).integrity).toBe('VERIFIED');
  });

  it('does not allow another principal to read a job or inject owner fields', () => {
    const api = adapter();
    const created = api.handle({
      method: 'POST',
      path: '/v1/archive/exports',
      principal: owner,
      body: { type: 'FULL_ARCHIVE', ownerId: other.userId },
    });
    const jobId = (created.body.data as { id: string }).id;
    const denied = api.handle({
      method: 'GET',
      path: `/v1/archive/exports/${jobId}`,
      principal: other,
    });
    expect([403, 404]).toContain(denied.status);
  });

  it('keeps legacy release manual-only in the API projection', () => {
    const api = adapter();
    const policy = api.handle({
      method: 'GET',
      path: '/v1/archive/legacy/policy',
      principal: owner,
    });
    expect(policy.status).toBe(200);
    expect(
      (policy.body.data as { autoReleaseEnabled: boolean }).autoReleaseEnabled,
    ).toBe(false);
  });
});
