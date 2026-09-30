import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal, JsonValue } from '@me-zip/shared-types';
import {
  InMemoryPortableArchiveTarget,
  PortableArchiveService,
  type PortableArchiveDataSource,
} from '../../services/archive/src/portable.js';

const owner: AuthenticatedPrincipal = {
  userId: 'phase14-owner',
  sessionId: 'phase14-session',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};
const other: AuthenticatedPrincipal = {
  userId: 'phase14-other',
  sessionId: 'phase14-other-session',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};

describe('Phase 14 portable archive contract', () => {
  it('round-trips an owner archive with checksums and no secret-bearing fields', () => {
    const source: PortableArchiveDataSource = {
      collect: () => ({
        sections: {
          LIFE: [
            {
              id: 'entry-1',
              title: 'entry',
              body: 'private text',
              oauthToken: 'do-not-export',
            } as unknown as JsonValue,
          ],
          AI_USAGE: [
            {
              appCode: 'CHATGPT',
              activeSeconds: 30,
              prompt: 'do-not-export',
            } as unknown as JsonValue,
          ],
        },
      }),
    };
    const service = new PortableArchiveService({
      dataSource: source,
      restoreTarget: new InMemoryPortableArchiveTarget(),
      now: () => '2026-08-17T12:00:00.000Z',
      id: (() => {
        let n = 0;
        return () => `phase14-${++n}`;
      })(),
    });
    const job = service.createExport(owner, {
      type: 'FULL_ARCHIVE',
      includeMedia: false,
    });
    const download = service.downloadExport(owner, job.id);
    const bytes = service.readDownload(owner, job.id, download.token);
    const verified = service.verifyArchive(owner, bytes);
    expect(verified.integrity).toBe('VERIFIED');
    const raw = Buffer.from(bytes).toString('utf8');
    expect(raw).not.toContain('do-not-export');
    const preview = service.previewImport(owner, bytes, {
      conflictResolution: 'CREATE_COPY',
    });
    expect(preview.compatible).toBe(true);
    expect(
      service.startImport(owner, preview.importId, bytes, {
        conflictResolution: 'CREATE_COPY',
      }).status,
    ).toBe('READY');
    expect(() => service.downloadExport(other, job.id)).toThrow();
  });

  it('requires the password and rejects tampering before restore', () => {
    const source: PortableArchiveDataSource = {
      collect: () => ({
        sections: { LIFE: [{ id: 'entry-2' } as unknown as JsonValue] },
      }),
    };
    const service = new PortableArchiveService({
      dataSource: source,
      restoreTarget: new InMemoryPortableArchiveTarget(),
    });
    const job = service.createExport(owner, {
      type: 'YEAR_ARCHIVE',
      year: 2026,
      encryptionMode: 'PASSWORD_AES_256_GCM',
      password: 'a sufficiently long password',
    });
    const download = service.downloadExport(owner, job.id);
    const bytes = service.readDownload(owner, job.id, download.token);
    expect(() => service.verifyArchive(owner, bytes)).toThrow();
    expect(
      service.verifyArchive(owner, bytes, 'a sufficiently long password').integrity,
    ).toBe('VERIFIED');
    const tampered = Uint8Array.from(bytes);
    tampered[tampered.length - 1] ^= 1;
    expect(() =>
      service.verifyArchive(owner, tampered, 'a sufficiently long password'),
    ).toThrow();
  });
});
