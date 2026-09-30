import { randomUUID } from 'node:crypto';
import { messagingReactionTypes } from '@me-zip/shared-types';

import type {
  AdminAuthorizationService,
  AdminRequestContext,
} from '@me-zip/admin-service';
import type {
  AuthenticatedPrincipal,
  CapabilityCode,
  JsonObject,
  MessagingConversation,
  MessagingConversationMember,
  MessagingConversationSummary,
  MessagingCursorPage,
  MessagingDraft,
  MessagingMediaReference,
  MessagingMemberRole,
  MessagingMessage,
  MessagingMessageKind,
  MessagingMessageView,
  MessagingNotification,
  MessagingPresence,
  MessagingReaction,
  MessagingReactionType,
  MessagingRealtimeEvent,
  MessagingRealtimeFallback,
  MessagingRealtimeHandshake,
  MessagingRealtimeSubscription,
  MessagingRealtimeTransport,
  MessagingReport,
  MessagingReportReason,
  MessagingSearchResult,
  MessagingUnreadSummary,
  MessagingUserSettings,
} from '@me-zip/shared-types';

export type MessagingErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'IDEMPOTENCY_REPLAY'
  | 'BLOCKED'
  | 'ENTITLEMENT_REQUIRED'
  | 'RATE_LIMITED'
  | 'DUPLICATE_CONTENT'
  | 'MEDIA_NOT_AUTHORIZED';

export class MessagingError extends Error {
  public constructor(
    public readonly code: MessagingErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, string | number>> = {},
  ) {
    super(message);
    this.name = 'MessagingError';
  }
}

export class MessagingAuthorizationError extends MessagingError {
  public constructor(code: Extract<MessagingErrorCode, 'FORBIDDEN' | 'BLOCKED' | 'ENTITLEMENT_REQUIRED'> = 'FORBIDDEN') {
    super(
      code,
      code === 'BLOCKED'
        ? 'This messaging action is unavailable because one participant blocked the other.'
        : code === 'ENTITLEMENT_REQUIRED'
          ? 'This messaging action requires an active entitlement.'
          : 'This messaging resource is not available to this principal.',
    );
    this.name = 'MessagingAuthorizationError';
  }
}

export interface MessagingRuntime {
  readonly now: () => string;
  readonly id: () => string;
}

const runtimeDefaults: MessagingRuntime = { now: () => new Date().toISOString(), id: randomUUID };
const clone = <T>(value: T): T => structuredClone(value);
const key = (...parts: readonly string[]): string => parts.join(':');
const directKey = (left: string, right: string): string => [left, right].sort().join(':');

export interface MessagingEntitlementResolver {
  has(principal: AuthenticatedPrincipal, capability: CapabilityCode): boolean;
  /** Server-side lookup for ordering decisions. It never reaches a client DTO. */
  hasUser(userId: string, capability: CapabilityCode): boolean;
}

export class InMemoryMessagingEntitlements implements MessagingEntitlementResolver {
  private readonly values = new Map<string, ReadonlySet<CapabilityCode>>();
  public set(userId: string, capabilities: readonly CapabilityCode[]): void { this.values.set(userId, new Set(capabilities)); }
  /** `FOUNDER_DM` is only a resolver-side legacy alias. Callers always ask
   * for the canonical FOUNDER_INBOX_ACCESS capability. */
  public has(principal: AuthenticatedPrincipal, capability: CapabilityCode): boolean {
    return this.hasUser(principal.userId, capability);
  }
  public hasUser(userId: string, capability: CapabilityCode): boolean {
    const values = this.values.get(userId);
    if (capability === 'FOUNDER_INBOX_ACCESS') {
      return values?.has('FOUNDER_INBOX_ACCESS') === true || values?.has('FOUNDER_DM') === true;
    }
    return values?.has(capability) ?? false;
  }
}

export interface MessagingGroupMember {
  readonly userId: string;
  readonly role: Extract<MessagingMemberRole, 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER'>;
}

/** Explicit Community seam; consumer JSON never supplies group members or roles. */
export interface MessagingGroupProvider {
  getActiveMember(principal: AuthenticatedPrincipal, groupId: string): MessagingGroupMember | null;
  listActiveMembers(groupId: string): readonly MessagingGroupMember[];
  getDisplayName(groupId: string): string | null;
}

export class InMemoryMessagingGroupProvider implements MessagingGroupProvider {
  private readonly groups = new Map<string, { name: string; members: readonly MessagingGroupMember[] }>();
  public set(groupId: string, name: string, members: readonly MessagingGroupMember[]): void { this.groups.set(groupId, { name, members: clone(members) }); }
  public getActiveMember(principal: AuthenticatedPrincipal, groupId: string): MessagingGroupMember | null { return clone(this.groups.get(groupId)?.members.find((row) => row.userId === principal.userId) ?? null); }
  public listActiveMembers(groupId: string): readonly MessagingGroupMember[] { return clone(this.groups.get(groupId)?.members ?? []); }
  public getDisplayName(groupId: string): string | null { return this.groups.get(groupId)?.name ?? null; }
}

/** Explicit cross-domain block seam. Default fake is only for test/development. */
export interface MessagingBlockProvider {
  isBlocked(leftUserId: string, rightUserId: string): boolean;
  setBlocked(actorUserId: string, targetUserId: string, active: boolean): void;
}

export class InMemoryMessagingBlockProvider implements MessagingBlockProvider {
  private readonly blocked = new Set<string>();
  public isBlocked(leftUserId: string, rightUserId: string): boolean { return this.blocked.has(key(leftUserId, rightUserId)) || this.blocked.has(key(rightUserId, leftUserId)); }
  public setBlocked(actorUserId: string, targetUserId: string, active: boolean): void { const value = key(actorUserId, targetUserId); if (active) this.blocked.add(value); else this.blocked.delete(value); }
}

/** Opaque media IDs must be authorized by Media before a message can store them. */
export interface MessagingMediaAuthorizer {
  resolve(principal: AuthenticatedPrincipal, mediaIds: readonly string[]): readonly MessagingMediaReference[];
}

export class InMemoryMessagingMediaAuthorizer implements MessagingMediaAuthorizer {
  private readonly media = new Map<string, { value: MessagingMediaReference; allowed: ReadonlySet<string> }>();
  public allow(value: MessagingMediaReference, userIds: readonly string[]): void { this.media.set(value.mediaId, { value: clone(value), allowed: new Set(userIds) }); }
  public resolve(principal: AuthenticatedPrincipal, mediaIds: readonly string[]): readonly MessagingMediaReference[] {
    return mediaIds.map((mediaId) => {
      const record = this.media.get(mediaId);
      if (record === undefined || !record.allowed.has(principal.userId)) throw new MessagingError('MEDIA_NOT_AUTHORIZED', 'Media reference is not authorized.');
      return clone(record.value);
    });
  }
}

export interface MessagingProfileDirectory { get(userId: string): { readonly displayName: string; readonly avatarMediaId: string | null } | null; }
export interface MessagingFounderDirectory { getFounderUserId(): string | null; isFounder(principal: AuthenticatedPrincipal): boolean; }

export class InMemoryMessagingFounderDirectory implements MessagingFounderDirectory {
  private founderUserId: string | null = null;
  public setFounderUserId(userId: string | null): void { this.founderUserId = userId; }
  public getFounderUserId(): string | null { return this.founderUserId; }
  public isFounder(principal: AuthenticatedPrincipal): boolean { return principal.userId === this.founderUserId; }
}

export interface MessagingRealtimePublisher { publish(recipientUserIds: readonly string[], event: MessagingRealtimeEvent): void; }
/** Notification delivery is an explicit body-free task seam. Providers receive
 * identifiers and summary codes only, never private message text or media. */
export interface MessagingNotificationTaskPublisher { enqueue(task: MessagingNotification): void; }
export class InMemoryMessagingNotificationTaskPublisher implements MessagingNotificationTaskPublisher {
  private readonly tasks: MessagingNotification[] = [];
  public enqueue(task: MessagingNotification): void { this.tasks.push(clone(task)); }
  public list(): readonly MessagingNotification[] { return this.tasks.map(clone); }
}

/** Fake provider: production WS/SSE bridges implement the same typed transport. */
export class InMemoryMessagingRealtimeHub implements MessagingRealtimePublisher {
  private readonly listeners = new Map<string, { userId: string; conversationIds: ReadonlySet<string> | null; onEvent: (event: MessagingRealtimeEvent) => void }>();
  public transportFor(principal: AuthenticatedPrincipal): MessagingRealtimeTransport {
    return { subscribe: async (input) => {
      const id = randomUUID();
      this.listeners.set(id, { userId: principal.userId, conversationIds: input.conversationIds === undefined ? null : new Set(input.conversationIds), onEvent: input.onEvent });
      input.onStatus?.('CONNECTED');
      return { close: () => { this.listeners.delete(id); } } satisfies MessagingRealtimeSubscription;
    } };
  }
  public publish(recipientUserIds: readonly string[], event: MessagingRealtimeEvent): void {
    for (const listener of this.listeners.values()) {
      if (recipientUserIds.includes(listener.userId) && (listener.conversationIds === null || (event.conversationId !== null && listener.conversationIds.has(event.conversationId)))) listener.onEvent(clone(event));
    }
  }
}

export interface MessagingPersistenceSnapshot {
  /** `founderInbox` is accepted only to hydrate a short-lived pre-marker
   * in-memory snapshot. Durable adapters write `isFounderInbox`. */
  readonly conversations: readonly (Omit<MessagingConversation, 'isFounderInbox'> & {
    readonly directKey: string | null;
    readonly isFounderInbox?: boolean;
    readonly founderInbox?: boolean;
  })[];
  readonly members: readonly MessagingConversationMember[];
  readonly messages: readonly MessagingMessage[];
  readonly drafts: readonly MessagingDraft[];
  readonly settings: readonly MessagingUserSettings[];
  readonly reports: readonly MessagingReport[];
  readonly notifications: readonly MessagingNotification[];
  readonly presence: readonly MessagingPresence[];
  readonly idempotency: readonly { readonly key: string; readonly fingerprint: string; readonly result: unknown }[];
  readonly clientMessageIds: readonly { readonly key: string; readonly fingerprint: string; readonly messageId: string }[];
}

/** Production persistence writes this snapshot inside a DB transaction; 006 owns durable schema/RLS. */
export interface MessagingPersistence { read(): MessagingPersistenceSnapshot | null; write(snapshot: MessagingPersistenceSnapshot): void; }
export class InMemoryMessagingPersistence implements MessagingPersistence {
  private snapshot: MessagingPersistenceSnapshot | null = null;
  public read(): MessagingPersistenceSnapshot | null { return this.snapshot === null ? null : clone(this.snapshot); }
  public write(snapshot: MessagingPersistenceSnapshot): void { this.snapshot = clone(snapshot); }
}

type ConversationRecord = MessagingConversation & { readonly directKey: string | null; readonly isFounderInbox: boolean; readonly requestState: NonNullable<MessagingConversation['requestState']>; readonly requestRecipientUserId: string | null };
interface State {
  conversations: Map<string, ConversationRecord>;
  members: Map<string, MessagingConversationMember>;
  messages: Map<string, MessagingMessage>;
  drafts: Map<string, MessagingDraft>;
  settings: Map<string, MessagingUserSettings>;
  reports: Map<string, MessagingReport>;
  notifications: Map<string, MessagingNotification>;
  presence: Map<string, MessagingPresence>;
  idempotency: Map<string, { fingerprint: string; result: unknown }>;
  clientMessageIds: Map<string, { fingerprint: string; messageId: string }>;
}
const emptyState = (): State => ({ conversations: new Map(), members: new Map(), messages: new Map(), drafts: new Map(), settings: new Map(), reports: new Map(), notifications: new Map(), presence: new Map(), idempotency: new Map(), clientMessageIds: new Map() });
/** Not exported: only AdminMessagingApiAdapter can obtain this reader. */
const adminPrivateReaders = new WeakMap<MessagingService, (targetUserId: string) => readonly JsonObject[]>();

export interface MessagingPageOptions { readonly cursor?: string | undefined; readonly limit?: number | undefined; }
export interface MessagingSendInput { readonly clientMessageId: string; readonly body?: string | null | undefined; readonly mediaIds?: readonly string[] | undefined; readonly replyToMessageId?: string | null | undefined; readonly idempotencyKey?: string | undefined; }
export interface MessagingPatchInput { readonly body?: string | null | undefined; readonly mediaIds?: readonly string[] | undefined; readonly idempotencyKey?: string | undefined; }
export interface MessagingDraftInput { readonly body?: string | null | undefined; readonly mediaIds?: readonly string[] | undefined; readonly replyToMessageId?: string | null | undefined; readonly idempotencyKey?: string | undefined; }
export interface MessagingPreferencesInput { readonly mutedUntil?: string | null | undefined; readonly pinned?: boolean | undefined; readonly archived?: boolean | undefined; readonly idempotencyKey?: string | undefined; }
export interface MessagingSettingsInput { readonly directMessagePolicy?: 'EVERYONE' | 'NOBODY' | undefined; readonly readReceiptsEnabled?: boolean | undefined; readonly notificationLevel?: 'ALL' | 'MENTIONS' | 'NONE' | undefined; readonly idempotencyKey?: string | undefined; }
export interface MessagingServiceOptions {
  readonly persistence?: MessagingPersistence;
  readonly runtime?: Partial<MessagingRuntime>;
  readonly groupProvider?: MessagingGroupProvider;
  readonly blockProvider?: MessagingBlockProvider;
  readonly mediaAuthorizer?: MessagingMediaAuthorizer;
  readonly entitlementResolver?: MessagingEntitlementResolver;
  readonly profileDirectory?: MessagingProfileDirectory;
  readonly founderDirectory?: MessagingFounderDirectory;
  readonly realtimePublisher?: MessagingRealtimePublisher;
  readonly notificationTaskPublisher?: MessagingNotificationTaskPublisher;
}

export class MessagingService {
  private readonly state: State;
  private readonly runtime: MessagingRuntime;
  private readonly persistence: MessagingPersistence | undefined;
  private readonly groups: MessagingGroupProvider | undefined;
  private readonly blocks: MessagingBlockProvider;
  private readonly media: MessagingMediaAuthorizer | undefined;
  private readonly entitlements: MessagingEntitlementResolver;
  private readonly profiles: MessagingProfileDirectory | undefined;
  private readonly founders: MessagingFounderDirectory | undefined;
  private readonly realtime: MessagingRealtimePublisher | undefined;
  private readonly notificationTasks: MessagingNotificationTaskPublisher | undefined;
  private readonly sendHits = new Map<string, number[]>();
  private readonly conversationOpenHits = new Map<string, number[]>();
  private readonly recentContent = new Map<string, number>();
  private readonly typingExpires = new Map<string, number>();
  private readonly typingLastSent = new Map<string, number>();

  public constructor(options: MessagingServiceOptions = {}) {
    this.runtime = { now: options.runtime?.now ?? runtimeDefaults.now, id: options.runtime?.id ?? runtimeDefaults.id };
    this.persistence = options.persistence;
    this.groups = options.groupProvider;
    this.blocks = options.blockProvider ?? new InMemoryMessagingBlockProvider();
    this.media = options.mediaAuthorizer;
    this.entitlements = options.entitlementResolver ?? new InMemoryMessagingEntitlements();
    this.profiles = options.profileDirectory;
    this.founders = options.founderDirectory;
    this.realtime = options.realtimePublisher;
    this.notificationTasks = options.notificationTaskPublisher;
    this.state = this.hydrate(options.persistence?.read() ?? null);
    adminPrivateReaders.set(this, (targetUserId) => this.readPrivateMessagesForAdmin(targetUserId));
  }

  private hydrate(snapshot: MessagingPersistenceSnapshot | null): State {
    const state = emptyState(); if (snapshot === null) return state;
    snapshot.conversations.forEach((row) => state.conversations.set(row.id, {
      ...clone(row),
      isFounderInbox: row.isFounderInbox ?? row.founderInbox ?? false,
      requestState: row.requestState ?? 'NONE',
      requestRecipientUserId: row.requestRecipientUserId ?? null,
    }));
    snapshot.members.forEach((row) => state.members.set(key(row.conversationId, row.userId), clone(row)));
    snapshot.messages.forEach((row) => state.messages.set(row.id, clone(row)));
    snapshot.drafts.forEach((row) => state.drafts.set(key(row.conversationId, row.userId), clone(row)));
    snapshot.settings.forEach((row) => state.settings.set(row.userId, clone(row)));
    snapshot.reports.forEach((row) => state.reports.set(row.id, clone(row)));
    snapshot.notifications.forEach((row) => state.notifications.set(row.id, clone(row)));
    (snapshot.presence ?? []).forEach((row) => state.presence.set(row.userId, clone(row)));
    snapshot.idempotency.forEach((row) => state.idempotency.set(row.key, { fingerprint: row.fingerprint, result: clone(row.result) }));
    snapshot.clientMessageIds.forEach((row) => state.clientMessageIds.set(row.key, { fingerprint: row.fingerprint, messageId: row.messageId }));
    return state;
  }
  /** Raw transcript serialization is an ECMAScript-private server persistence
   * seam. It is intentionally absent from the public MessagingService API. */
  #snapshotForPersistence(): MessagingPersistenceSnapshot { return { conversations: [...this.state.conversations.values()].map(clone), members: [...this.state.members.values()].map(clone), messages: [...this.state.messages.values()].map(clone), drafts: [...this.state.drafts.values()].map(clone), settings: [...this.state.settings.values()].map(clone), reports: [...this.state.reports.values()].map(clone), notifications: [...this.state.notifications.values()].map(clone), presence: [...this.state.presence.values()].map(clone), idempotency: [...this.state.idempotency.entries()].map(([k, v]) => ({ key: k, fingerprint: v.fingerprint, result: clone(v.result) })), clientMessageIds: [...this.state.clientMessageIds.entries()].map(([k, v]) => ({ key: k, fingerprint: v.fingerprint, messageId: v.messageId })) }; }
  private persist(): void { this.persistence?.write(this.#snapshotForPersistence()); }
  private write<T>(operation: () => T): T { const value = operation(); this.persist(); return clone(value); }
  private idempotent<T>(principal: AuthenticatedPrincipal, operation: string, idempotencyKey: string | undefined, input: unknown, action: () => T): T {
    if (idempotencyKey === undefined || idempotencyKey.trim() === '') return this.write(action);
    const receiptKey = key(principal.userId, operation, idempotencyKey), hash = JSON.stringify(input) ?? '';
    const prior = this.state.idempotency.get(receiptKey);
    if (prior !== undefined) { if (prior.fingerprint !== hash) throw new MessagingError('IDEMPOTENCY_REPLAY', 'Idempotency key was reused with different input.'); return clone(prior.result as T); }
    const value = action(); this.state.idempotency.set(receiptKey, { fingerprint: hash, result: clone(value) }); this.persist(); return clone(value);
  }
  private requireConversation(id: string): ConversationRecord { const value = this.state.conversations.get(id); if (value === undefined || value.status !== 'ACTIVE') throw new MessagingError('NOT_FOUND', 'Conversation was not found.'); return value; }
  /** Community is the source of truth for group membership. Synchronizing here
   * prevents stale fan-out after removal and activates users added after the
   * conversation was originally created. */
  private syncGroupMembers(conversation: ConversationRecord): readonly MessagingConversationMember[] {
    if (conversation.kind !== 'GROUP') return [...this.state.members.values()].filter((member) => member.conversationId === conversation.id && member.status === 'ACTIVE');
    if (conversation.groupId === null || this.groups === undefined) return [];
    const roster = this.groups.listActiveMembers(conversation.groupId);
    const activeByUserId = new Map(roster.map((member) => [member.userId, member]));
    const now = this.runtime.now();
    for (const stored of [...this.state.members.values()].filter((member) => member.conversationId === conversation.id && member.status === 'ACTIVE')) {
      if (!activeByUserId.has(stored.userId)) this.state.members.set(key(conversation.id, stored.userId), { ...stored, status: 'LEFT', leftAt: now, updatedAt: now });
    }
    for (const current of roster) {
      const stored = this.state.members.get(key(conversation.id, current.userId));
      this.state.members.set(key(conversation.id, current.userId), stored === undefined
        ? { conversationId: conversation.id, userId: current.userId, role: current.role, status: 'ACTIVE', joinedAt: now, leftAt: null, lastReadSequence: 0, mutedUntil: null, pinnedAt: null, archivedAt: null, updatedAt: now }
        : { ...stored, role: current.role, status: 'ACTIVE', leftAt: null, updatedAt: now });
    }
    return roster.map((current) => this.state.members.get(key(conversation.id, current.userId))!).filter((member) => member.status === 'ACTIVE');
  }
  private getMember(conversationId: string, userId: string): MessagingConversationMember {
    const conversation = this.state.conversations.get(conversationId);
    if (conversation?.kind === 'GROUP') this.syncGroupMembers(conversation);
    const value = this.state.members.get(key(conversationId, userId));
    if (value === undefined || value.status !== 'ACTIVE') throw new MessagingAuthorizationError();
    return value;
  }
  private requiresFounderInboxAccess(principal: AuthenticatedPrincipal, conversation: ConversationRecord): boolean {
    const founderId = this.founders?.getFounderUserId();
    return conversation.kind === 'DIRECT' && founderId !== null && founderId !== undefined && principal.userId !== founderId && this.members(conversation.id).some((member) => member.userId === founderId);
  }
  private assertFounderInboxAccess(principal: AuthenticatedPrincipal, conversation: ConversationRecord): void {
    if (this.requiresFounderInboxAccess(principal, conversation) && !this.entitlements.has(principal, 'FOUNDER_INBOX_ACCESS')) throw new MessagingAuthorizationError('ENTITLEMENT_REQUIRED');
  }
  private access(principal: AuthenticatedPrincipal, conversationId: string): { conversation: ConversationRecord; member: MessagingConversationMember } {
    const conversation = this.requireConversation(conversationId), member = this.getMember(conversationId, principal.userId);
    if (conversation.requestState === 'REJECTED' || conversation.requestState === 'BLOCKED') throw new MessagingAuthorizationError();
    if (conversation.requestState === 'PENDING' && conversation.requestRecipientUserId === principal.userId) throw new MessagingAuthorizationError();
    if (conversation.kind === 'GROUP') { if (conversation.groupId === null || this.groups?.getActiveMember(principal, conversation.groupId) === null || this.groups === undefined) throw new MessagingAuthorizationError(); }
    this.assertFounderInboxAccess(principal, conversation);
    return { conversation, member };
  }
  /** Group conversation membership is never a durable local snapshot. Every
   * fan-out rechecks Community's current active-membership source. */
  private members(conversationId: string): readonly MessagingConversationMember[] {
    const conversation = this.state.conversations.get(conversationId);
    const stored = [...this.state.members.values()].filter((row) => row.conversationId === conversationId && row.status === 'ACTIVE');
    if (conversation?.kind !== 'GROUP') return stored;
    return this.syncGroupMembers(conversation);
  }
  private setting(userId: string): MessagingUserSettings { return this.state.settings.get(userId) ?? { userId, directMessagePolicy: 'EVERYONE', readReceiptsEnabled: true, notificationLevel: 'ALL', updatedAt: this.runtime.now() }; }
  private nowMs(): number { const value = Date.parse(this.runtime.now()); return Number.isFinite(value) ? value : Date.now(); }
  private enforceSendRate(principal: AuthenticatedPrincipal, conversationId: string, body: string | null, media: readonly MessagingMediaReference[]): void {
    const now = this.nowMs(), hitKey = principal.userId, active = (this.sendHits.get(hitKey) ?? []).filter((time) => now - time < 60_000);
    if (active.length >= 30) throw new MessagingError('RATE_LIMITED', 'Message sending is temporarily limited.');
    active.push(now); this.sendHits.set(hitKey, active);
    const normalized = `${body ?? ''}:${media.map((item) => item.mediaId).join(',')}`.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
    if (normalized !== '') { const contentKey = key(principal.userId, conversationId, normalized), previous = this.recentContent.get(contentKey); if (previous !== undefined && now - previous < 10_000) throw new MessagingError('DUPLICATE_CONTENT', 'An identical message was sent too recently.'); this.recentContent.set(contentKey, now); }
  }
  /** Limits only newly-created threads; reopening an existing DM/group stays cheap. */
  private enforceConversationOpenRate(principal: AuthenticatedPrincipal): void {
    const now = this.nowMs(), active = (this.conversationOpenHits.get(principal.userId) ?? []).filter((time) => now - time < 60 * 60_000);
    if (active.length >= 10) throw new MessagingError('RATE_LIMITED', 'Conversation creation is temporarily limited.');
    active.push(now); this.conversationOpenHits.set(principal.userId, active);
  }
  private page<T>(items: readonly T[], options: MessagingPageOptions, cursor: (item: T) => string): MessagingCursorPage<T> { const size = options.limit ?? 30; if (!Number.isInteger(size) || size < 1 || size > 100) throw new MessagingError('VALIDATION', 'limit must be 1 to 100.'); const start = options.cursor === undefined ? 0 : items.findIndex((item) => cursor(item) === options.cursor) + 1; if (options.cursor !== undefined && start === 0) throw new MessagingError('VALIDATION', 'cursor is invalid.'); const slice = items.slice(start, start + size); return { items: clone(slice), nextCursor: start + size < items.length ? cursor(slice[slice.length - 1]!) : null, hasMore: start + size < items.length }; }
  private display(principal: AuthenticatedPrincipal, conversation: ConversationRecord): MessagingConversationSummary['display'] { if (conversation.kind === 'GROUP') return { title: conversation.groupId === null ? '群组会话' : this.groups?.getDisplayName(conversation.groupId) ?? '群组会话', avatarMediaId: null, peerUserId: null, isFounderInbox: false }; const peer = this.members(conversation.id).find((row) => row.userId !== principal.userId)?.userId ?? null, profile = peer === null ? null : this.profiles?.get(peer) ?? null; return { title: profile?.displayName ?? '私密会话', avatarMediaId: profile?.avatarMediaId ?? null, peerUserId: peer, isFounderInbox: conversation.isFounderInbox }; }
  private summary(principal: AuthenticatedPrincipal, conversation: ConversationRecord): MessagingConversationSummary { const viewer = this.getMember(conversation.id, principal.userId), last = conversation.lastMessageId === null ? null : this.state.messages.get(conversation.lastMessageId) ?? null; const unread = [...this.state.messages.values()].filter((message) => message.conversationId === conversation.id && message.senderId !== principal.userId && message.status === 'ACTIVE' && message.sequence > viewer.lastReadSequence).length; return { ...clone(conversation), memberCount: this.members(conversation.id).length, viewer: clone(viewer), display: this.display(principal, conversation), lastMessage: last === null ? null : { id: last.id, senderId: last.senderId, sequence: last.sequence, kind: last.kind, bodyPreview: last.deletedAt === null ? last.body?.slice(0, 140) ?? null : null, createdAt: last.createdAt, deletedAt: last.deletedAt }, unreadCount: unread }; }
  private messageView(principal: AuthenticatedPrincipal, message: MessagingMessage): MessagingMessageView { return this.messageViewForUser(principal.userId, message); }
  private messageViewForUser(userId: string, message: MessagingMessage): MessagingMessageView {
    const member = this.getMember(message.conversationId, userId);
    const active = message.status === 'ACTIVE';
    return {
      ...clone(message),
      viewer: {
        canEdit: active && message.senderId === userId,
        canDelete: active && (message.senderId === userId || ['OWNER', 'ADMIN', 'MODERATOR'].includes(member.role)),
        canReact: active,
        canReport: active && message.senderId !== userId,
      },
    };
  }
  private emit(type: Extract<MessagingRealtimeEvent['type'], 'message.created' | 'message.updated' | 'message.deleted'>, message: MessagingMessage): void {
    for (const member of this.members(message.conversationId)) {
      this.realtime?.publish([member.userId], { eventId: this.runtime.id(), type, occurredAt: this.runtime.now(), conversationId: message.conversationId, sequence: message.sequence, message: this.messageViewForUser(member.userId, message) });
    }
  }
  private enqueueMessageNotifications(message: MessagingMessage): void {
    const reply = message.replyToMessageId === null ? null : this.state.messages.get(message.replyToMessageId) ?? null;
    for (const member of this.members(message.conversationId)) {
      if (member.userId === message.senderId || this.setting(member.userId).notificationLevel === 'NONE') continue;
      const notification: MessagingNotification = {
        id: this.runtime.id(),
        recipientUserId: member.userId,
        actorUserId: message.senderId,
        type: reply?.senderId === member.userId ? 'REPLY' : 'MESSAGE',
        conversationId: message.conversationId,
        messageId: message.id,
        summaryCode: reply?.senderId === member.userId ? 'MESSAGING_REPLY_RECEIVED' : 'MESSAGING_MESSAGE_RECEIVED',
        status: 'UNREAD',
        createdAt: this.runtime.now(),
        readAt: null,
      };
      this.state.notifications.set(notification.id, notification);
      this.notificationTasks?.enqueue(clone(notification));
    }
  }
  private enqueueMessageRequestNotification(
    conversation: ConversationRecord,
    actorUserId: string,
  ): void {
    const recipientUserId = conversation.requestRecipientUserId;
    if (recipientUserId === null || this.setting(recipientUserId).notificationLevel === 'NONE') {
      return;
    }
    const notification: MessagingNotification = {
      id: this.runtime.id(),
      recipientUserId,
      actorUserId,
      type: 'MESSAGE_REQUEST',
      conversationId: conversation.id,
      messageId: null,
      summaryCode: 'MESSAGING_REQUEST_RECEIVED',
      status: 'UNREAD',
      createdAt: this.runtime.now(),
      readAt: null,
    };
    this.state.notifications.set(notification.id, notification);
    this.notificationTasks?.enqueue(clone(notification));
  }
  private assertReply(conversationId: string, replyToMessageId: string | null | undefined): void { if (replyToMessageId !== null && replyToMessageId !== undefined && this.state.messages.get(replyToMessageId)?.conversationId !== conversationId) throw new MessagingError('VALIDATION', 'Reply target must be in the same conversation.'); }
  private resolveMedia(principal: AuthenticatedPrincipal, ids: readonly string[] | undefined): readonly MessagingMediaReference[] { const value = ids ?? []; if (value.length > 12 || new Set(value).size !== value.length) throw new MessagingError('VALIDATION', 'mediaIds must be unique and contain at most 12 items.'); if (value.length > 0 && this.media === undefined) throw new MessagingError('MEDIA_NOT_AUTHORIZED', 'Media provider is not configured.'); return clone(this.media?.resolve(principal, value) ?? []); }
  private kind(body: string | null, media: readonly MessagingMediaReference[]): MessagingMessageKind { const kinds = new Set(media.map((item) => item.kind)); if (kinds.size > 1) throw new MessagingError('VALIDATION', 'Mixed media message kinds are not supported.'); if (media.length > 0) return media[0]!.kind; if (body !== null) return 'TEXT'; throw new MessagingError('VALIDATION', 'Message content is required.'); }

  public openDirect(principal: AuthenticatedPrincipal, recipientUserId: string, idempotencyKey?: string): MessagingConversationSummary {
    if (recipientUserId === principal.userId || recipientUserId.trim() === '') throw new MessagingError('VALIDATION', 'recipientUserId must identify another user.');
    if (recipientUserId === this.founders?.getFounderUserId()) {
      if (!this.entitlements.has(principal, 'FOUNDER_INBOX_ACCESS')) throw new MessagingAuthorizationError('ENTITLEMENT_REQUIRED');
      throw new MessagingAuthorizationError();
    }
    const prior = [...this.state.conversations.values()].find(
      (row) => row.directKey === directKey(principal.userId, recipientUserId) && row.status === 'ACTIVE',
    );
    if (prior?.requestState === 'REJECTED' || prior?.requestState === 'BLOCKED') {
      throw new MessagingAuthorizationError();
    }
    return this.openDirectInternal(principal, recipientUserId, idempotencyKey, false);
  }
  /** Explicit request route for a stranger/non-mutual flow. It reuses the
   * canonical 1:1 conversation and never creates a second thread. */
  public createMessageRequest(principal: AuthenticatedPrincipal, recipientUserId: string, idempotencyKey?: string): MessagingConversationSummary {
    const prior = [...this.state.conversations.values()].find((row) => row.directKey === directKey(principal.userId, recipientUserId) && row.status === 'ACTIVE');
    if (prior !== undefined) {
      if (prior.requestState === 'REJECTED' || prior.requestState === 'BLOCKED') throw new MessagingAuthorizationError();
      return this.summary(principal, prior);
    }
    const conversation = this.openDirectInternal(principal, recipientUserId, idempotencyKey, false);
    const stored = this.requireConversation(conversation.id);
    const requested = { ...stored, requestState: 'PENDING' as const, requestRecipientUserId: recipientUserId, updatedAt: this.runtime.now() };
    this.state.conversations.set(stored.id, requested);
    this.enqueueMessageRequestNotification(requested, principal.userId);
    this.persist();
    return this.summary(principal, requested);
  }
  private openDirectInternal(principal: AuthenticatedPrincipal, recipientUserId: string, idempotencyKey: string | undefined, isFounderInbox: boolean): MessagingConversationSummary {
    return this.idempotent(principal, isFounderInbox ? 'conversation.founder' : 'conversation.direct', idempotencyKey, { recipientUserId, isFounderInbox }, () => { if (this.blocks.isBlocked(principal.userId, recipientUserId) || this.setting(recipientUserId).directMessagePolicy === 'NOBODY') throw new MessagingAuthorizationError(this.blocks.isBlocked(principal.userId, recipientUserId) ? 'BLOCKED' : 'FORBIDDEN'); const pair = directKey(principal.userId, recipientUserId), existing = [...this.state.conversations.values()].find((row) => row.directKey === pair && row.status === 'ACTIVE'); if (existing !== undefined) { if (isFounderInbox && !existing.isFounderInbox) this.state.conversations.set(existing.id, { ...existing, isFounderInbox: true, requestState: 'ACCEPTED', requestRecipientUserId: null, updatedAt: this.runtime.now() }); return this.summary(principal, this.requireConversation(existing.id)); } this.enforceConversationOpenRate(principal); const now = this.runtime.now(), conversation: ConversationRecord = { id: this.runtime.id(), kind: 'DIRECT', groupId: null, isFounderInbox, requestState: 'ACCEPTED', requestRecipientUserId: null, createdByUserId: principal.userId, status: 'ACTIVE', lastSequence: 0, lastMessageId: null, lastMessageAt: null, createdAt: now, updatedAt: now, archivedAt: null, directKey: pair }; this.state.conversations.set(conversation.id, conversation); for (const userId of [principal.userId, recipientUserId]) this.state.members.set(key(conversation.id, userId), { conversationId: conversation.id, userId, role: 'MEMBER', status: 'ACTIVE', joinedAt: now, leftAt: null, lastReadSequence: 0, mutedUntil: null, pinnedAt: null, archivedAt: null, updatedAt: now }); return this.summary(principal, conversation); });
  }
  public openGroup(principal: AuthenticatedPrincipal, groupId: string, idempotencyKey?: string): MessagingConversationSummary { return this.idempotent(principal, 'conversation.group', idempotencyKey, { groupId }, () => { const self = this.groups?.getActiveMember(principal, groupId); if (self === null || self === undefined || !['OWNER', 'ADMIN', 'MODERATOR'].includes(self.role)) throw new MessagingAuthorizationError(); const existing = [...this.state.conversations.values()].find((row) => row.kind === 'GROUP' && row.groupId === groupId && row.status === 'ACTIVE'); if (existing !== undefined) return this.summary(principal, existing); this.enforceConversationOpenRate(principal); const users = this.groups?.listActiveMembers(groupId) ?? []; if (users.length === 0) throw new MessagingAuthorizationError(); const now = this.runtime.now(), conversation: ConversationRecord = { id: this.runtime.id(), kind: 'GROUP', groupId, isFounderInbox: false, requestState: 'NONE', requestRecipientUserId: null, createdByUserId: principal.userId, status: 'ACTIVE', lastSequence: 0, lastMessageId: null, lastMessageAt: null, createdAt: now, updatedAt: now, archivedAt: null, directKey: null }; this.state.conversations.set(conversation.id, conversation); users.forEach((user) => this.state.members.set(key(conversation.id, user.userId), { conversationId: conversation.id, userId: user.userId, role: user.role, status: 'ACTIVE', joinedAt: now, leftAt: null, lastReadSequence: 0, mutedUntil: null, pinnedAt: null, archivedAt: null, updatedAt: now })); return this.summary(principal, conversation); }); }
  public openFounderInbox(principal: AuthenticatedPrincipal, idempotencyKey?: string): MessagingConversationSummary { if (!this.entitlements.has(principal, 'FOUNDER_INBOX_ACCESS')) throw new MessagingAuthorizationError('ENTITLEMENT_REQUIRED'); const founderId = this.founders?.getFounderUserId(); if (founderId === null || founderId === undefined || founderId === principal.userId) throw new MessagingError('NOT_FOUND', 'Founder Inbox is not configured.'); return this.openDirectInternal(principal, founderId, idempotencyKey, true); }
  /** Only the request recipient may accept/reject. A rejected request stays
   * inaccessible so a sender cannot turn rejection into a fresh DM thread. */
  public resolveMessageRequest(principal: AuthenticatedPrincipal, conversationId: string, action: 'ACCEPT' | 'REJECT', idempotencyKey?: string): MessagingConversationSummary {
    return this.idempotent(principal, 'conversation.request.resolve', idempotencyKey, { conversationId, action }, () => {
      const conversation = this.requireConversation(conversationId);
      this.getMember(conversationId, principal.userId);
      if (conversation.kind !== 'DIRECT' || conversation.requestState !== 'PENDING' || conversation.requestRecipientUserId !== principal.userId) throw new MessagingAuthorizationError();
      const next = { ...conversation, requestState: action === 'ACCEPT' ? 'ACCEPTED' as const : 'REJECTED' as const, updatedAt: this.runtime.now() };
      this.state.conversations.set(conversationId, next);
      return this.summary(principal, next);
    });
  }
  public listConversations(principal: AuthenticatedPrincipal, options: MessagingPageOptions & { includeArchived?: boolean } = {}): MessagingCursorPage<MessagingConversationSummary> { const rows = [...this.state.conversations.values()].filter((conversation) => { if (conversation.kind === 'GROUP') this.syncGroupMembers(conversation); const member = this.state.members.get(key(conversation.id, principal.userId)); return member?.status === 'ACTIVE' && (options.includeArchived === true || member.archivedAt === null) && (conversation.kind !== 'GROUP' || (conversation.groupId !== null && this.groups?.getActiveMember(principal, conversation.groupId) !== null)) && (!this.requiresFounderInboxAccess(principal, conversation) || this.entitlements.has(principal, 'FOUNDER_INBOX_ACCESS')); }).map((row) => this.summary(principal, row)).sort((a, b) => Number(b.viewer.pinnedAt !== null) - Number(a.viewer.pinnedAt !== null) || b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)); return this.page(rows, options, (row) => `${row.updatedAt}:${row.id}`); }
  public listFounderInbox(principal: AuthenticatedPrincipal, options: MessagingPageOptions = {}): MessagingCursorPage<MessagingConversationSummary> {
    if (!this.founders?.isFounder(principal)) throw new MessagingAuthorizationError();
    const rows = [...this.state.conversations.values()]
      .filter((conversation) => conversation.kind === 'DIRECT' && conversation.isFounderInbox && this.state.members.get(key(conversation.id, principal.userId))?.status === 'ACTIVE')
      .map((conversation) => this.summary(principal, conversation))
      .sort((left, right) => {
        const leftPriority = left.display.peerUserId !== null && this.entitlements.hasUser(left.display.peerUserId, 'FOUNDER_PRIORITY_INBOX');
        const rightPriority = right.display.peerUserId !== null && this.entitlements.hasUser(right.display.peerUserId, 'FOUNDER_PRIORITY_INBOX');
        return Number(rightPriority) - Number(leftPriority) || right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id);
      });
    return this.page(rows, options, (row) => `${row.updatedAt}:${row.id}`);
  }
  public getConversation(principal: AuthenticatedPrincipal, conversationId: string): MessagingConversationSummary { const { conversation } = this.access(principal, conversationId); return this.summary(principal, conversation); }
  public updateConversationPreferences(principal: AuthenticatedPrincipal, conversationId: string, input: MessagingPreferencesInput): MessagingConversationMember { const { member } = this.access(principal, conversationId); if (input.mutedUntil !== undefined && input.mutedUntil !== null && Number.isNaN(Date.parse(input.mutedUntil))) throw new MessagingError('VALIDATION', 'mutedUntil must be ISO date.'); return this.idempotent(principal, 'conversation.preferences', input.idempotencyKey, { conversationId, ...input }, () => { const now = this.runtime.now(), updated: MessagingConversationMember = { ...member, ...(input.mutedUntil === undefined ? {} : { mutedUntil: input.mutedUntil }), ...(input.pinned === undefined ? {} : { pinnedAt: input.pinned ? member.pinnedAt ?? now : null }), ...(input.archived === undefined ? {} : { archivedAt: input.archived ? member.archivedAt ?? now : null }), updatedAt: now }; this.state.members.set(key(conversationId, principal.userId), updated); return updated; }); }
  public listMessages(principal: AuthenticatedPrincipal, conversationId: string, options: MessagingPageOptions & { readonly beforeSequence?: number | undefined } = {}): MessagingCursorPage<MessagingMessageView> { this.access(principal, conversationId); const rows = [...this.state.messages.values()].filter((row) => row.conversationId === conversationId && (options.beforeSequence === undefined || row.sequence < options.beforeSequence)).sort((a, b) => b.sequence - a.sequence).map((row) => this.messageView(principal, row)); return this.page(rows, options, (row) => String(row.sequence)); }
  public backfill(principal: AuthenticatedPrincipal, conversationId: string, afterSequence: number, options: MessagingPageOptions = {}): MessagingCursorPage<MessagingMessageView> { this.access(principal, conversationId); const rows = [...this.state.messages.values()].filter((row) => row.conversationId === conversationId && row.sequence > afterSequence).sort((a, b) => a.sequence - b.sequence).map((row) => this.messageView(principal, row)); return this.page(rows, options, (row) => String(row.sequence)); }
  public createRealtimeFallback(principal: AuthenticatedPrincipal): MessagingRealtimeFallback { return { backfill: async (input) => this.backfill(principal, input.conversationId, input.afterSequence, input.limit === undefined ? {} : { limit: input.limit }) }; }
  /** The API can advertise only a host-provided authenticated transport. It
   * never mints a client-supplied authority token or fakes an active socket. */
  public getRealtimeHandshake(principal: AuthenticatedPrincipal): MessagingRealtimeHandshake { void principal; return { mode: 'EXTERNAL_AUTHENTICATED_TRANSPORT', realtimeAvailable: this.realtime !== undefined, fallbackRoute: '/v1/messaging/conversations/:conversationId/messages/backfill' }; }
  private presenceRecipients(userId: string): readonly string[] { return [...new Set([...this.state.members.values()].filter((member) => member.userId === userId && member.status === 'ACTIVE' && this.members(member.conversationId).some((current) => current.userId === userId)).flatMap((member) => this.members(member.conversationId).map((other) => other.userId)).filter((other) => other !== userId))]; }
  private emitPresence(value: MessagingPresence): void { this.realtime?.publish(this.presenceRecipients(value.userId), { eventId: this.runtime.id(), type: 'presence.updated', occurredAt: this.runtime.now(), conversationId: null, sequence: null, userId: value.userId, presence: value.status }); }
  /** Session infrastructure calls this after authenticating/refreshing a real session. */
  public updatePresence(principal: AuthenticatedPrincipal, status: MessagingPresence['status'], ttlMs = 60_000): MessagingPresence { if (!['ONLINE', 'AWAY', 'OFFLINE'].includes(status) || !Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 5 * 60_000) throw new MessagingError('VALIDATION', 'Presence state or TTL is invalid.'); const now = this.runtime.now(), value: MessagingPresence = { userId: principal.userId, status, updatedAt: now, expiresAt: status === 'OFFLINE' ? null : new Date(this.nowMs() + ttlMs).toISOString() }; this.state.presence.set(principal.userId, value); this.persist(); this.emitPresence(value); return clone(value); }
  public getPresence(principal: AuthenticatedPrincipal, userId: string): MessagingPresence { if (userId !== principal.userId && ![...this.state.conversations.values()].some((conversation) => { const members = this.members(conversation.id); return members.some((member) => member.userId === principal.userId) && members.some((member) => member.userId === userId) && (!this.requiresFounderInboxAccess(principal, conversation) || this.entitlements.has(principal, 'FOUNDER_INBOX_ACCESS')); })) throw new MessagingAuthorizationError(); const value = this.state.presence.get(userId); if (value === undefined || (value.expiresAt !== null && Date.parse(value.expiresAt) <= this.nowMs())) return { userId, status: 'OFFLINE', updatedAt: this.runtime.now(), expiresAt: null }; return clone(value); }
  /** Ephemeral presence/typing cleanup is called by the connection manager on a timer or disconnect. */
  public cleanupEphemeral(): void { const now = this.nowMs(); for (const [userId, value] of this.state.presence) if (value.expiresAt !== null && Date.parse(value.expiresAt) <= now && value.status !== 'OFFLINE') { const offline: MessagingPresence = { userId, status: 'OFFLINE', updatedAt: this.runtime.now(), expiresAt: null }; this.state.presence.set(userId, offline); this.emitPresence(offline); } for (const [typingKey, expiresAt] of this.typingExpires) if (expiresAt <= now) { const [conversationId, userId] = typingKey.split(':'); this.typingExpires.delete(typingKey); if (conversationId !== undefined && userId !== undefined) this.realtime?.publish(this.members(conversationId).filter((member) => member.userId !== userId).map((member) => member.userId), { eventId: this.runtime.id(), type: 'typing.stopped', occurredAt: this.runtime.now(), conversationId, sequence: null, userId }); } this.persist(); }
  public setTyping(principal: AuthenticatedPrincipal, conversationId: string, active: boolean): { readonly accepted: boolean; readonly realtimeAvailable: boolean } { this.access(principal, conversationId); this.cleanupEphemeral(); const typingKey = key(conversationId, principal.userId), now = this.nowMs(), last = this.typingLastSent.get(typingKey); if (last !== undefined && now - last < 750) throw new MessagingError('RATE_LIMITED', 'Typing updates are temporarily limited.'); this.typingLastSent.set(typingKey, now); if (active) this.typingExpires.set(typingKey, now + 8_000); else this.typingExpires.delete(typingKey); this.realtime?.publish(this.members(conversationId).filter((member) => member.userId !== principal.userId).map((member) => member.userId), { eventId: this.runtime.id(), type: active ? 'typing.started' : 'typing.stopped', occurredAt: this.runtime.now(), conversationId, sequence: null, userId: principal.userId }); return { accepted: true, realtimeAvailable: this.realtime !== undefined }; }
  public disconnect(principal: AuthenticatedPrincipal): void { for (const typingKey of [...this.typingExpires.keys()].filter((value) => value.endsWith(`:${principal.userId}`))) { const conversationId = typingKey.slice(0, -(principal.userId.length + 1)); this.typingExpires.delete(typingKey); this.realtime?.publish(this.members(conversationId).filter((member) => member.userId !== principal.userId).map((member) => member.userId), { eventId: this.runtime.id(), type: 'typing.stopped', occurredAt: this.runtime.now(), conversationId, sequence: null, userId: principal.userId }); } this.updatePresence(principal, 'OFFLINE'); }
  public send(principal: AuthenticatedPrincipal, conversationId: string, input: MessagingSendInput): MessagingMessageView { const { conversation } = this.access(principal, conversationId); if (input.clientMessageId.trim() === '') throw new MessagingError('VALIDATION', 'clientMessageId is required.'); const media = this.resolveMedia(principal, input.mediaIds), body = input.body?.trim() || null; if (body === null && media.length === 0) throw new MessagingError('VALIDATION', 'Text or authorized media is required.'); if (body !== null && body.length > 10_000) throw new MessagingError('VALIDATION', 'Message text is too long.'); this.assertReply(conversationId, input.replyToMessageId); const receiptKey = key(principal.userId, input.clientMessageId), contentHash = JSON.stringify({ conversationId, body, media: media.map((item) => item.mediaId), replyToMessageId: input.replyToMessageId ?? null }) ?? ''; const prior = this.state.clientMessageIds.get(receiptKey); if (prior !== undefined) { if (prior.fingerprint !== contentHash) throw new MessagingError('IDEMPOTENCY_REPLAY', 'clientMessageId was reused with different input.'); const value = this.state.messages.get(prior.messageId); if (value === undefined) throw new MessagingError('CONFLICT', 'Message receipt refers to missing message.'); return this.messageView(principal, value); } return this.idempotent(principal, 'message.send', input.idempotencyKey, { conversationId, ...input }, () => { this.enforceSendRate(principal, conversationId, body, media); if (conversation.kind === 'DIRECT') { const peer = this.members(conversationId).find((row) => row.userId !== principal.userId)?.userId; if (peer === undefined || this.blocks.isBlocked(principal.userId, peer)) throw new MessagingAuthorizationError('BLOCKED'); } const now = this.runtime.now(), message: MessagingMessage = { id: this.runtime.id(), conversationId, senderId: principal.userId, clientMessageId: input.clientMessageId, sequence: conversation.lastSequence + 1, kind: this.kind(body, media), body, media, replyToMessageId: input.replyToMessageId ?? null, status: 'ACTIVE', reactions: [], createdAt: now, updatedAt: now, editedAt: null, deletedAt: null, deletedByUserId: null }; this.state.messages.set(message.id, message); this.state.clientMessageIds.set(receiptKey, { fingerprint: contentHash, messageId: message.id }); this.state.conversations.set(conversation.id, { ...conversation, lastSequence: message.sequence, lastMessageId: message.id, lastMessageAt: now, updatedAt: now }); this.enqueueMessageNotifications(message); this.emit('message.created', message); return this.messageView(principal, message); }); }
  public updateMessage(principal: AuthenticatedPrincipal, messageId: string, input: MessagingPatchInput): MessagingMessageView { const original = this.state.messages.get(messageId); if (original === undefined) throw new MessagingError('NOT_FOUND', 'Message was not found.'); this.access(principal, original.conversationId); if (original.senderId !== principal.userId || original.status !== 'ACTIVE') throw new MessagingAuthorizationError(); const media = this.resolveMedia(principal, input.mediaIds ?? original.media.map((item) => item.mediaId)), body = input.body === undefined ? original.body : input.body?.trim() || null; if (body !== null && body.length > 10_000) throw new MessagingError('VALIDATION', 'Message text is too long.'); if (body === null && media.length === 0) throw new MessagingError('VALIDATION', 'Text or authorized media is required.'); return this.idempotent(principal, 'message.update', input.idempotencyKey, { messageId, ...input }, () => { const updated = { ...original, body, media, kind: this.kind(body, media), updatedAt: this.runtime.now(), editedAt: this.runtime.now() }; this.state.messages.set(messageId, updated); this.emit('message.updated', updated); return this.messageView(principal, updated); }); }
  public deleteMessage(principal: AuthenticatedPrincipal, messageId: string, idempotencyKey?: string): MessagingMessageView { const original = this.state.messages.get(messageId); if (original === undefined) throw new MessagingError('NOT_FOUND', 'Message was not found.'); const { member } = this.access(principal, original.conversationId); if (original.senderId !== principal.userId && !['OWNER', 'ADMIN', 'MODERATOR'].includes(member.role)) throw new MessagingAuthorizationError(); return this.idempotent(principal, 'message.delete', idempotencyKey, { messageId }, () => { if (original.status === 'DELETED') return this.messageView(principal, original); const now = this.runtime.now(), updated = { ...original, body: null, media: [], status: 'DELETED' as const, updatedAt: now, deletedAt: now, deletedByUserId: principal.userId }; this.state.messages.set(messageId, updated); this.emit('message.deleted', updated); return this.messageView(principal, updated); }); }
  public setReaction(principal: AuthenticatedPrincipal, messageId: string, type: MessagingReactionType, active: boolean, idempotencyKey?: string): MessagingReaction | { readonly removed: true } { if (!(messagingReactionTypes as readonly string[]).includes(type)) throw new MessagingError('VALIDATION', 'Reaction type is invalid.'); const message = this.state.messages.get(messageId); if (message === undefined) throw new MessagingError('NOT_FOUND', 'Message was not found.'); this.access(principal, message.conversationId); return this.idempotent(principal, 'message.reaction', idempotencyKey, { messageId, type, active }, () => { const existed = message.reactions.find((row) => row.userId === principal.userId && row.type === type); const reaction: MessagingReaction = existed ?? { messageId, userId: principal.userId, type, createdAt: this.runtime.now() }; const reactions = active ? (existed === undefined ? [...message.reactions, reaction] : message.reactions) : message.reactions.filter((row) => !(row.userId === principal.userId && row.type === type)); const updated = { ...message, reactions }; this.state.messages.set(messageId, updated); this.realtime?.publish(this.members(message.conversationId).map((row) => row.userId), { eventId: this.runtime.id(), type: 'message.reaction.updated', occurredAt: this.runtime.now(), conversationId: message.conversationId, sequence: message.sequence, messageId, reaction, active }); return active ? reaction : { removed: true }; }); }
  public markRead(principal: AuthenticatedPrincipal, conversationId: string, sequence: number, idempotencyKey?: string): MessagingConversationMember { const { conversation, member } = this.access(principal, conversationId); if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > conversation.lastSequence) throw new MessagingError('VALIDATION', 'sequence is invalid.'); return this.idempotent(principal, 'conversation.read', idempotencyKey, { conversationId, sequence }, () => { const updated = { ...member, lastReadSequence: Math.max(member.lastReadSequence, sequence), updatedAt: this.runtime.now() }; this.state.members.set(key(conversationId, principal.userId), updated); if (this.setting(principal.userId).readReceiptsEnabled) this.realtime?.publish(this.members(conversationId).filter((row) => row.userId !== principal.userId).map((row) => row.userId), { eventId: this.runtime.id(), type: 'conversation.read', occurredAt: this.runtime.now(), conversationId, sequence: updated.lastReadSequence, userId: principal.userId, lastReadSequence: updated.lastReadSequence }); return updated; }); }
  public markUnread(principal: AuthenticatedPrincipal, conversationId: string, sequence: number, idempotencyKey?: string): MessagingConversationMember { const { conversation, member } = this.access(principal, conversationId); if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > conversation.lastSequence) throw new MessagingError('VALIDATION', 'sequence is invalid.'); return this.idempotent(principal, 'conversation.unread', idempotencyKey, { conversationId, sequence }, () => { const updated = { ...member, lastReadSequence: Math.min(member.lastReadSequence, sequence - 1), updatedAt: this.runtime.now() }; this.state.members.set(key(conversationId, principal.userId), updated); return updated; }); }
  public getUnreadSummary(principal: AuthenticatedPrincipal): MessagingUnreadSummary { const conversations = this.listConversations(principal, { includeArchived: true, limit: 100 }).items.map((row) => ({ conversationId: row.id, unreadCount: row.unreadCount, lastSequence: row.lastSequence, lastReadSequence: row.viewer.lastReadSequence })).filter((row) => row.unreadCount > 0); return { totalUnread: conversations.reduce((total, row) => total + row.unreadCount, 0), conversations, generatedAt: this.runtime.now() }; }
  public getDraft(principal: AuthenticatedPrincipal, conversationId: string): MessagingDraft | null { this.access(principal, conversationId); return clone(this.state.drafts.get(key(conversationId, principal.userId)) ?? null); }
  public saveDraft(principal: AuthenticatedPrincipal, conversationId: string, input: MessagingDraftInput): MessagingDraft { this.access(principal, conversationId); const media = this.resolveMedia(principal, input.mediaIds), body = input.body?.trim() || null; this.assertReply(conversationId, input.replyToMessageId); return this.idempotent(principal, 'draft.save', input.idempotencyKey, { conversationId, ...input }, () => { const draft: MessagingDraft = { conversationId, userId: principal.userId, body, media, replyToMessageId: input.replyToMessageId ?? null, updatedAt: this.runtime.now() }; this.state.drafts.set(key(conversationId, principal.userId), draft); return draft; }); }
  public deleteDraft(principal: AuthenticatedPrincipal, conversationId: string, idempotencyKey?: string): { readonly removed: boolean } { this.access(principal, conversationId); return this.idempotent(principal, 'draft.delete', idempotencyKey, { conversationId }, () => ({ removed: this.state.drafts.delete(key(conversationId, principal.userId)) })); }
  public getSettings(principal: AuthenticatedPrincipal): MessagingUserSettings { return clone(this.setting(principal.userId)); }
  public updateSettings(principal: AuthenticatedPrincipal, input: MessagingSettingsInput): MessagingUserSettings { return this.idempotent(principal, 'settings.update', input.idempotencyKey, input, () => { const updated: MessagingUserSettings = { ...this.setting(principal.userId), ...(input.directMessagePolicy === undefined ? {} : { directMessagePolicy: input.directMessagePolicy }), ...(input.readReceiptsEnabled === undefined ? {} : { readReceiptsEnabled: input.readReceiptsEnabled }), ...(input.notificationLevel === undefined ? {} : { notificationLevel: input.notificationLevel }), updatedAt: this.runtime.now() }; this.state.settings.set(principal.userId, updated); return updated; }); }
  public setBlock(principal: AuthenticatedPrincipal, userId: string, active: boolean, idempotencyKey?: string): { readonly blockedUserId: string; readonly blocked: boolean } { if (userId === principal.userId) throw new MessagingError('VALIDATION', 'A user cannot block themselves.'); return this.idempotent(principal, 'user.block', idempotencyKey, { userId, active }, () => { this.blocks.setBlocked(principal.userId, userId, active); return { blockedUserId: userId, blocked: active }; }); }
  public search(principal: AuthenticatedPrincipal, query: string, options: MessagingPageOptions = {}): MessagingCursorPage<MessagingSearchResult> { const term = query.trim().toLocaleLowerCase(); if (term.length === 0 || term.length > 200) throw new MessagingError('VALIDATION', 'Search query must be 1 to 200 characters.'); const conversations = new Set(this.listConversations(principal, { includeArchived: true, limit: 100 }).items.map((row) => row.id)); const rows = [...this.state.messages.values()].filter((row) => row.status === 'ACTIVE' && row.body !== null && conversations.has(row.conversationId) && row.body.toLocaleLowerCase().includes(term)).map((row) => ({ messageId: row.id, conversationId: row.conversationId, senderId: row.senderId, sequence: row.sequence, snippet: row.body!.slice(Math.max(0, row.body!.toLocaleLowerCase().indexOf(term) - 40), row.body!.toLocaleLowerCase().indexOf(term) + term.length + 120), createdAt: row.createdAt })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); return this.page(rows, options, (row) => `${row.createdAt}:${row.messageId}`); }
  public reportMessage(principal: AuthenticatedPrincipal, messageId: string, reason: MessagingReportReason, details?: string | null, idempotencyKey?: string): MessagingReport { const message = this.state.messages.get(messageId); if (message === undefined) throw new MessagingError('NOT_FOUND', 'Message was not found.'); this.access(principal, message.conversationId); if (message.senderId === principal.userId) throw new MessagingError('VALIDATION', 'A user cannot report their own message.'); return this.idempotent(principal, 'message.report', idempotencyKey, { messageId, reason, details }, () => { const report: MessagingReport = { id: this.runtime.id(), reporterUserId: principal.userId, messageId, conversationId: message.conversationId, reason, details: details?.trim() || null, status: 'OPEN', createdAt: this.runtime.now() }; this.state.reports.set(report.id, report); return report; }); }
  /** This method is deliberately private; AdminMessagingApiAdapter obtains it
   * from the module-local WeakMap only after AdminAuthorizationService has
   * verified ODR + ROOT_READ_PRIVATE_MESSAGES and appended an audit record. */
  private readPrivateMessagesForAdmin(targetUserId: string): readonly JsonObject[] { return [...this.state.messages.values()].filter((message) => this.members(message.conversationId).some((member) => member.userId === targetUserId)).map((message) => ({ id: message.id, conversationId: message.conversationId, senderId: message.senderId, body: message.body, media: message.media.map((media) => ({ mediaId: media.mediaId, kind: media.kind, fileName: media.fileName, contentType: media.contentType, bytes: media.bytes })), createdAt: message.createdAt } as JsonObject)); }
}

/** Separate Admin-only boundary. No consumer Messaging API invokes this class. */
export class AdminMessagingApiAdapter {
  public constructor(private readonly authorization: AdminAuthorizationService, private readonly messaging: MessagingService) {}
  public readPrivateMessages(principal: AuthenticatedPrincipal, targetUserId: string, context: AdminRequestContext = {}): readonly JsonObject[] {
    const read = adminPrivateReaders.get(this.messaging);
    if (read === undefined) throw new MessagingError('CONFLICT', 'Messaging Admin reader is unavailable.');
    return this.authorization.readPrivateMessages(principal, targetUserId, { readPrivateMessages: read }, context);
  }
}

export interface DurableMessage { readonly id: string; readonly conversationId: string; readonly senderId: string; readonly clientMessageId: string; readonly sequence: number; readonly createdAt: string; }
export const nextConversationSequence = (lastSequence: number): number => { if (!Number.isSafeInteger(lastSequence) || lastSequence < 0) throw new Error('Conversation sequence must be a non-negative safe integer.'); return lastSequence + 1; };
export const isMessageReplay = (existingClientMessageIds: ReadonlySet<string>, clientMessageId: string): boolean => existingClientMessageIds.has(clientMessageId);
export const requiresBackfill = (lastAppliedSequence: number, incomingSequence: number): boolean => incomingSequence > lastAppliedSequence + 1;

export {
  AdminMessagingRouteAdapter,
  MessagingApiAdapter,
  type AdminMessagingApiRequest,
  type MessagingApiRequest,
  type MessagingApiResponse,
} from './api.js';

export {
  fromMessagingDurableMessageRow,
  toMessagingDurableMessageWrite,
  type MessagingDurableAttachmentRow,
  type MessagingDurableMessageRow,
  type MessagingDurableMessageWrite,
  type MessagingDurableOutboxRow,
  type MessagingDurableRepository,
} from './persistence.js';
