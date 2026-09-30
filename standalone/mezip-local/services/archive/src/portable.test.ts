import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal, JsonValue } from '@me-zip/shared-types';

import {
  InMemoryPortableArchiveTarget,
  PortableArchiveError,
  PortableArchiveService,
  type PortableArchiveDataSource,
} from './portable.js';

const owner: AuthenticatedPrincipal = {
  userId: 'owner-a',
  sessionId: 'session-a',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};
const other: AuthenticatedPrincipal = {
  userId: 'owner-b',
  sessionId: 'session-b',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};

function source(): PortableArchiveDataSource {
  return {
    collect: () => ({
      timezone: 'Asia/Taipei',
      locale: 'zh-TW',
      sections: {
        LIFE: [
          {
            id: 'entry-1',
            ownerId: 'owner-a',
            title: '第一条记录',
            body: '原始内容',
            accessToken: 'must-not-export',
          } as unknown as JsonValue,
        ],
        TIMELINE: [
          {
            id: 'event-1',
            sourceId: 'entry-1',
            occurredAt: '2026-01-02T00:00:00.000Z',
          } as unknown as JsonValue,
        ],
        FITNESS: [
          {
            id: 'fitness-1',
            trainingType: 'WALK',
            steps: 1000,
          } as unknown as JsonValue,
        ],
        PRIVACY: [{ id: 'privacy-1', trackingEnabled: false } as unknown as JsonValue],
      },
    }),
  };
}

function service(): PortableArchiveService {
  return new PortableArchiveService({
    dataSource: source(),
    restoreTarget: new InMemoryPortableArchiveTarget(),
    now: () => '2026-08-17T12:00:00.000Z',
    id: (() => {
      let count = 0;
      return () => `id-${++count}`;
    })(),
  });
}

describe('PortableArchiveService', () => {
  it('builds a manifest/checksum verified .mezip container and excludes secrets', () => {
    const archive = service();
    const job = archive.createExport(owner, {
      type: 'FULL_ARCHIVE',
      sections: ['LIFE', 'TIMELINE'],
      includeMedia: false,
    });
    expect(job.status).toBe('READY');
    const download = archive.downloadExport(owner, job.id);
    const bytes = archive.readDownload(owner, job.id, download.token);
    const text = Buffer.from(bytes).toString('utf8');
    expect(text).toContain('MEZIP_DIRECTORY_JSON_V1');
    expect(text).toContain('mezip.archive.v1');
    expect(text).not.toContain('must-not-export');
    expect(archive.verifyArchive(owner, bytes).integrity).toBe('VERIFIED');
  });

  it('supports password protection and rejects wrong passwords without logging/returning the password', () => {
    const archive = service();
    const job = archive.createExport(owner, {
      type: 'YEAR_ARCHIVE',
      year: 2026,
      encryptionMode: 'PASSWORD_AES_256_GCM',
      password: 'correct horse battery',
    });
    const download = archive.downloadExport(owner, job.id);
    const bytes = archive.readDownload(owner, job.id, download.token);
    expect(() => archive.verifyArchive(owner, bytes)).toThrowError(
      PortableArchiveError,
    );
    expect(() => archive.verifyArchive(owner, bytes, 'wrong password')).toThrowError(
      PortableArchiveError,
    );
    expect(archive.verifyArchive(owner, bytes, 'correct horse battery').integrity).toBe(
      'VERIFIED',
    );
    expect(Buffer.from(bytes).toString('utf8')).not.toContain('correct horse battery');
  });

  it('round-trips through preview/restore, detects duplicates, and enforces download ownership', () => {
    const archive = service();
    const job = archive.createExport(owner, {
      type: 'SELECTED_MODULES',
      sections: ['LIFE', 'FITNESS'],
    });
    const download = archive.downloadExport(owner, job.id);
    const bytes = archive.readDownload(owner, job.id, download.token);
    expect(() => archive.downloadExport(other, job.id)).toThrowError(
      PortableArchiveError,
    );
    const preview = archive.previewImport(owner, bytes, { conflictResolution: 'SKIP' });
    expect(preview.integrity).toBe('VERIFIED');
    const restored = archive.startImport(owner, preview.importId, bytes, {
      conflictResolution: 'SKIP',
    });
    expect(restored.status).toBe('READY');
    expect(restored.restoredCounts.LIFE).toBe(1);
    const duplicate = archive.previewImport(owner, bytes, {
      conflictResolution: 'SKIP',
    });
    expect(duplicate.conflicts.length).toBeGreaterThan(0);
  });

  it('rejects tampered payloads, unsafe paths, and unsupported schemas', () => {
    const archive = service();
    const job = archive.createExport(owner, {
      type: 'FULL_ARCHIVE',
      sections: ['LIFE'],
    });
    const download = archive.downloadExport(owner, job.id);
    const original = JSON.parse(
      Buffer.from(archive.readDownload(owner, job.id, download.token)).toString('utf8'),
    ) as {
      files: Array<{ path: string; bytesBase64: string }>;
      manifest: { schemaVersion: string };
    };
    const firstFile = original.files[0];
    if (firstFile === undefined) throw new Error('Expected an archive file.');
    firstFile.bytesBase64 = Buffer.from('tampered').toString('base64');
    expect(() =>
      archive.verifyArchive(
        owner,
        new Uint8Array(Buffer.from(JSON.stringify(original), 'utf8')),
      ),
    ).toThrowError(PortableArchiveError);
    firstFile.path = '../escape.json';
    expect(() =>
      archive.verifyArchive(
        owner,
        new Uint8Array(Buffer.from(JSON.stringify(original), 'utf8')),
      ),
    ).toThrowError(PortableArchiveError);
    firstFile.path = 'manifest.json';
    original.manifest.schemaVersion = 'mezip.archive.v99';
    expect(() =>
      archive.verifyArchive(
        owner,
        new Uint8Array(Buffer.from(JSON.stringify(original), 'utf8')),
      ),
    ).toThrowError(PortableArchiveError);
  });
});
