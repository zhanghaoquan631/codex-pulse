import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  fromMessagingDurableMessageRow,
  toMessagingDurableMessageWrite,
} from './persistence.js';

describe('Messaging durable relational mapping', () => {
  it('maps canonical text/reply/media fields without depending on legacy JSONB body', () => {
    const write = toMessagingDurableMessageWrite({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderId: 'user-1',
      clientMessageId: 'client-1',
      sequence: 7,
      kind: 'IMAGE',
      body: 'caption',
      media: [{ mediaId: 'media-1', kind: 'IMAGE', fileName: 'a.png', contentType: 'image/png', bytes: 12 }],
      replyToMessageId: 'message-0',
      status: 'ACTIVE',
      reactions: [],
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
      editedAt: null,
      deletedAt: null,
      deletedByUserId: null,
    }, 'sha256:request');

    expect(write.message).toMatchObject({ bodyText: 'caption', replyToMessageId: 'message-0', legacyBody: { text: 'caption' } });
    expect(write.attachments).toEqual([{ messageId: 'message-1', mediaId: 'media-1', kind: 'IMAGE', ordinal: 0 }]);
    expect(write.outbox).toEqual({ senderId: 'user-1', clientMessageId: 'client-1', conversationId: 'conversation-1', messageId: 'message-1', requestDigest: 'sha256:request', status: 'APPLIED' });

    expect(fromMessagingDurableMessageRow(write.message, [{ mediaId: 'media-1', kind: 'IMAGE', fileName: 'a.png', contentType: 'image/png', bytes: 12 }], [])).toMatchObject({ body: 'caption', replyToMessageId: 'message-0', media: [{ mediaId: 'media-1' }] });
  });

  it('keeps the 006 migration additive, body-free on delete, and free of a consumer Root bypass', () => {
    const migration = readFileSync(new URL('../../../infrastructure/database/006_phase5_messaging.sql', import.meta.url), 'utf8');
    expect(migration).toContain('ALTER TABLE messages ALTER COLUMN body DROP NOT NULL;');
    expect(migration).toContain('ALTER TABLE messages ADD COLUMN IF NOT EXISTS body_text text;');
    expect(migration).toContain('ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id uuid;');
    expect(migration).toContain('ALTER TABLE conversations ADD COLUMN IF NOT EXISTS founder_inbox boolean NOT NULL DEFAULT false;');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS messaging_notifications');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION mezip_guard_message_update()');
    expect(migration).toContain('NEW.body_text IS NOT NULL OR NEW.body IS NOT NULL');
    expect(migration).not.toContain('mezip_admin_has_capability');
  });
});
