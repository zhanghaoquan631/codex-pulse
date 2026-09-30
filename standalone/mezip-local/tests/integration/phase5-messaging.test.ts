import { describe, expect, it } from 'vitest';

import {
  AdminAuthorizationService,
  InMemoryAdminAccessAuditStore,
  InMemoryAdminIdentityStore,
} from '../../services/admin/src/index.js';
import {
  AdminMessagingApiAdapter,
  AdminMessagingRouteAdapter,
  InMemoryMessagingEntitlements,
  InMemoryMessagingFounderDirectory,
  InMemoryMessagingGroupProvider,
  InMemoryMessagingMediaAuthorizer,
  InMemoryMessagingRealtimeHub,
  MessagingApiAdapter,
  MessagingService,
} from '../../services/messaging/src/index.js';
import type {
  AuthenticatedPrincipal,
  MessagingMediaReference,
  MessagingRealtimeEvent,
} from '@me-zip/shared-types';

const issuedAt = '2026-08-17T00:00:00.000Z';

function principal(userId: string, adminIdentityId?: string): AuthenticatedPrincipal {
  return {
    userId,
    sessionId: `session-${userId}`,
    roles: ['USER'],
    issuedAt,
    ...(adminIdentityId === undefined ? {} : { adminIdentityId }),
  };
}

function serviceIdFactory(): () => string {
  let sequence = 0;
  return () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
}

describe('Phase 5 Messaging integration boundary', () => {
  it('keeps a DM canonical, isolates unrelated users, and preserves offline retry identity', () => {
    const service = new MessagingService({
      runtime: { now: () => issuedAt, id: serviceIdFactory() },
    });
    const alice = principal('00000000-0000-4000-8000-000000000101');
    const bob = principal('00000000-0000-4000-8000-000000000102');
    const proMaxOutsider = principal('00000000-0000-4000-8000-000000000103');

    const openedByAlice = service.openDirect(alice, bob.userId, 'open-direct');
    expect(service.openDirect(bob, alice.userId, 'open-retry').id).toBe(openedByAlice.id);

    const sent = service.send(alice, openedByAlice.id, {
      clientMessageId: '00000000-0000-4000-8000-000000000201',
      body: 'offline-safe message',
    });
    const retried = service.send(alice, openedByAlice.id, {
      clientMessageId: '00000000-0000-4000-8000-000000000201',
      body: 'offline-safe message',
    });
    expect(retried.id).toBe(sent.id);
    expect(() => service.listMessages(proMaxOutsider, openedByAlice.id)).toThrow();
    expect(service.search(proMaxOutsider, 'offline-safe').items).toEqual([]);
  });

  it('rechecks active group membership, block state, and authorized media on every operation', () => {
    const groups = new InMemoryMessagingGroupProvider();
    const media = new InMemoryMessagingMediaAuthorizer();
    const alice = principal('00000000-0000-4000-8000-000000000301');
    const bob = principal('00000000-0000-4000-8000-000000000302');
    const outsider = principal('00000000-0000-4000-8000-000000000303');
    groups.set('00000000-0000-4000-8000-000000000401', 'Study group', [
      { userId: alice.userId, role: 'OWNER' },
      { userId: bob.userId, role: 'MEMBER' },
    ]);
    const image: MessagingMediaReference = {
      mediaId: '00000000-0000-4000-8000-000000000501',
      kind: 'IMAGE',
      fileName: 'entry.jpg',
      contentType: 'image/jpeg',
      bytes: 12,
    };
    media.allow(image, [alice.userId]);
    const service = new MessagingService({
      groupProvider: groups,
      mediaAuthorizer: media,
      runtime: { now: () => issuedAt, id: serviceIdFactory() },
    });

    const group = service.openGroup(alice, '00000000-0000-4000-8000-000000000401');
    service.send(alice, group.id, {
      clientMessageId: '00000000-0000-4000-8000-000000000502',
      mediaIds: [image.mediaId],
    });
    expect(service.listMessages(bob, group.id).items).toHaveLength(1);
    expect(() => service.listMessages(outsider, group.id)).toThrow();
    expect(() => service.send(bob, group.id, {
      clientMessageId: '00000000-0000-4000-8000-000000000503',
      mediaIds: [image.mediaId],
    })).toThrow();

    groups.set('00000000-0000-4000-8000-000000000401', 'Study group', [
      { userId: alice.userId, role: 'OWNER' },
    ]);
    expect(() => service.listMessages(bob, group.id)).toThrow();

    const direct = service.openDirect(alice, bob.userId);
    service.setBlock(alice, bob.userId, true);
    expect(() => service.send(bob, direct.id, {
      clientMessageId: '00000000-0000-4000-8000-000000000504',
      body: 'must not send',
    })).toThrow();
  });

  it('uses server-side Founder capabilities and keeps Founder priority separate from client plan data', () => {
    const entitlements = new InMemoryMessagingEntitlements();
    const founders = new InMemoryMessagingFounderDirectory();
    const founder = principal('00000000-0000-4000-8000-000000000601');
    const priority = principal('00000000-0000-4000-8000-000000000602');
    const standard = principal('00000000-0000-4000-8000-000000000603');
    const denied = principal('00000000-0000-4000-8000-000000000604');
    founders.setFounderUserId(founder.userId);
    entitlements.set(priority.userId, ['FOUNDER_INBOX_ACCESS', 'FOUNDER_PRIORITY_INBOX']);
    entitlements.set(standard.userId, ['FOUNDER_INBOX_ACCESS']);
    const service = new MessagingService({
      entitlementResolver: entitlements,
      founderDirectory: founders,
      runtime: { now: () => issuedAt, id: serviceIdFactory() },
    });

    service.openFounderInbox(standard);
    service.openFounderInbox(priority);
    expect(() => service.openFounderInbox(denied)).toThrow();
    const inbox = service.listFounderInbox(founder).items;
    expect(inbox[0]?.display.peerUserId).toBe(priority.userId);
    expect(JSON.stringify(inbox)).not.toContain('planCode');
  });

  it('uses realtime events only for conversation participants and uses audited Admin access for Root reads', async () => {
    const hub = new InMemoryMessagingRealtimeHub();
    const service = new MessagingService({
      realtimePublisher: hub,
      runtime: { now: () => issuedAt, id: serviceIdFactory() },
    });
    const alice = principal('00000000-0000-4000-8000-000000000701');
    const bob = principal('00000000-0000-4000-8000-000000000702');
    const outsider = principal('00000000-0000-4000-8000-000000000703');
    const conversation = service.openDirect(alice, bob.userId);
    const received: MessagingRealtimeEvent[] = [];
    await hub.transportFor(bob).subscribe({ onEvent: (event) => received.push(event) });
    await hub.transportFor(outsider).subscribe({ onEvent: (event) => received.push(event) });
    service.send(alice, conversation.id, {
      clientMessageId: '00000000-0000-4000-8000-000000000704',
      body: 'private delivery',
    });
    expect(received.filter((event) => event.type === 'message.created')).toHaveLength(1);

    const consumer = new MessagingApiAdapter(service);
    expect(consumer.handle({
      method: 'GET',
      path: `/v1/admin/users/${alice.userId}/messages/private`,
      principal: alice,
    }).status).toBe(404);

    const identities = new InMemoryAdminIdentityStore({
      rootOwnerIdentity: '00000000-0000-4000-8000-000000000799',
      runtime: { now: () => issuedAt, id: () => '00000000-0000-4000-8000-000000000798' },
    });
    const root = identities.bootstrapRoot({
      userId: '00000000-0000-4000-8000-000000000799',
      capabilities: ['ROOT_READ_PRIVATE_MESSAGES'],
    });
    const audit = new InMemoryAdminAccessAuditStore({
      now: () => issuedAt,
      id: () => '00000000-0000-4000-8000-000000000797',
    });
    const authorization = new AdminAuthorizationService({ identities, audit, runtime: { now: () => issuedAt } });
    const adminRoute = new AdminMessagingRouteAdapter(new AdminMessagingApiAdapter(authorization, service));
    const forbidden = adminRoute.handle({
      method: 'GET',
      path: `/v1/admin/users/${alice.userId}/messages/private`,
      principal: alice,
    });
    expect(forbidden.status).toBe(403);
    const allowed = adminRoute.handle({
      method: 'GET',
      path: `/v1/admin/users/${alice.userId}/messages/private`,
      principal: principal('00000000-0000-4000-8000-000000000799', root.id),
    });
    expect(allowed.status).toBe(200);
    expect(audit.list()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'READ_MESSAGE', targetUserId: alice.userId }),
    ]));
  });
});
