import type {
  JsonObject,
  MessagingMediaReference,
  MessagingMessage,
  MessagingReaction,
} from '@me-zip/shared-types';

/**
 * Server-side relational representation for migration 006.  This deliberately
 * mirrors the additive columns instead of treating the legacy JSONB `body` or
 * `reply_to_id` columns as the canonical write model.
 *
 * A database adapter owns the transaction and Media joins.  It supplies the
 * opaque attachment metadata on reads; Messaging never treats a storage URL or
 * archive row as client input.
 */
export interface MessagingDurableMessageRow {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly clientMessageId: string;
  readonly sequence: number;
  readonly kind: MessagingMessage['kind'];
  readonly bodyText: string | null;
  /** Transitional 001 JSONB mirror. New durable writes use `bodyText`; a
   * deleted or media-only message writes null here as well. */
  readonly legacyBody: JsonObject | null;
  readonly replyToMessageId: string | null;
  readonly status: MessagingMessage['status'];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly editedAt: string | null;
  readonly deletedAt: string | null;
  readonly deletedByUserId: string | null;
}

export interface MessagingDurableAttachmentRow {
  readonly messageId: string;
  readonly mediaId: string;
  readonly kind: MessagingMediaReference['kind'];
  readonly ordinal: number;
}

/** `message_outbox` has a digest and identifiers only; private content is not
 * duplicated into the offline retry acknowledgement. */
export interface MessagingDurableOutboxRow {
  readonly senderId: string;
  readonly clientMessageId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly requestDigest: string;
  readonly status: 'APPLIED';
}

export interface MessagingDurableMessageWrite {
  readonly message: MessagingDurableMessageRow;
  readonly attachments: readonly MessagingDurableAttachmentRow[];
  readonly outbox: MessagingDurableOutboxRow;
}

/** Contract for a trusted Postgres adapter. Its implementation must commit the
 * message, attachments, conversation sequence and outbox acknowledgement in
 * one transaction under the server-derived principal context. */
export interface MessagingDurableRepository {
  persistMessage(write: MessagingDurableMessageWrite): void;
}

export function toMessagingDurableMessageWrite(
  message: MessagingMessage,
  requestDigest: string,
): MessagingDurableMessageWrite {
  if (requestDigest.trim() === '') throw new Error('A non-empty request digest is required for message_outbox.');
  const bodyText = message.status === 'DELETED' ? null : message.body;
  return {
    message: {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      clientMessageId: message.clientMessageId,
      sequence: message.sequence,
      kind: message.kind,
      bodyText,
      legacyBody: bodyText === null ? null : { text: bodyText },
      replyToMessageId: message.replyToMessageId,
      status: message.status,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      editedAt: message.editedAt,
      deletedAt: message.deletedAt,
      deletedByUserId: message.deletedByUserId,
    },
    attachments: message.status === 'DELETED'
      ? []
      : message.media.map((media, ordinal) => ({ messageId: message.id, mediaId: media.mediaId, kind: media.kind, ordinal })),
    outbox: {
      senderId: message.senderId,
      clientMessageId: message.clientMessageId,
      conversationId: message.conversationId,
      messageId: message.id,
      requestDigest,
      status: 'APPLIED',
    },
  };
}

/** The inverse mapping is intentionally explicit about the Media join. */
export function fromMessagingDurableMessageRow(
  row: MessagingDurableMessageRow,
  media: readonly MessagingMediaReference[],
  reactions: readonly MessagingReaction[],
): MessagingMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    clientMessageId: row.clientMessageId,
    sequence: row.sequence,
    kind: row.kind,
    body: row.status === 'DELETED' ? null : row.bodyText,
    media: row.status === 'DELETED' ? [] : media,
    replyToMessageId: row.replyToMessageId,
    status: row.status,
    reactions,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    deletedByUserId: row.deletedByUserId,
  };
}
