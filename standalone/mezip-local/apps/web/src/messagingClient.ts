/**
 * Browser boundary for Phase 5 Messaging.
 *
 * The UI owns presentation and local resilience only. All resource reads,
 * membership, block rules, Founder access and mutation authorization pass
 * through the shared typed SDK. There is deliberately no browser fixture,
 * client plan check, actor field, or route-by-route REST reimplementation.
 */

import {
  createMeZipSdk,
  type MeZipSdkTransport,
  type MessagingSdk,
} from '@me-zip/sdk';
import type {
  ApiResponse,
  MessagingConversationMember as SdkConversationMember,
  MessagingConversationSummary as SdkConversation,
  MessagingCursorPage as SdkCursorPage,
  MessagingDraft as SdkDraft,
  MessagingMediaReference as SdkMediaReference,
  MessagingMessageView as SdkMessage,
  MessagingReaction as SdkReaction,
  MessagingRealtimeEvent as SdkRealtimeEvent,
  MessagingSearchResult as SdkSearchResult,
} from '@me-zip/shared-types';

export const messagingConversationKinds = ['DIRECT', 'GROUP', 'FOUNDER', 'SYSTEM'] as const;
export type MessagingConversationKind = (typeof messagingConversationKinds)[number];

export const messagingMessageTypes = ['TEXT', 'IMAGE', 'VIDEO', 'VOICE', 'FILE', 'SYSTEM'] as const;
export type MessagingMessageType = (typeof messagingMessageTypes)[number];

export const messageDeliveryStates = ['PENDING', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'] as const;
export type MessageDeliveryState = (typeof messageDeliveryStates)[number];

export const messagingPresenceStates = ['ONLINE', 'AWAY', 'OFFLINE'] as const;
export type MessagingPresenceState = (typeof messagingPresenceStates)[number];

/** Keep the UI's report vocabulary within the server's typed vocabulary. */
export const messageReportReasons = [
  'SPAM',
  'HARASSMENT',
  'HATE',
  'SEXUAL',
  'VIOLENCE',
  'SCAM',
  'PRIVACY',
  'OTHER',
] as const;
export type MessageReportReason = (typeof messageReportReasons)[number];

export type MessagingClientSource = 'SERVER' | 'UNAVAILABLE';

export type MessagingFailureCode =
  | 'SERVICE_UNAVAILABLE'
  | 'OFFLINE'
  | 'UNAUTHORIZED'
  | 'ENTITLEMENT_REQUIRED'
  | 'FORBIDDEN'
  | 'BLOCKED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'ATTACHMENT_UNAVAILABLE'
  | 'CONTENT_UNAVAILABLE'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

export interface MessagingClientError {
  readonly code: MessagingFailureCode;
  /** Presentation-safe copy only; raw service error bodies never reach a view. */
  readonly message: string;
  readonly retryable: boolean;
}

export type MessagingResult<T> =
  | { readonly ok: true; readonly data: T; readonly source: MessagingClientSource }
  | { readonly ok: false; readonly error: MessagingClientError; readonly source: MessagingClientSource };

export interface MessagingCursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/** Never render a raw account identifier as a display name. */
export interface MessagingParticipant {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarLabel: string | null;
  readonly presence: MessagingPresenceState;
}

export interface MessagingConversationSettings {
  readonly muted: boolean;
  readonly mutedUntil: string | null;
  readonly archived: boolean;
  readonly pinned: boolean;
}

export interface MessagingTypingParticipant {
  readonly userId: string;
  readonly displayName: string;
  readonly expiresAt: string;
}

export interface MessagingConversation {
  readonly id: string;
  readonly kind: MessagingConversationKind;
  readonly title: string;
  /** Media IDs are intentionally not rendered as a browser URL or an asset. */
  readonly avatarLabel: string | null;
  readonly participants: readonly MessagingParticipant[];
  /** Exposed only when the server confirms an authorized direct peer. */
  readonly directPeer: MessagingParticipant | null;
  readonly latestPreview: string | null;
  readonly latestAt: string | null;
  readonly unreadCount: number;
  readonly lastReadSequence: number;
  readonly settings: MessagingConversationSettings;
  readonly typing: readonly MessagingTypingParticipant[];
  readonly viewer: {
    readonly membership: 'ACTIVE' | 'REQUEST' | 'REMOVED' | 'BANNED';
    /** These are conservative UI affordances, never an authorization decision. */
    readonly canRead: boolean;
    readonly canSend: boolean;
    /** Deliberately never derived from a plan. The Founder route decides server-side. */
    readonly canStartFounderInbox: false;
    /** Not projected by the SDK, so it is never guessed by the browser. */
    readonly founderInboxPriority: false;
    readonly canBlockPeer: boolean;
  };
}

export interface MessagingAttachment {
  readonly id: string;
  readonly type: Exclude<MessagingMessageType, 'TEXT' | 'SYSTEM'>;
  readonly name: string;
  readonly bytes: number;
  readonly durationMs: number | null;
  readonly thumbnailUrl: string | null;
  /** Only a separately authorized media delivery service can supply this. */
  readonly deliveryUrl: string | null;
  readonly state: 'PENDING' | 'READY' | 'QUARANTINED' | 'REMOVED';
}

export interface MessagingReactionSummary {
  readonly reaction: string;
  readonly count: number;
  /** The canonical message projection does not expose viewer reaction state. */
  readonly reactedByViewer: boolean;
}

export interface MessagingReplyPreview {
  readonly id: string;
  readonly senderName: string;
  readonly type: MessagingMessageType;
  readonly body: string | null;
  readonly deleted: boolean;
}

export interface MessagingMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly clientMessageId: string;
  readonly sequence: number;
  readonly sender: MessagingParticipant;
  readonly type: MessagingMessageType;
  readonly body: string | null;
  readonly attachments: readonly MessagingAttachment[];
  readonly replyTo: MessagingReplyPreview | null;
  readonly reactions: readonly MessagingReactionSummary[];
  readonly delivery: MessageDeliveryState;
  readonly createdAt: string;
  readonly editedAt: string | null;
  readonly deletedAt: string | null;
  readonly viewer: {
    /** Derived only from the server-generated per-message viewer projection. */
    readonly isSender: boolean;
    readonly canEdit: boolean;
    readonly canDelete: boolean;
    /** Server remains authoritative if it accepts/rejects a reaction or report. */
    readonly canReact: boolean;
    readonly canReport: boolean;
  };
}

export interface MessagingUnreadSummary {
  readonly unreadCount: number;
  readonly conversationCount: number;
}

export interface MessagingDraft {
  readonly conversationId: string;
  readonly body: string;
  readonly updatedAt: string;
}

/** Server search never returns a message body or a fabricated conversation title. */
export interface MessagingSearchResult {
  readonly messageId: string;
  readonly conversationId: string;
  readonly sequence: number;
  readonly snippet: string;
  readonly createdAt: string;
}

export type MessagingRealtimeEvent =
  | { readonly type: 'message.created' | 'message.updated'; readonly message: MessagingMessage }
  | { readonly type: 'message.deleted'; readonly conversationId: string; readonly messageId: string; readonly sequence: number }
  | {
      readonly type: 'message.reaction.updated';
      readonly conversationId: string;
      readonly messageId: string;
      readonly sequence: number;
      readonly reaction: MessagingReactionSummary;
      readonly active: boolean;
    }
  | { readonly type: 'conversation.read'; readonly conversationId: string; readonly lastReadSequence: number }
  | { readonly type: 'typing.started' | 'typing.stopped'; readonly conversationId: string; readonly participant: MessagingTypingParticipant }
  | { readonly type: 'presence.updated'; readonly participant: MessagingParticipant };

export type MessagingRealtimeStatus = 'UNAVAILABLE' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'FALLBACK';

export interface MessagingClient {
  readonly source: MessagingClientSource;
  listConversations(input?: { readonly cursor?: string; readonly limit?: number; readonly includeArchived?: boolean }): Promise<MessagingResult<MessagingCursorPage<MessagingConversation>>>;
  getConversation(conversationId: string): Promise<MessagingResult<MessagingConversation>>;
  /** Founder-only management inbox. Normal member UI must not call this route. */
  listFounderInbox(input?: { readonly cursor?: string; readonly limit?: number }): Promise<MessagingResult<MessagingCursorPage<MessagingConversation>>>;
  openFounderInbox(input: { readonly idempotencyKey: string }): Promise<MessagingResult<MessagingConversation>>;
  openDirect(input: { readonly recipientUserId: string; readonly idempotencyKey: string }): Promise<MessagingResult<MessagingConversation>>;
  resolveMessageRequest(input: { readonly conversationId: string; readonly action: 'ACCEPT' | 'REJECT'; readonly idempotencyKey: string }): Promise<MessagingResult<MessagingConversation>>;
  openGroup(input: { readonly groupId: string; readonly idempotencyKey: string }): Promise<MessagingResult<MessagingConversation>>;
  listMessages(input: { readonly conversationId: string; readonly cursor?: string; readonly limit?: number; readonly beforeSequence?: number }): Promise<MessagingResult<MessagingCursorPage<MessagingMessage>>>;
  backfill(input: { readonly conversationId: string; readonly afterSequence: number; readonly cursor?: string; readonly limit?: number }): Promise<MessagingResult<MessagingCursorPage<MessagingMessage>>>;
  sendMessage(input: { readonly conversationId: string; readonly clientMessageId: string; readonly body?: string; readonly mediaIds?: readonly string[]; readonly replyToMessageId?: string; readonly idempotencyKey: string }): Promise<MessagingResult<MessagingMessage>>;
  updateMessage(input: { readonly conversationId: string; readonly messageId: string; readonly body: string; readonly idempotencyKey: string }): Promise<MessagingResult<MessagingMessage>>;
  deleteMessage(input: { readonly conversationId: string; readonly messageId: string; readonly idempotencyKey: string }): Promise<MessagingResult<MessagingMessage>>;
  setReaction(input: { readonly conversationId: string; readonly messageId: string; readonly reaction: 'LIKE' | 'LOVE' | 'LAUGH' | 'SURPRISED' | 'SAD' | 'THANKS'; readonly active: boolean; readonly idempotencyKey: string }): Promise<MessagingResult<MessagingReactionSummary>>;
  markRead(input: { readonly conversationId: string; readonly sequence: number; readonly idempotencyKey: string }): Promise<MessagingResult<{ readonly lastReadSequence: number }>>;
  markUnread(input: { readonly conversationId: string; readonly sequence: number; readonly idempotencyKey: string }): Promise<MessagingResult<{ readonly unread: boolean }>>;
  getUnreadSummary(): Promise<MessagingResult<MessagingUnreadSummary>>;
  getDraft(input: { readonly conversationId: string }): Promise<MessagingResult<MessagingDraft | null>>;
  saveDraft(input: { readonly conversationId: string; readonly body: string; readonly idempotencyKey: string }): Promise<MessagingResult<MessagingDraft | null>>;
  updateSettings(input: { readonly conversationId: string; readonly mutedUntil?: string | null; readonly archived?: boolean; readonly pinned?: boolean; readonly idempotencyKey: string }): Promise<MessagingResult<MessagingConversationSettings>>;
  search(input: { readonly query: string; readonly cursor?: string; readonly limit?: number }): Promise<MessagingResult<MessagingCursorPage<MessagingSearchResult>>>;
  setTyping(input: { readonly conversationId: string; readonly active: boolean }): Promise<MessagingResult<{ readonly active: boolean; readonly expiresAt: string | null }>>;
  getPresence(input: { readonly userIds: readonly string[] }): Promise<MessagingResult<readonly MessagingParticipant[]>>;
  setBlock(input: { readonly userId: string; readonly blocked: boolean; readonly idempotencyKey: string }): Promise<MessagingResult<{ readonly blocked: boolean }>>;
  submitReport(input: { readonly conversationId: string; readonly messageId: string; readonly reason: MessageReportReason; readonly detail?: string; readonly idempotencyKey: string }): Promise<MessagingResult<{ readonly reportId: string }>>;
}

const unavailableError: MessagingClientError = {
  code: 'SERVICE_UNAVAILABLE',
  message: '消息服务尚未连接；不会以演示数据代替你的私人会话。',
  retryable: true,
};

function failure<T>(error: MessagingClientError, source: MessagingClientSource = 'SERVER'): MessagingResult<T> {
  return { ok: false, source, error };
}

function unavailable<T>(): MessagingResult<T> {
  return failure(unavailableError, 'UNAVAILABLE');
}

/** Default client: it reveals no conversations, contacts, content, or success state. */
export class UnavailableMessagingClient implements MessagingClient {
  readonly source = 'UNAVAILABLE' as const;

  async listConversations(): Promise<MessagingResult<MessagingCursorPage<MessagingConversation>>> { return unavailable(); }
  async getConversation(): Promise<MessagingResult<MessagingConversation>> { return unavailable(); }
  async listFounderInbox(): Promise<MessagingResult<MessagingCursorPage<MessagingConversation>>> { return unavailable(); }
  async openFounderInbox(): Promise<MessagingResult<MessagingConversation>> { return unavailable(); }
  async openDirect(): Promise<MessagingResult<MessagingConversation>> { return unavailable(); }
  async resolveMessageRequest(): Promise<MessagingResult<MessagingConversation>> { return unavailable(); }
  async openGroup(): Promise<MessagingResult<MessagingConversation>> { return unavailable(); }
  async listMessages(): Promise<MessagingResult<MessagingCursorPage<MessagingMessage>>> { return unavailable(); }
  async backfill(): Promise<MessagingResult<MessagingCursorPage<MessagingMessage>>> { return unavailable(); }
  async sendMessage(): Promise<MessagingResult<MessagingMessage>> { return unavailable(); }
  async updateMessage(): Promise<MessagingResult<MessagingMessage>> { return unavailable(); }
  async deleteMessage(): Promise<MessagingResult<MessagingMessage>> { return unavailable(); }
  async setReaction(): Promise<MessagingResult<MessagingReactionSummary>> { return unavailable(); }
  async markRead(): Promise<MessagingResult<{ readonly lastReadSequence: number }>> { return unavailable(); }
  async markUnread(): Promise<MessagingResult<{ readonly unread: boolean }>> { return unavailable(); }
  async getUnreadSummary(): Promise<MessagingResult<MessagingUnreadSummary>> { return unavailable(); }
  async getDraft(): Promise<MessagingResult<MessagingDraft | null>> { return unavailable(); }
  async saveDraft(): Promise<MessagingResult<MessagingDraft | null>> { return unavailable(); }
  async updateSettings(): Promise<MessagingResult<MessagingConversationSettings>> { return unavailable(); }
  async search(): Promise<MessagingResult<MessagingCursorPage<MessagingSearchResult>>> { return unavailable(); }
  async setTyping(): Promise<MessagingResult<{ readonly active: boolean; readonly expiresAt: string | null }>> { return unavailable(); }
  async getPresence(): Promise<MessagingResult<readonly MessagingParticipant[]>> { return unavailable(); }
  async setBlock(): Promise<MessagingResult<{ readonly blocked: boolean }>> { return unavailable(); }
  async submitReport(): Promise<MessagingResult<{ readonly reportId: string }>> { return unavailable(); }
}

function errorForHttpStatus(status: number): MessagingClientError {
  if (status === 401) return { code: 'UNAUTHORIZED', message: '请先完成安全登录。', retryable: false };
  if (status === 403) return { code: 'FORBIDDEN', message: '当前账号无权访问该私人会话。', retryable: false };
  if (status === 404) return { code: 'NOT_FOUND', message: '该会话或消息不存在，或对你不可见。', retryable: false };
  if (status === 409) return { code: 'CONFLICT', message: '消息状态已变化，请刷新后重试。', retryable: true };
  if (status === 422) return { code: 'VALIDATION', message: '请检查消息内容或附件状态。', retryable: false };
  if (status === 429) return { code: 'RATE_LIMITED', message: '发送过于频繁，请稍后重试。', retryable: true };
  return { code: 'SERVICE_UNAVAILABLE', message: '消息服务暂时不可用。', retryable: status >= 500 };
}

function safeFailureCode(value: unknown, fallback: MessagingFailureCode): MessagingFailureCode {
  const aliases: Readonly<Record<string, MessagingFailureCode>> = {
    MESSAGE_NOT_FOUND: 'NOT_FOUND',
    CONVERSATION_NOT_FOUND: 'NOT_FOUND',
    CONVERSATION_MEMBERSHIP_REQUIRED: 'FORBIDDEN',
    MESSAGE_BLOCKED: 'BLOCKED',
    FOUNDER_INBOX_ACCESS_REQUIRED: 'ENTITLEMENT_REQUIRED',
    MESSAGE_RATE_LIMITED: 'RATE_LIMITED',
    MEDIA_NOT_AUTHORIZED: 'ATTACHMENT_UNAVAILABLE',
    ATTACHMENT_NOT_AUTHORIZED: 'ATTACHMENT_UNAVAILABLE',
    MESSAGE_CONTENT_UNAVAILABLE: 'CONTENT_UNAVAILABLE',
    IDEMPOTENCY_REPLAY: 'CONFLICT',
  };
  if (typeof value !== 'string') return fallback;
  const allowed: readonly MessagingFailureCode[] = [
    'SERVICE_UNAVAILABLE', 'OFFLINE', 'UNAUTHORIZED', 'ENTITLEMENT_REQUIRED', 'FORBIDDEN', 'BLOCKED',
    'NOT_FOUND', 'VALIDATION', 'CONFLICT', 'RATE_LIMITED', 'ATTACHMENT_UNAVAILABLE', 'CONTENT_UNAVAILABLE',
    'UNSUPPORTED', 'UNKNOWN',
  ];
  return aliases[value] ?? (allowed.includes(value as MessagingFailureCode) ? value as MessagingFailureCode : fallback);
}

function mapSdkFailure(value: { readonly code: string; readonly retryable: boolean }): MessagingClientError {
  const fallback = errorForHttpStatus(500);
  const code = safeFailureCode(value.code, fallback.code);
  const reviewedCopy: Readonly<Record<MessagingFailureCode, string>> = {
    SERVICE_UNAVAILABLE: '消息服务暂时不可用。',
    OFFLINE: '当前网络不可用；消息没有被伪装为已发送。',
    UNAUTHORIZED: '请先完成安全登录。',
    ENTITLEMENT_REQUIRED: '此功能需要服务端确认的权益。',
    FORBIDDEN: '当前账号无权访问该私人会话。',
    BLOCKED: '此操作因屏蔽关系无法完成。',
    NOT_FOUND: '该会话或消息不存在，或对你不可见。',
    VALIDATION: '请检查消息内容或附件状态。',
    CONFLICT: '消息状态已变化，请刷新后重试。',
    RATE_LIMITED: '发送过于频繁，请稍后重试。',
    ATTACHMENT_UNAVAILABLE: '附件尚未通过 Media 服务授权。',
    CONTENT_UNAVAILABLE: '消息内容目前不可用。',
    UNSUPPORTED: '当前服务尚未提供此操作。',
    UNKNOWN: '消息服务暂时不可用。',
  };
  return { code, message: reviewedCopy[code], retryable: value.retryable };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface FetchMessagingTransportOptions {
  readonly baseUrl: string;
  readonly fetchFn?: typeof fetch;
}

/**
 * Credentialed transport supplied to `createMeZipSdk`. It only transports the
 * typed SDK's request descriptor. Browser-managed credentials stay opaque;
 * the caller never supplies an actor, owner, plan, entitlement or Root flag.
 */
export class FetchMessagingTransport implements MeZipSdkTransport {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: FetchMessagingTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    // Keep the browser's receiver bound when the transport stores the native fetch function.
    // Detached browser fetch calls can otherwise fail before a request reaches the local API.
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async request<T>(input: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    body?: unknown;
    query?: Readonly<Record<string, string | number | boolean | undefined>>;
    idempotencyKey?: string;
  }): Promise<ApiResponse<T>> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { error: { code: 'OFFLINE', message: 'offline', retryable: true, requestId: 'browser-offline' } };
    }
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(input.query ?? {})) if (value !== undefined) search.set(key, String(value));
    const url = `${this.baseUrl}${input.path}${search.size === 0 ? '' : `?${search.toString()}`}`;
    try {
      const response = await this.fetchFn(url, {
        method: input.method,
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(input.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(input.idempotencyKey === undefined ? {} : { 'Idempotency-Key': input.idempotencyKey }),
        },
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (response.ok && isRecord(payload) && 'data' in payload) {
        return {
          data: payload.data as T,
          meta: { requestId: isRecord(payload.meta) && typeof payload.meta.requestId === 'string' ? payload.meta.requestId : 'browser-transport' },
        };
      }
      const fallback = errorForHttpStatus(response.status);
      // Keep this provider capability result intact for integrations which can
      // explain the restriction precisely. Other feature clients continue to
      // map unfamiliar codes through their own safe fallback.
      const rawCode = isRecord(payload) && isRecord(payload.error) ? payload.error.code : null;
      const code = rawCode === 'PERMISSION_DENIED' ? rawCode : safeFailureCode(rawCode, fallback.code);
      return { error: { code, message: 'request failed', retryable: fallback.retryable, requestId: 'browser-transport' } };
    } catch {
      return { error: { code: 'SERVICE_UNAVAILABLE', message: 'network unavailable', retryable: true, requestId: 'browser-network' } };
    }
  }
}

async function fromSdk<T, U>(request: Promise<ApiResponse<T>>, project: (value: T) => U): Promise<MessagingResult<U>> {
  try {
    const response = await request;
    if ('error' in response) return failure(mapSdkFailure(response.error));
    try {
      return { ok: true, source: 'SERVER', data: project(response.data) };
    } catch {
      return failure({
        code: 'CONTENT_UNAVAILABLE',
        message: '服务端消息投影无效；为保护私人数据未显示内容。',
        retryable: true,
      });
    }
  } catch {
    return failure({ code: 'SERVICE_UNAVAILABLE', message: '消息服务暂时不可用。', retryable: true });
  }
}

function mapMembership(status: SdkConversationMember['status']): MessagingConversation['viewer']['membership'] {
  if (status === 'ACTIVE') return 'ACTIVE';
  if (status === 'BANNED') return 'BANNED';
  return 'REMOVED';
}

function mapConversationSettings(member: SdkConversationMember): MessagingConversationSettings {
  return {
    muted: member.mutedUntil !== null,
    mutedUntil: member.mutedUntil,
    archived: member.archivedAt !== null,
    pinned: member.pinnedAt !== null,
  };
}

function mapConversation(value: SdkConversation): MessagingConversation {
  const active = value.viewer.status === 'ACTIVE' && value.status === 'ACTIVE' && value.viewer.role !== 'BANNED';
  const requestRecipient = value.requestState === 'PENDING' && value.display.peerUserId !== null && value.createdByUserId === value.display.peerUserId;
  const peer = value.display.peerUserId === null
    ? null
    : { userId: value.display.peerUserId, displayName: value.display.title, avatarLabel: null, presence: 'OFFLINE' as const };
  return {
    id: value.id,
    kind: value.display.isFounderInbox ? 'FOUNDER' : value.kind,
    title: value.display.title,
    avatarLabel: null,
    participants: [],
    directPeer: peer,
    latestPreview: value.lastMessage?.bodyPreview ?? null,
    latestAt: value.lastMessageAt,
    unreadCount: value.unreadCount,
    lastReadSequence: value.viewer.lastReadSequence,
    settings: mapConversationSettings(value.viewer),
    typing: [],
    viewer: {
      membership: requestRecipient ? 'REQUEST' : mapMembership(value.viewer.status),
      canRead: active && !requestRecipient,
      canSend: active && !requestRecipient,
      canStartFounderInbox: false,
      founderInboxPriority: false,
      canBlockPeer: peer !== null,
    },
  };
}

function mapAttachment(value: SdkMediaReference): MessagingAttachment {
  return {
    id: value.mediaId,
    type: value.kind,
    name: value.fileName ?? '已授权附件',
    bytes: value.bytes ?? 0,
    durationMs: null,
    thumbnailUrl: null,
    deliveryUrl: null,
    /** Messaging never manufactures media delivery URLs or readiness. */
    state: 'PENDING',
  };
}

function mapReactionSummaries(reactions: readonly SdkReaction[]): readonly MessagingReactionSummary[] {
  const grouped = new Map<string, number>();
  for (const reaction of reactions) grouped.set(reaction.type, (grouped.get(reaction.type) ?? 0) + 1);
  return [...grouped.entries()].map(([reaction, count]) => ({ reaction, count, reactedByViewer: false }));
}

function mapMessage(value: SdkMessage): MessagingMessage {
  const isDeleted = value.status === 'DELETED' || value.deletedAt !== null;
  return {
    id: value.id,
    conversationId: value.conversationId,
    clientMessageId: value.clientMessageId,
    sequence: value.sequence,
    sender: { userId: value.senderId, displayName: '会话成员', avatarLabel: null, presence: 'OFFLINE' },
    type: value.kind,
    body: isDeleted ? null : value.body,
    attachments: isDeleted ? [] : value.media.map(mapAttachment),
    replyTo: value.replyToMessageId === null ? null : {
      id: value.replyToMessageId,
      senderName: '会话成员',
      type: 'TEXT',
      body: null,
      deleted: false,
    },
    reactions: mapReactionSummaries(value.reactions),
    /** A persisted server message may be shown as sent, never as delivered/read. */
    delivery: 'SENT',
    createdAt: value.createdAt,
    editedAt: value.editedAt,
    deletedAt: isDeleted ? (value.deletedAt ?? value.updatedAt) : null,
    viewer: {
      // `isSender` is intentionally not a wire field. We only use it for the
      // delivery-label treatment; all actionable controls map directly from
      // the server-generated viewer projection below.
      isSender: value.viewer.canEdit && !isDeleted,
      canEdit: value.viewer.canEdit && !isDeleted,
      canDelete: value.viewer.canDelete && !isDeleted,
      canReact: value.viewer.canReact && !isDeleted,
      canReport: value.viewer.canReport && !isDeleted,
    },
  };
}

function mapPage<T, U>(value: SdkCursorPage<T>, project: (item: T) => U): MessagingCursorPage<U> {
  return { items: value.items.map(project), nextCursor: value.nextCursor };
}

function mapDraft(value: SdkDraft | null): MessagingDraft | null {
  if (value === null) return null;
  return { conversationId: value.conversationId, body: value.body ?? '', updatedAt: value.updatedAt };
}

function mapSearchResult(value: SdkSearchResult): MessagingSearchResult {
  return { messageId: value.messageId, conversationId: value.conversationId, sequence: value.sequence, snippet: value.snippet, createdAt: value.createdAt };
}

/**
 * Presentation adapter over the official shared MessagingSdk. Endpoint
 * selection lives only in `@me-zip/sdk`; methods below neither re-create a
 * REST map nor accept client-supplied authorization fields.
 */
export class ApiMessagingClient implements MessagingClient {
  readonly source = 'SERVER' as const;

  constructor(private readonly sdk: MessagingSdk) {}

  listConversations(input: Parameters<MessagingClient['listConversations']>[0] = {}) {
    return fromSdk(this.sdk.listConversations(input), (page) => mapPage(page, mapConversation));
  }

  getConversation(conversationId: string) {
    return fromSdk(this.sdk.getConversation(conversationId), mapConversation);
  }

  listFounderInbox(input: Parameters<MessagingClient['listFounderInbox']>[0] = {}) {
    return fromSdk(this.sdk.listFounderInbox(input), (page) => mapPage(page, mapConversation));
  }

  openFounderInbox(input: Parameters<MessagingClient['openFounderInbox']>[0]) {
    return fromSdk(this.sdk.openFounderInbox(input), mapConversation);
  }

  openDirect(input: Parameters<MessagingClient['openDirect']>[0]) {
    return fromSdk(this.sdk.openDirect(input), mapConversation);
  }
  resolveMessageRequest(input: Parameters<MessagingClient['resolveMessageRequest']>[0]) {
    return fromSdk(this.sdk.resolveMessageRequest(input), mapConversation);
  }

  openGroup(input: Parameters<MessagingClient['openGroup']>[0]) {
    return fromSdk(this.sdk.openGroup(input), mapConversation);
  }

  listMessages(input: Parameters<MessagingClient['listMessages']>[0]) {
    return fromSdk(this.sdk.listMessages(input), (page) => mapPage(page, mapMessage));
  }

  backfill(input: Parameters<MessagingClient['backfill']>[0]) {
    return fromSdk(this.sdk.backfill(input), (page) => mapPage(page, mapMessage));
  }

  sendMessage(input: Parameters<MessagingClient['sendMessage']>[0]) {
    return fromSdk(this.sdk.send(input), mapMessage);
  }

  updateMessage(input: Parameters<MessagingClient['updateMessage']>[0]) {
    return fromSdk(this.sdk.updateMessage({
      messageId: input.messageId,
      body: input.body,
      idempotencyKey: input.idempotencyKey,
    }), mapMessage);
  }

  deleteMessage(input: Parameters<MessagingClient['deleteMessage']>[0]) {
    return fromSdk(this.sdk.deleteMessage({
      messageId: input.messageId,
      idempotencyKey: input.idempotencyKey,
    }), mapMessage);
  }

  setReaction(input: Parameters<MessagingClient['setReaction']>[0]) {
    return fromSdk(this.sdk.setReaction({
      messageId: input.messageId,
      type: input.reaction,
      active: input.active,
      idempotencyKey: input.idempotencyKey,
    }), (value) => {
      if ('removed' in value) return { reaction: input.reaction, count: 0, reactedByViewer: false };
      return { reaction: value.type, count: 1, reactedByViewer: input.active };
    });
  }

  markRead(input: Parameters<MessagingClient['markRead']>[0]) {
    return fromSdk(this.sdk.markRead(input), (member) => ({ lastReadSequence: member.lastReadSequence }));
  }

  markUnread(input: Parameters<MessagingClient['markUnread']>[0]) {
    return fromSdk(this.sdk.markUnread(input), (member) => ({ unread: member.lastReadSequence < input.sequence }));
  }

  getUnreadSummary() {
    return fromSdk(this.sdk.getUnreadSummary(), (summary) => ({ unreadCount: summary.totalUnread, conversationCount: summary.conversations.length }));
  }

  getDraft(input: Parameters<MessagingClient['getDraft']>[0]) {
    return fromSdk(this.sdk.getDraft(input.conversationId), mapDraft);
  }

  saveDraft(input: Parameters<MessagingClient['saveDraft']>[0]) {
    return fromSdk(this.sdk.saveDraft(input), mapDraft);
  }

  updateSettings(input: Parameters<MessagingClient['updateSettings']>[0]) {
    return fromSdk(this.sdk.updateConversationPreferences(input), mapConversationSettings);
  }

  search(input: Parameters<MessagingClient['search']>[0]) {
    return fromSdk(this.sdk.search(input), (page) => mapPage(page, mapSearchResult));
  }

  setTyping(input: Parameters<MessagingClient['setTyping']>[0]) {
    return fromSdk(this.sdk.setTyping(input), (result) => ({ active: result.accepted && input.active, expiresAt: null }));
  }

  async getPresence(input: Parameters<MessagingClient['getPresence']>[0]): Promise<MessagingResult<readonly MessagingParticipant[]>> {
    const results = await Promise.all(input.userIds.map((userId) => fromSdk(this.sdk.getPresence(userId), (presence) => ({
      userId: presence.userId,
      displayName: '会话成员',
      avatarLabel: null,
      presence: presence.status,
    } satisfies MessagingParticipant))));
    const firstFailure = results.find((result) => !result.ok);
    if (firstFailure !== undefined && !firstFailure.ok) return firstFailure;
    return { ok: true, source: 'SERVER', data: results.flatMap((result) => result.ok ? [result.data] : []) };
  }

  setBlock(input: Parameters<MessagingClient['setBlock']>[0]) {
    return fromSdk(this.sdk.setBlock({ userId: input.userId, active: input.blocked, idempotencyKey: input.idempotencyKey }), (value) => ({ blocked: value.blocked }));
  }

  submitReport(input: Parameters<MessagingClient['submitReport']>[0]) {
    return fromSdk(this.sdk.reportMessage({
      messageId: input.messageId,
      reason: input.reason,
      ...(input.detail === undefined ? {} : { details: input.detail }),
      idempotencyKey: input.idempotencyKey,
    }), (value) => ({ reportId: value.id }));
  }
}

export interface MessagingRealtimeListener {
  onEvent(event: MessagingRealtimeEvent): void;
  onStatus(status: MessagingRealtimeStatus): void;
}

export interface MessagingRealtimeTransport {
  connect(listener: MessagingRealtimeListener): () => void;
}

/** No configured realtime endpoint; the UI keeps explicit HTTP refresh/backfill. */
export class UnavailableMessagingRealtimeTransport implements MessagingRealtimeTransport {
  connect(listener: MessagingRealtimeListener): () => void {
    listener.onStatus('UNAVAILABLE');
    return () => undefined;
  }
}

function asRealtimeEvent(value: unknown): SdkRealtimeEvent | null {
  if (!isRecord(value) || typeof value.type !== 'string' || typeof value.eventId !== 'string' || typeof value.occurredAt !== 'string') return null;
  return value as unknown as SdkRealtimeEvent;
}

function mapRealtimeEvent(value: unknown): MessagingRealtimeEvent | null {
  const event = asRealtimeEvent(value);
  if (event === null) return null;
  if (event.type === 'message.created' || event.type === 'message.updated') return { type: event.type, message: mapMessage(event.message) };
  if (event.type === 'message.deleted') return { type: event.type, conversationId: event.conversationId, messageId: event.message.id, sequence: event.sequence };
  if (event.type === 'message.reaction.updated') return {
    type: event.type,
    conversationId: event.conversationId,
    messageId: event.messageId,
    sequence: event.sequence,
    reaction: { reaction: event.reaction.type, count: event.active ? 1 : 0, reactedByViewer: event.active },
    active: event.active,
  };
  if (event.type === 'conversation.read') return { type: event.type, conversationId: event.conversationId, lastReadSequence: event.lastReadSequence };
  if (event.type === 'typing.started' || event.type === 'typing.stopped') return {
    type: event.type,
    conversationId: event.conversationId,
    participant: { userId: event.userId, displayName: '会话成员', expiresAt: event.occurredAt },
  };
  if (event.type !== 'presence.updated') return null;
  return {
    type: 'presence.updated',
    participant: { userId: event.userId, displayName: '会话成员', avatarLabel: null, presence: event.presence },
  };
}

/**
 * Optional WebSocket adapter. It carries only the existing session; no bearer
 * token, plan, user ID, or Root control is put in the URL. Unknown wire data
 * is ignored, then the UI falls back to the SDK's HTTP list/backfill methods.
 */
export class WebSocketMessagingRealtimeTransport implements MessagingRealtimeTransport {
  constructor(private readonly url: string) {}

  connect(listener: MessagingRealtimeListener): () => void {
    let socket: WebSocket | null = null;
    let stopped = false;
    let retryTimer: number | undefined;
    let attempts = 0;

    const scheduleFallback = () => {
      if (stopped) return;
      attempts += 1;
      listener.onStatus('FALLBACK');
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempts, 5));
      retryTimer = window.setTimeout(open, delay);
    };
    const open = () => {
      if (stopped) return;
      listener.onStatus(attempts === 0 ? 'CONNECTING' : 'RECONNECTING');
      try {
        socket = new WebSocket(this.url);
      } catch {
        scheduleFallback();
        return;
      }
      socket.addEventListener('open', () => { attempts = 0; listener.onStatus('CONNECTED'); });
      socket.addEventListener('message', (event) => {
        try {
          const parsed = typeof event.data === 'string' ? JSON.parse(event.data) as unknown : event.data as unknown;
          const next = mapRealtimeEvent(parsed);
          if (next !== null) listener.onEvent(next);
        } catch {
          // Do not display or act on malformed private event data.
        }
      });
      socket.addEventListener('close', () => { if (!stopped) scheduleFallback(); });
      socket.addEventListener('error', () => socket?.close());
    };

    open();
    return () => {
      stopped = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }
}

export function createRuntimeMessagingClient(baseUrl = import.meta.env.VITE_MEZIP_MESSAGING_API_BASE_URL): MessagingClient {
  const normalized = baseUrl?.trim();
  if (normalized === undefined || normalized.length === 0) return new UnavailableMessagingClient();
  return new ApiMessagingClient(createMeZipSdk(new FetchMessagingTransport({ baseUrl: normalized })).messaging);
}

export function createRuntimeMessagingRealtimeTransport(url = import.meta.env.VITE_MEZIP_MESSAGING_REALTIME_URL): MessagingRealtimeTransport {
  const normalized = url?.trim();
  if (normalized === undefined || normalized.length === 0) return new UnavailableMessagingRealtimeTransport();
  return new WebSocketMessagingRealtimeTransport(normalized);
}

export const messagingClient: MessagingClient = createRuntimeMessagingClient();
export const messagingRealtimeTransport: MessagingRealtimeTransport = createRuntimeMessagingRealtimeTransport();

/** A realtime event that jumps past the highest applied sequence needs HTTP backfill. */
export function hasMessagingSequenceGap(lastAppliedSequence: number, incomingSequence: number): boolean {
  return Number.isSafeInteger(lastAppliedSequence)
    && Number.isSafeInteger(incomingSequence)
    && lastAppliedSequence >= 0
    && incomingSequence > lastAppliedSequence + 1;
}

export function createMessagingActionKey(scope: string): string {
  const prefix = scope.replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'message';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
