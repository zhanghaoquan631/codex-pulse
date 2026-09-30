import { createMeZipSdk, type MeZipSdkTransport } from '@me-zip/sdk';
import type { ApiResponse, MessagingMessageView as SdkMessage } from '@me-zip/shared-types';
import { describe, expect, it, vi } from 'vitest';

import {
  ApiMessagingClient,
  hasMessagingSequenceGap,
  type MessagingClient,
  type MessagingMessage,
  UnavailableMessagingClient,
} from './messagingClient.js';
import {
  MemoryMessagingStorage,
  MessagingDraftCache,
  MessagingOutbox,
} from './messagingOutbox.js';

const canonicalMessage: SdkMessage = {
  id: 'message-1',
  conversationId: 'conversation-1',
  senderId: 'server-scoped-sender-1',
  clientMessageId: 'client-message-1',
  sequence: 1,
  kind: 'TEXT',
  body: '仅服务端已授权内容',
  media: [],
  replyToMessageId: null,
  status: 'ACTIVE',
  reactions: [],
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-17T00:00:00.000Z',
  editedAt: null,
  deletedAt: null,
  deletedByUserId: null,
  viewer: { canEdit: true, canDelete: true, canReact: true, canReport: false },
};

const safeMessage: MessagingMessage = {
  id: 'message-1',
  conversationId: 'conversation-1',
  clientMessageId: 'client-message-1',
  sequence: 1,
  sender: { userId: 'server-scoped-sender-1', displayName: '会话成员', avatarLabel: null, presence: 'OFFLINE' },
  type: 'TEXT',
  body: '仅服务端已授权内容',
  attachments: [],
  replyTo: null,
  reactions: [],
  delivery: 'SENT',
  createdAt: '2026-08-17T00:00:00.000Z',
  editedAt: null,
  deletedAt: null,
  viewer: { isSender: false, canEdit: false, canDelete: false, canReact: true, canReport: true },
};

function success<T>(data: T): ApiResponse<T> {
  return { data, meta: { requestId: 'test-request' } };
}

describe('Messaging client boundary', () => {
  it('fails closed when no approved Messaging service is configured', async () => {
    const client: MessagingClient = new UnavailableMessagingClient();
    const [conversations, message, unread] = await Promise.all([
      client.listConversations(),
      client.sendMessage({
        conversationId: 'conversation-1',
        clientMessageId: 'client-1',
        body: 'must not become a fake sent message',
        idempotencyKey: 'send-1',
      }),
      client.getUnreadSummary(),
    ]);

    for (const result of [conversations, message, unread]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.source).toBe('UNAVAILABLE');
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
      }
    }
  });

  it('uses the shared SDK route and keeps authorization fields out of message writes', async () => {
    const calls: Array<{ readonly path: string; readonly body: unknown; readonly idempotencyKey?: string }> = [];
    const transport: MeZipSdkTransport = {
      async request<T>(input: Parameters<MeZipSdkTransport['request']>[0]) {
        calls.push({
          path: input.path,
          body: input.body,
          ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
        });
        return success(canonicalMessage as T);
      },
    };
    const client = new ApiMessagingClient(createMeZipSdk(transport).messaging);

    await client.sendMessage({
      conversationId: 'conversation-1',
      clientMessageId: 'client-message-1',
      body: 'safe request',
      mediaIds: ['media-1'],
      replyToMessageId: 'message-0',
      idempotencyKey: 'send-1',
    });

    expect(calls).toEqual([{
      path: '/v1/messaging/conversations/conversation-1/messages',
      body: {
        clientMessageId: 'client-message-1',
        body: 'safe request',
        mediaIds: ['media-1'],
        replyToMessageId: 'message-0',
      },
      idempotencyKey: 'send-1',
    }]);
    const serialized = JSON.stringify(calls[0]?.body);
    for (const forbidden of ['actorId', 'ownerId', 'userId', 'plan', 'entitlement', 'root']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('maps only the canonical SDK message projection into the UI surface', async () => {
    const transport: MeZipSdkTransport = {
      async request<T>() {
        return success(canonicalMessage as T);
      },
    };
    const client = new ApiMessagingClient(createMeZipSdk(transport).messaging);
    const result = await client.sendMessage({
      conversationId: 'conversation-1',
      clientMessageId: 'client-message-1',
      body: 'safe request',
      idempotencyKey: 'send-1',
    });
    expect(result).toMatchObject({
      ok: true,
      source: 'SERVER',
      data: {
        id: 'message-1',
        conversationId: 'conversation-1',
        delivery: 'SENT',
        sender: { displayName: '会话成员' },
        viewer: { canEdit: true, canDelete: true, canReact: true, canReport: false },
      },
    });
  });

  it('uses the SDK backfill route and detects only forward sequence gaps', async () => {
    const calls: Parameters<MeZipSdkTransport['request']>[0][] = [];
    const transport: MeZipSdkTransport = {
      async request<T>(input: Parameters<MeZipSdkTransport['request']>[0]) {
        calls.push(input);
        return success({ items: [canonicalMessage], nextCursor: null, hasMore: false } as T);
      },
    };
    const client = new ApiMessagingClient(createMeZipSdk(transport).messaging);
    const result = await client.backfill({ conversationId: 'conversation-1', afterSequence: 4, limit: 80 });

    expect(result).toMatchObject({ ok: true, data: { items: [{ id: 'message-1', sequence: 1 }] } });
    expect(calls).toEqual([expect.objectContaining({
      method: 'GET',
      path: '/v1/messaging/conversations/conversation-1/messages/backfill',
      query: { afterSequence: 4, limit: 80, cursor: undefined },
    })]);
    expect(hasMessagingSequenceGap(4, 5)).toBe(false);
    expect(hasMessagingSequenceGap(4, 6)).toBe(true);
    expect(hasMessagingSequenceGap(6, 4)).toBe(false);
  });
});

describe('Messaging local resilience state', () => {
  it('retries an outbox record with the exact same client message ID', async () => {
    const outbox = new MessagingOutbox({ storage: new MemoryMessagingStorage(), now: () => 0 });
    outbox.enqueue({
      conversationId: 'conversation-1',
      clientMessageId: 'client-message-1',
      body: '本地待发送内容',
    });
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false as const,
        source: 'SERVER' as const,
        error: { code: 'OFFLINE' as const, message: 'offline', retryable: true },
      })
      .mockResolvedValueOnce({ ok: true as const, source: 'SERVER' as const, data: safeMessage });
    const client = { source: 'SERVER', sendMessage } as unknown as MessagingClient;

    const first = await outbox.flushOne(client, 'client-message-1');
    expect(first.ok).toBe(false);
    expect(outbox.list()[0]).toMatchObject({
      clientMessageId: 'client-message-1',
      state: 'PENDING',
      attempts: 1,
    });

    const second = await outbox.flushOne(client, 'client-message-1');
    expect(second.ok).toBe(true);
    expect(outbox.list()).toEqual([]);
    expect(sendMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      clientMessageId: 'client-message-1',
      idempotencyKey: 'client-message-1',
    }));
    expect(sendMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
      clientMessageId: 'client-message-1',
      idempotencyKey: 'client-message-1',
    }));
  });

  it('keeps an unsynced draft local and clears it explicitly', () => {
    const drafts = new MessagingDraftCache({ storage: new MemoryMessagingStorage(), now: () => 0 });
    expect(drafts.save('conversation-1', '离线草稿')).toMatchObject({
      conversationId: 'conversation-1',
      body: '离线草稿',
    });
    expect(drafts.get('conversation-1')?.body).toBe('离线草稿');
    drafts.clear('conversation-1');
    expect(drafts.get('conversation-1')).toBeNull();
  });

  it('keeps queued messages and drafts in separate account namespaces', () => {
    const storage = new MemoryMessagingStorage();
    const outbox = new MessagingOutbox({ storage, now: () => 0, accountSubject: 'account_a' });
    const drafts = new MessagingDraftCache({ storage, now: () => 0, accountSubject: 'account_a' });
    outbox.enqueue({ conversationId: 'conversation-1', clientMessageId: 'message-a', body: 'A only' });
    drafts.save('conversation-1', 'draft A');

    outbox.setAccountSubject('account_b');
    drafts.setAccountSubject('account_b');
    expect(outbox.list()).toEqual([]);
    expect(drafts.get('conversation-1')).toBeNull();

    outbox.setAccountSubject('account_a');
    drafts.setAccountSubject('account_a');
    expect(outbox.list()).toHaveLength(1);
    expect(drafts.get('conversation-1')?.body).toBe('draft A');
  });
});
