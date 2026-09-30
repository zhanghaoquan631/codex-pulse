import { describe, expect, it } from 'vitest';

import { InMemoryArchiveRepository } from '@me-zip/archive';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import {
  AdminAuthorizationError,
  AdminBoundaryError,
  AdminAuthorizationService,
  InMemoryAdminAccessAuditStore,
  InMemoryAdminIdentityStore,
  assertChannelContentSource,
  assertExplicitSnapshotPublication,
} from './index.js';

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

function setup() {
  const identities = new InMemoryAdminIdentityStore({
    rootOwnerIdentity: 'root-user',
    runtime: { now: () => now, id: () => 'root-id' },
  });
  const root = identities.bootstrapRoot({ userId: 'root-user' });
  const audit = new InMemoryAdminAccessAuditStore({ now: () => now, id: (() => {
    let count = 0;
    return () => `audit-${++count}`;
  })() });
  const service = new AdminAuthorizationService({
    identities,
    audit,
    runtime: { now: () => now, id: () => 'service-id' },
    environment: 'DEVELOPMENT',
  });
  return { identities, root, audit, service };
}

describe('Original Developer Root access boundary', () => {
  it('creates exactly one server-bound root and rejects ordinary root impersonation', () => {
    const { identities, root, service } = setup();
    expect(root.adminType).toBe('ORIGINAL_DEVELOPER_ROOT');
    expect(() => identities.bootstrapRoot({ userId: 'root-user' })).toThrowError(AdminAuthorizationError);
    expect(() => service.authorize(principal('root-user', root.id), 'ROOT_READ_USER_DATA')).not.toThrow();
    expect(() => service.authorize({ ...principal('root-user'), adminType: 'ORIGINAL_DEVELOPER_ROOT' } as AuthenticatedPrincipal, 'ROOT_READ_USER_DATA')).toThrowError(
      AdminAuthorizationError,
    );
  });

  it.each(['FREE', 'GO', 'PLUS', 'PRO', 'PRO_MAX'] as const)(
    'does not let the %s membership plan read another user archive',
    (planCode) => {
      const { service } = setup();
      const ordinary = { ...principal('user-a'), membershipSimulation: { planCode, simulatedByAdminId: 'dev', isSimulation: true as const } };
      expect(() => service.authorize(ordinary, 'ROOT_READ_USER_DATA')).toThrowError(AdminAuthorizationError);
    },
  );

  it.each(['ADMIN', 'MODERATOR', 'SUPPORT', 'SUPER_ADMIN'] as const)(
    'does not treat the ordinary %s role as Root authority',
    (role) => {
      const { service } = setup();
      expect(() => service.authorize({ ...principal('user-a'), roles: [role] }, 'ROOT_READ_USER_DATA')).toThrowError(AdminAuthorizationError);
    },
  );

  it('filters root archive reads to the requested owner and preserves originals', () => {
    const { root, service, audit } = setup();
    const archive = new InMemoryArchiveRepository({ runtime: { now: () => now, id: (() => {
      let count = 0;
      return () => `record-${++count}`;
    })() } });
    const userA = principal('user-a');
    const userB = principal('user-b');
    archive.createEntry(userA, { kind: 'LIFE', title: 'A private note', body: 'A only', occurredAt: now });
    archive.createEntry(userB, { kind: 'LIFE', title: 'B private note', body: 'B only', occurredAt: now });

    const view = service.readUserArchive(principal('root-user', root.id), 'user-a', archive);
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0]?.ownerId).toBe('user-a');
    expect(view.entries[0]?.body).toBe('A only');
    expect(view.entries.some((entry) => entry.body === 'B only')).toBe(false);
    expect(archive.getEntry(userA, view.entries[0]!.id).body).toBe('A only');
    expect(audit.list().some((event) => event.action === 'READ_LIFE' && event.targetUserId === 'user-a')).toBe(true);
    expect(audit.list().every((event) => event.adminId === root.id && event.sessionId === 'session-root-user')).toBe(true);
    expect('delete' in audit).toBe(false);
  });

  it('splits sensitive/message/export capabilities and never fabricates deferred messages', () => {
    const identities = new InMemoryAdminIdentityStore({ rootOwnerIdentity: 'root-user', runtime: { now: () => now, id: () => 'root-id' } });
    const root = identities.bootstrapRoot({ userId: 'root-user', capabilities: ['ROOT_READ_USER_DATA', 'ROOT_READ_PRIVATE_MESSAGES'] });
    const audit = new InMemoryAdminAccessAuditStore({ now: () => now, id: () => 'audit' });
    const service = new AdminAuthorizationService({ identities, audit, runtime: { now: () => now }, environment: 'DEVELOPMENT' });
    const archive = new InMemoryArchiveRepository({ runtime: { now: () => now, id: () => 'record' } });

    expect(() => service.readSensitiveUserData(principal('root-user', root.id), 'user-a', archive)).toThrowError(AdminAuthorizationError);
    expect(() => service.readPrivateMessages(principal('root-user', root.id), 'user-a', undefined)).toThrowError(AdminBoundaryError);
    expect(() => service.readUserDevices(principal('root-user', root.id), 'user-a', undefined)).toThrowError(AdminBoundaryError);
    expect(() => service.exportUserData(principal('root-user', root.id), 'user-a', archive, { reauthenticatedAt: now })).toThrowError(AdminAuthorizationError);
  });

  it('requires reason and recent re-authentication for root mutation boundaries', () => {
    const { root, service } = setup();
    const rootPrincipal = principal('root-user', root.id);
    expect(() => service.applyAdminRevision(rootPrincipal, 'user-a', 'PROFILE', '', () => true, { reauthenticatedAt: now })).toThrowError(AdminAuthorizationError);
    expect(() => service.applyAdminRevision(rootPrincipal, 'user-a', 'PROFILE', 'support request', () => true)).toThrowError(AdminAuthorizationError);
    expect(service.applyAdminRevision(rootPrincipal, 'user-a', 'PROFILE', 'support request', () => 'ok', { reauthenticatedAt: now })).toBe('ok');
  });

  it('keeps membership simulation development-only and non-mutating', () => {
    const { root, service } = setup();
    const result = service.simulateMembership(principal('root-user', root.id), 'PRO_MAX', 'user-a');
    expect(result).toEqual({ planCode: 'PRO_MAX', simulatedByAdminId: root.id, isSimulation: true });
    expect(principal('user-a').membershipSimulation).toBeUndefined();
  });
});

describe('publication and channel boundaries', () => {
  it('requires explicit publish and rejects plan codes as ordinary visibility', () => {
    expect(() => assertExplicitSnapshotPublication({
      sourceId: 'entry-1',
      sourceVisibility: 'PRIVATE',
      targetVisibility: 'PUBLIC',
      explicitPublish: false,
    })).toThrowError(AdminAuthorizationError);
    expect(() => assertExplicitSnapshotPublication({
      sourceId: 'entry-1',
      sourceVisibility: 'PRIVATE',
      targetVisibility: 'PRO_MAX' as never,
      explicitPublish: true,
    })).toThrowError(AdminAuthorizationError);
    expect(assertExplicitSnapshotPublication({
      sourceId: 'entry-1',
      sourceVisibility: 'PRIVATE',
      targetVisibility: 'COMMUNITY',
      explicitPublish: true,
      founderAudience: 'FOUNDER_PRO_MAX',
    })).toMatchObject({ publicationState: 'SNAPSHOT', targetVisibility: 'COMMUNITY' });
  });

  it('only accepts explicit snapshots or declared post/reply/upload sources', () => {
    const channel = {
      id: 'channel-1',
      ownerId: 'root-user',
      type: 'OFFICIAL' as const,
      name: 'Official',
      description: null,
      visibility: 'PUBLIC' as const,
      founderAudience: null,
      archivedAt: null,
      createdAt: now,
    };
    expect(() => assertChannelContentSource({ channel, source: 'PUBLISHED_SNAPSHOT' })).toThrowError(AdminAuthorizationError);
    expect(assertChannelContentSource({
      channel,
      source: 'PUBLISHED_SNAPSHOT',
      snapshot: { sourceId: 'entry-1', sourceVisibility: 'PRIVATE', targetVisibility: 'PUBLIC', publicationState: 'SNAPSHOT', founderAudience: null },
    })).toBe(true);
  });
});
