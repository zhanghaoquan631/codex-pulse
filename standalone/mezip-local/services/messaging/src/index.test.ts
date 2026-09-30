import { describe, expect, it } from 'vitest';

import {
  AdminAuthorizationService,
  InMemoryAdminAccessAuditStore,
  InMemoryAdminIdentityStore,
} from '@me-zip/admin-service';
import type { AuthenticatedPrincipal, MessagingMediaReference, MessagingRealtimeEvent } from '@me-zip/shared-types';

import {
  AdminMessagingApiAdapter,
  AdminMessagingRouteAdapter,
  InMemoryMessagingEntitlements,
  InMemoryMessagingFounderDirectory,
  InMemoryMessagingGroupProvider,
  InMemoryMessagingMediaAuthorizer,
  InMemoryMessagingNotificationTaskPublisher,
  InMemoryMessagingRealtimeHub,
  MessagingApiAdapter,
  MessagingAuthorizationError,
  MessagingError,
  MessagingService,
  type MessagingEntitlementResolver,
  requiresBackfill,
  isMessageReplay,
  toMessagingDurableMessageWrite,
} from './index.js';

let clock = Date.parse('2026-08-17T00:00:00.000Z');
let id = 0;
const now = (): string => new Date(clock).toISOString();
const nextId = (): string => `id-${++id}`;
const principal = (userId: string, adminIdentityId?: string): AuthenticatedPrincipal => ({
  userId,
  sessionId: `session-${userId}`,
  roles: [],
  issuedAt: now(),
  ...(adminIdentityId === undefined ? {} : { adminIdentityId }),
});
const advance = (milliseconds: number): void => { clock += milliseconds; };
const expectFailureCode = (operation: () => unknown, code: string): void => {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(MessagingError);
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected MessagingError(${code})`);
};

function setup(options: ConstructorParameters<typeof MessagingService>[0] = {}) {
  clock = Date.parse('2026-08-17T00:00:00.000Z');
  id = 0;
  return new MessagingService({
    ...options,
    runtime: { now, id: nextId, ...options.runtime },
  });
}

describe('MessagingService', () => {
  it('keeps direct conversations canonical and makes an offline clientMessageId idempotent', () => {
    const service = setup();
    const alice = principal('00000000-0000-4000-8000-000000000011'), bob = principal('00000000-0000-4000-8000-000000000012');
    const direct = service.openDirect(alice, bob.userId, 'open-1');

    expect(service.openDirect(bob, alice.userId).id).toBe(direct.id);
    const first = service.send(alice, direct.id, { clientMessageId: 'offline-1', body: 'hello' });
    const retry = service.send(alice, direct.id, { clientMessageId: 'offline-1', body: 'hello' });
    expect(retry.id).toBe(first.id);
    expectFailureCode(() => service.send(alice, direct.id, { clientMessageId: 'offline-1', body: 'changed' }), 'IDEMPOTENCY_REPLAY');
    expect(service.backfill(bob, direct.id, 0).items.map((message) => message.sequence)).toEqual([1]);
  });

  it('keeps stranger direct messages in a recipient-controlled request until acceptance', () => {
    const tasks = new InMemoryMessagingNotificationTaskPublisher();
    const service = setup({ notificationTaskPublisher: tasks });
    const alice = principal('alice'), bob = principal('bob');
    const request = service.createMessageRequest(alice, bob.userId, 'request-1');
    expect(request.requestState).toBe('PENDING');
    expect(request.requestRecipientUserId).toBe(bob.userId);
    expect(tasks.list()).toEqual([
      expect.objectContaining({
        type: 'MESSAGE_REQUEST',
        recipientUserId: bob.userId,
        actorUserId: alice.userId,
        messageId: null,
      }),
    ]);
    expectFailureCode(() => service.send(bob, request.id, { clientMessageId: 'before-accept', body: 'Not yet.' }), 'FORBIDDEN');
    expect(service.send(alice, request.id, { clientMessageId: 'request-message', body: 'May I message you?' }).id).toBeDefined();
    const accepted = service.resolveMessageRequest(bob, request.id, 'ACCEPT', 'request-accept');
    expect(accepted.requestState).toBe('ACCEPTED');
    expect(service.send(bob, request.id, { clientMessageId: 'accepted-reply', body: 'Yes.' }).id).toBeDefined();

    const rejected = service.createMessageRequest(alice, 'charlie', 'request-2');
    expect(service.resolveMessageRequest(principal('charlie'), rejected.id, 'REJECT', 'request-reject').requestState).toBe('REJECTED');
    expectFailureCode(() => service.send(alice, rejected.id, { clientMessageId: 'rejected-retry', body: 'no bypass' }), 'FORBIDDEN');
    expectFailureCode(() => service.openDirect(alice, 'charlie', 'rejected-open-direct'), 'FORBIDDEN');
    expectFailureCode(() => service.resolveMessageRequest(alice, request.id, 'REJECT'), 'FORBIDDEN');
  });

  it('routes strict request creation and resolution without accepting actor fields', () => {
    const service = setup();
    const api = new MessagingApiAdapter(service);
    const alice = principal('00000000-0000-4000-8000-000000000011'), bob = principal('00000000-0000-4000-8000-000000000012');
    const rejected = api.handle({ method: 'POST', path: '/v1/messaging/requests', principal: alice, body: { recipientUserId: bob.userId, ownerId: bob.userId } });
    expect(rejected.status).toBe(400);
    const opened = api.handle({ method: 'POST', path: '/v1/messaging/requests', principal: alice, body: { recipientUserId: bob.userId }, headers: { 'idempotency-key': 'api-request' } });
    expect(opened.status).toBe(201);
    const conversationId = (opened.body.data as { id: string }).id;
    const accepted = api.handle({ method: 'POST', path: `/v1/messaging/conversations/${conversationId}/request`, principal: bob, body: { action: 'ACCEPT' }, headers: { 'idempotency-key': 'api-accept' } });
    expect(accepted.body.data).toMatchObject({ requestState: 'ACCEPTED' });
  });

  it('requires an active Community membership for group access and respects cross-user blocks', () => {
    const groups = new InMemoryMessagingGroupProvider();
    groups.set('group-1', 'Study group', [
      { userId: 'alice', role: 'OWNER' },
      { userId: 'bob', role: 'MEMBER' },
    ]);
    const service = setup({ groupProvider: groups });
    const alice = principal('alice'), bob = principal('bob');
    const group = service.openGroup(alice, 'group-1');
    service.send(alice, group.id, { clientMessageId: 'group-message', body: 'welcome' });
    expect(service.listMessages(bob, group.id).items).toHaveLength(1);

    groups.set('group-1', 'Study group', [{ userId: 'alice', role: 'OWNER' }]);
    expect(() => service.listMessages(bob, group.id)).toThrowError(MessagingAuthorizationError);
    expect(() => service.openGroup(bob, 'unknown-group')).toThrowError(MessagingAuthorizationError);

    const direct = service.openDirect(alice, bob.userId);
    service.setBlock(alice, bob.userId, true);
    expectFailureCode(() => service.send(bob, direct.id, { clientMessageId: 'blocked-message', body: 'blocked' }), 'BLOCKED');
  });

  it('denies stale group members and never fans realtime or presence to their old snapshot', async () => {
    const groups = new InMemoryMessagingGroupProvider();
    const hub = new InMemoryMessagingRealtimeHub();
    groups.set('group-live', 'Live group', [
      { userId: 'alice', role: 'OWNER' },
      { userId: 'bob', role: 'MEMBER' },
    ]);
    const service = setup({ groupProvider: groups, realtimePublisher: hub });
    const alice = principal('alice'), bob = principal('bob');
    const group = service.openGroup(alice, 'group-live');
    const staleEvents: MessagingRealtimeEvent[] = [];
    await hub.transportFor(bob).subscribe({ onEvent: (event) => staleEvents.push(event) });

    groups.set('group-live', 'Live group', [{ userId: 'alice', role: 'OWNER' }]);
    service.updatePresence(alice, 'ONLINE', 5_000);
    service.send(alice, group.id, { clientMessageId: 'after-removal', body: 'current-only' });

    expect(staleEvents).toEqual([]);
    expectFailureCode(() => service.setTyping(bob, group.id, true), 'FORBIDDEN');
    expectFailureCode(() => service.getPresence(bob, alice.userId), 'FORBIDDEN');

    groups.set('group-live', 'Live group', [
      { userId: 'alice', role: 'OWNER' },
      { userId: 'bob', role: 'MEMBER' },
    ]);
    expect(service.listMessages(bob, group.id).items).toHaveLength(1);
    service.send(alice, group.id, { clientMessageId: 'after-rejoin', body: 'welcome-back' });
    expect(staleEvents.map((event) => event.type)).toContain('message.created');
  });

  it('authorizes opaque media, supports message mutation/reaction/report, and rate-limits repeated sends', () => {
    const media = new InMemoryMessagingMediaAuthorizer();
    const image: MessagingMediaReference = { mediaId: 'image-1', kind: 'IMAGE', fileName: 'a.png', contentType: 'image/png', bytes: 12 };
    media.allow(image, ['alice']);
    const service = setup({ mediaAuthorizer: media });
    const alice = principal('alice'), bob = principal('bob');
    const direct = service.openDirect(alice, bob.userId);

    expectFailureCode(() => service.send(bob, direct.id, { clientMessageId: 'not-authorized', mediaIds: ['image-1'] }), 'MEDIA_NOT_AUTHORIZED');
    const message = service.send(alice, direct.id, { clientMessageId: 'image-message', mediaIds: ['image-1'] });
    expect(message.kind).toBe('IMAGE');
    expect(message.viewer).toEqual({ canEdit: true, canDelete: true, canReact: true, canReport: false });
    expect(service.updateMessage(alice, message.id, { body: 'caption', mediaIds: ['image-1'] }).editedAt).not.toBeNull();
    expect(service.setReaction(bob, message.id, 'LIKE', true)).toMatchObject({ type: 'LIKE' });
    expectFailureCode(() => service.setReaction(bob, message.id, 'NOT_A_REACTION' as never, true), 'VALIDATION');
    expectFailureCode(() => service.updateMessage(alice, message.id, { body: 'x'.repeat(10_001) }), 'VALIDATION');
    expect(service.reportMessage(bob, message.id, 'SPAM').status).toBe('OPEN');
    expect(service.deleteMessage(alice, message.id).status).toBe('DELETED');

    for (let index = 0; index < 29; index += 1) {
      service.send(alice, direct.id, { clientMessageId: `rate-${index}`, body: `unique ${index}` });
    }
    expectFailureCode(() => service.send(alice, direct.id, { clientMessageId: 'rate-over', body: 'unique over' }), 'RATE_LIMITED');
  });

  it('writes body-free notification tasks and maps durable message/outbox columns explicitly', () => {
    const tasks = new InMemoryMessagingNotificationTaskPublisher();
    const service = setup({ notificationTaskPublisher: tasks });
    const alice = principal('alice'), bob = principal('bob');
    const direct = service.openDirect(alice, bob.userId);
    const message = service.send(alice, direct.id, { clientMessageId: 'durable-1', body: 'private words stay in messages' });

    expect(tasks.list()).toEqual([expect.objectContaining({
      recipientUserId: bob.userId,
      actorUserId: alice.userId,
      type: 'MESSAGE',
      summaryCode: 'MESSAGING_MESSAGE_RECEIVED',
    })]);
    expect(JSON.stringify(tasks.list())).not.toContain('private words');

    const write = toMessagingDurableMessageWrite(message, 'sha256:opaque-request-digest');
    expect(write.message).toMatchObject({ bodyText: 'private words stay in messages', legacyBody: { text: 'private words stay in messages' }, replyToMessageId: null });
    expect(write.outbox).toMatchObject({ senderId: alice.userId, clientMessageId: 'durable-1', status: 'APPLIED' });
    expect(JSON.stringify(write.outbox)).not.toContain('private words');

    const deleted = service.deleteMessage(alice, message.id);
    const deletedWrite = toMessagingDurableMessageWrite(deleted, 'sha256:delete-digest');
    expect(deletedWrite.message).toMatchObject({ bodyText: null, legacyBody: null, status: 'DELETED' });
    expect(deletedWrite.attachments).toEqual([]);
  });

  it('checks the canonical Founder capability and server-sorts priority inbox entries without exposing plan data', () => {
    const entitlements = new InMemoryMessagingEntitlements();
    const founders = new InMemoryMessagingFounderDirectory();
    entitlements.set('priority-user', ['FOUNDER_INBOX_ACCESS', 'FOUNDER_PRIORITY_INBOX']);
    entitlements.set('ordinary-user', ['FOUNDER_INBOX_ACCESS']);
    entitlements.set('legacy-user', ['FOUNDER_DM']);
    const service = setup({ entitlementResolver: entitlements, founderDirectory: founders });
    const founder = principal('founder'), priority = principal('priority-user'), ordinary = principal('ordinary-user'), legacy = principal('legacy-user'), deniedUser = principal('denied-user');
    const historicalGenericDirect = service.openDirect(ordinary, founder.userId);
    founders.setFounderUserId('founder');
    expect(service.listFounderInbox(founder).items).toEqual([]);
    expectFailureCode(() => service.openDirect(deniedUser, founder.userId), 'ENTITLEMENT_REQUIRED');
    expectFailureCode(() => service.openDirect(ordinary, founder.userId), 'FORBIDDEN');
    expect(service.openFounderInbox(ordinary).id).toBe(historicalGenericDirect.id);
    service.openFounderInbox(priority);
    const inbox = service.listFounderInbox(founder).items;
    expect(inbox[0]?.display.peerUserId).toBe(priority.userId);
    expect(inbox.every((item) => item.display.isFounderInbox)).toBe(true);
    expect(Object.keys(inbox[0]!).includes('planCode')).toBe(false);
    expect(service.openFounderInbox(legacy).display.isFounderInbox).toBe(true);

    const calls: string[] = [];
    const canonicalOnly: MessagingEntitlementResolver = { has: (_principal, capability) => { calls.push(capability); return false; }, hasUser: () => false };
    const denied = setup({ entitlementResolver: canonicalOnly, founderDirectory: founders });
    expectFailureCode(() => denied.openFounderInbox(principal('not-entitled')), 'ENTITLEMENT_REQUIRED');
    expect(calls).toEqual(['FOUNDER_INBOX_ACCESS']);
  });

  it('emits canonical typing and presence events, throttles typing, and falls back to HTTP backfill', async () => {
    const hub = new InMemoryMessagingRealtimeHub();
    const service = setup({ realtimePublisher: hub });
    const alice = principal('alice'), bob = principal('bob');
    const direct = service.openDirect(alice, bob.userId);
    const events: MessagingRealtimeEvent[] = [];
    await hub.transportFor(bob).subscribe({ onEvent: (event) => events.push(event) });

    expect(service.updatePresence(alice, 'AWAY', 5_000).status).toBe('AWAY');
    expect(service.getPresence(bob, alice.userId).status).toBe('AWAY');
    service.setTyping(alice, direct.id, true);
    expect(events.map((event) => event.type)).toContain('presence.updated');
    expect(events.map((event) => event.type)).toContain('typing.started');
    expectFailureCode(() => service.setTyping(alice, direct.id, false), 'RATE_LIMITED');
    advance(9_000);
    service.cleanupEphemeral();
    expect(events.map((event) => event.type)).toContain('typing.stopped');
    expect(await service.createRealtimeFallback(bob).backfill({ conversationId: direct.id, afterSequence: 0 })).toMatchObject({ items: [] });
    const handshake = new MessagingApiAdapter(service).handle({ method: 'GET', path: '/v1/messaging/realtime', principal: bob });
    expect(handshake).toMatchObject({ status: 200, body: { data: { mode: 'EXTERNAL_AUTHENTICATED_TRANSPORT', fallbackRoute: '/v1/messaging/conversations/:conversationId/messages/backfill' } } });
  });

  it('does not expose private transcripts to consumer routes and records an audit before an Admin transcript read', () => {
    const service = setup();
    expect('toSnapshot' in service).toBe(false);
    expect(Reflect.ownKeys(Object.getPrototypeOf(service))).not.toContain('snapshotForPersistence');
    const alice = principal('00000000-0000-4000-8000-000000000001'), bob = principal('bob');
    const direct = service.openDirect(alice, bob.userId);
    service.send(alice, direct.id, { clientMessageId: 'private-message', body: 'private' });
    const consumer = new MessagingApiAdapter(service);
    expect(consumer.handle({ method: 'GET', path: `/v1/admin/users/${alice.userId}/messages/private`, principal: alice }).status).toBe(404);
    const missing = consumer.handle({ method: 'GET', path: '/v1/messaging/conversations/not-a-conversation', principal: alice });
    expect(missing.status).toBe(404);
    expect(JSON.stringify(missing.body)).not.toContain('Conversation was not found');
    expect(JSON.stringify(missing.body)).not.toContain('private');

    const identities = new InMemoryAdminIdentityStore({ rootOwnerIdentity: 'root', runtime: { now, id: () => 'root-identity' } });
    const root = identities.bootstrapRoot({ userId: 'root', capabilities: ['ROOT_READ_PRIVATE_MESSAGES'] });
    const audit = new InMemoryAdminAccessAuditStore({ now, id: () => 'audit-1' });
    const authorization = new AdminAuthorizationService({ identities, audit, runtime: { now, id: () => 'authorization-id' } });
    const adapter = new AdminMessagingApiAdapter(authorization, service);
    const route = new AdminMessagingRouteAdapter(adapter);

    expect(() => adapter.readPrivateMessages(principal('root'), alice.userId)).toThrow();
    expect(adapter.readPrivateMessages(principal('root', root.id), alice.userId)).toMatchObject([{ body: 'private' }]);
    expect(audit.list()).toMatchObject([{ action: 'READ_MESSAGE', targetUserId: alice.userId, sessionId: 'session-root' }]);
    const denied = route.handle({ method: 'GET', path: `/v1/admin/users/${alice.userId}/messages/private`, principal: alice });
    expect(denied.status).toBe(403);
    expect(JSON.stringify(denied.body)).not.toContain('server-issued admin identity');
    const routed = route.handle({ method: 'GET', path: `/v1/admin/users/${alice.userId}/messages/private`, principal: principal('root', root.id) });
    expect(routed.status).toBe(200);
    expect(routed.body.data).toMatchObject([{ body: 'private' }]);
    expect(audit.list().filter((event) => event.action === 'READ_MESSAGE')).toHaveLength(2);
  });
});

describe('realtime message foundations', () => {
  it('makes retry deduplication explicit', () => {
    expect(isMessageReplay(new Set(['client-1']), 'client-1')).toBe(true);
  });

  it('detects a reconnect sequence gap', () => {
    expect(requiresBackfill(4, 6)).toBe(true);
  });
});
