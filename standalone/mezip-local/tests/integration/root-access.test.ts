import { describe, expect, it } from 'vitest';

import { InMemoryArchiveRepository } from '../../services/archive/src/index.js';
import {
  AdminAuthorizationError,
  AdminAuthorizationService,
  InMemoryAdminAccessAuditStore,
  InMemoryAdminIdentityStore,
} from '../../services/admin/src/index.js';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

const now = '2026-08-17T00:00:00.000Z';

function principal(userId: string, adminIdentityId?: string): AuthenticatedPrincipal {
  return {
    userId,
    sessionId: `session-${userId}`,
    roles: ['SUPER_ADMIN'],
    issuedAt: now,
    ...(adminIdentityId === undefined ? {} : { adminIdentityId }),
  };
}

describe('Phase 3 root access integration boundary', () => {
  it('keeps ordinary plans/roles owner-scoped while ODR reads one target with audit', () => {
    const identities = new InMemoryAdminIdentityStore({
      rootOwnerIdentity: 'root-user',
      runtime: { now: () => now, id: () => 'root-id' },
    });
    const root = identities.bootstrapRoot({ userId: 'root-user' });
    const audit = new InMemoryAdminAccessAuditStore({ now: () => now, id: (() => {
      let sequence = 0;
      return () => `audit-${++sequence}`;
    })() });
    const admin = new AdminAuthorizationService({ identities, audit, runtime: { now: () => now } });
    const archive = new InMemoryArchiveRepository({ runtime: { now: () => now, id: (() => {
      let sequence = 0;
      return () => `record-${++sequence}`;
    })() } });
    archive.createEntry(principal('user-a'), { kind: 'LIFE', title: 'A', body: 'private A', occurredAt: now });
    archive.createEntry(principal('user-b'), { kind: 'LIFE', title: 'B', body: 'private B', occurredAt: now });

    expect(() => admin.authorize({ ...principal('user-a'), membershipSimulation: { planCode: 'PRO_MAX', simulatedByAdminId: 'client', isSimulation: true } }, 'ROOT_READ_USER_DATA')).toThrowError(AdminAuthorizationError);
    expect(() => admin.authorize({ ...principal('root-user'), adminType: 'ORIGINAL_DEVELOPER_ROOT' } as AuthenticatedPrincipal, 'ROOT_READ_USER_DATA')).toThrowError(AdminAuthorizationError);

    const view = admin.readUserArchive(principal('root-user', root.id), 'user-a', archive);
    expect(view.entries.map((entry) => entry.body)).toEqual(['private A']);
    expect(audit.list().filter((event) => event.targetUserId === 'user-a').length).toBeGreaterThanOrEqual(2);
    expect(audit.list().every((event) => event.adminId === root.id)).toBe(true);
  });

  it('does not enable bulk export by default and never exposes an ordinary plan as visibility', () => {
    const identities = new InMemoryAdminIdentityStore({ rootOwnerIdentity: 'root-user', runtime: { now: () => now, id: () => 'root-id' } });
    const root = identities.bootstrapRoot({ userId: 'root-user' });
    const admin = new AdminAuthorizationService({ identities, audit: new InMemoryAdminAccessAuditStore(), runtime: { now: () => now } });
    const archive = new InMemoryArchiveRepository({ runtime: { now: () => now, id: () => 'record' } });
    expect(() => admin.bulkExportUserData(principal('root-user', root.id), ['user-a'], archive, { reauthenticatedAt: now })).toThrowError(AdminAuthorizationError);
  });
});
