/**
 * Local-only messaging resilience state.
 *
 * Outbox records are never treated as sent: a record disappears only after a
 * server-confirmed `sendMessage` result. The payload is intentionally small
 * (text plus opaque media IDs) and never contains auth, entitlement, contact,
 * Root, or server-issued attachment URLs.
 */

import type { MessagingClient, MessagingMessage, MessagingResult } from './messagingClient.js';

export type LocalMessageState = 'PENDING' | 'SENDING' | 'FAILED';

export interface LocalMessageOutboxItem {
  readonly clientMessageId: string;
  readonly conversationId: string;
  readonly body: string;
  readonly mediaIds: readonly string[];
  readonly replyToMessageId: string | null;
  readonly createdAt: string;
  readonly attempts: number;
  readonly state: LocalMessageState;
  /** Reviewed error code only; raw message bodies/errors are never retained. */
  readonly lastErrorCode: string | null;
}

export interface MessagingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryMessagingStorage implements MessagingStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function browserStorage(): MessagingStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const OUTBOX_SCHEMA_VERSION = 1;
const DRAFT_SCHEMA_VERSION = 1;
const OUTBOX_STORAGE_KEY = `mezip.messaging.outbox.v${OUTBOX_SCHEMA_VERSION}`;
const DRAFT_STORAGE_KEY = `mezip.messaging.drafts.v${DRAFT_SCHEMA_VERSION}`;
const MAX_DRAFT_LENGTH = 10_000;
const DEFAULT_ACCOUNT_SUBJECT = 'anonymous';

function normalizeAccountSubject(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,127}$/.test(normalized)) {
    throw new Error('Messaging local state requires an opaque account subject.');
  }
  return normalized;
}

function scopedStorageKey(baseKey: string, accountSubject: string): string {
  return `${baseKey}.${encodeURIComponent(accountSubject)}`;
}

interface OutboxEnvelope {
  readonly schemaVersion: number;
  readonly items: readonly LocalMessageOutboxItem[];
}

interface DraftEnvelope {
  readonly schemaVersion: number;
  readonly drafts: Readonly<Record<string, LocalMessagingDraft>>;
}

export interface LocalMessagingDraft {
  readonly conversationId: string;
  readonly body: string;
  readonly updatedAt: string;
}

function cloneItem(item: LocalMessageOutboxItem): LocalMessageOutboxItem {
  return { ...item, mediaIds: [...item.mediaIds] };
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isState(value: unknown): value is LocalMessageState {
  return value === 'PENDING' || value === 'SENDING' || value === 'FAILED';
}

function mapOutboxItem(value: unknown): LocalMessageOutboxItem | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Partial<LocalMessageOutboxItem>;
  if (
    typeof candidate.clientMessageId !== 'string' ||
    typeof candidate.conversationId !== 'string' ||
    typeof candidate.body !== 'string' ||
    !isStringArray(candidate.mediaIds) ||
    typeof candidate.createdAt !== 'string' ||
    !isState(candidate.state) ||
    typeof candidate.attempts !== 'number' ||
    !Number.isSafeInteger(candidate.attempts) ||
    candidate.attempts < 0 ||
    (candidate.replyToMessageId !== null && typeof candidate.replyToMessageId !== 'string') ||
    (candidate.lastErrorCode !== null && typeof candidate.lastErrorCode !== 'string')
  ) return null;
  if (
    candidate.clientMessageId.length === 0 ||
    candidate.conversationId.length === 0 ||
    candidate.body.length > MAX_DRAFT_LENGTH ||
    candidate.mediaIds.length > 12
  ) return null;
  const attempts = candidate.attempts;
  if (attempts === undefined) return null;
  return {
    clientMessageId: candidate.clientMessageId,
    conversationId: candidate.conversationId,
    body: candidate.body,
    mediaIds: [...candidate.mediaIds],
    replyToMessageId: candidate.replyToMessageId,
    createdAt: candidate.createdAt,
    attempts,
    state: candidate.state,
    lastErrorCode: candidate.lastErrorCode,
  };
}

function compareOldest(first: LocalMessageOutboxItem, second: LocalMessageOutboxItem): number {
  return first.createdAt.localeCompare(second.createdAt)
    || first.clientMessageId.localeCompare(second.clientMessageId);
}

function resultFailure(
  code: string,
  message: string,
  retryable: boolean,
): MessagingResult<MessagingMessage> {
  return {
    ok: false,
    source: 'UNAVAILABLE',
    error: {
      code: code === 'OFFLINE' ? 'OFFLINE' : 'SERVICE_UNAVAILABLE',
      message,
      retryable,
    },
  };
}

export interface MessagingOutboxOptions {
  readonly storage?: MessagingStorage;
  readonly now?: () => number;
  readonly accountSubject?: string;
}

/**
 * Persisted local outbox for a current browser profile. Authorization remains
 * server-side on every flush; a queued item cannot create a conversation or
 * bypass membership, blocks, entitlement, moderation, or attachment checks.
 */
export class MessagingOutbox {
  private readonly storage: MessagingStorage;
  private readonly now: () => number;
  private accountSubject: string;

  constructor(options: MessagingOutboxOptions = {}) {
    this.storage = options.storage ?? browserStorage() ?? new MemoryMessagingStorage();
    this.now = options.now ?? (() => Date.now());
    this.accountSubject = normalizeAccountSubject(options.accountSubject ?? DEFAULT_ACCOUNT_SUBJECT);
  }

  /** Called at an authenticated account boundary before the messaging page reads local state. */
  setAccountSubject(subject: string): void {
    this.accountSubject = normalizeAccountSubject(subject);
  }

  private get storageKey(): string {
    return scopedStorageKey(OUTBOX_STORAGE_KEY, this.accountSubject);
  }

  private read(): OutboxEnvelope {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (raw === null) return { schemaVersion: OUTBOX_SCHEMA_VERSION, items: [] };
      const value: unknown = JSON.parse(raw);
      if (typeof value !== 'object' || value === null || !('schemaVersion' in value) || !('items' in value))
        return { schemaVersion: OUTBOX_SCHEMA_VERSION, items: [] };
      const candidate = value as { readonly schemaVersion?: unknown; readonly items?: unknown };
      if (candidate.schemaVersion !== OUTBOX_SCHEMA_VERSION || !Array.isArray(candidate.items))
        return { schemaVersion: OUTBOX_SCHEMA_VERSION, items: [] };
      return {
        schemaVersion: OUTBOX_SCHEMA_VERSION,
        items: candidate.items.map(mapOutboxItem).filter((item): item is LocalMessageOutboxItem => item !== null),
      };
    } catch {
      return { schemaVersion: OUTBOX_SCHEMA_VERSION, items: [] };
    }
  }

  private write(items: readonly LocalMessageOutboxItem[]): void {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify({
        schemaVersion: OUTBOX_SCHEMA_VERSION,
        items: items.map(cloneItem),
      } satisfies OutboxEnvelope));
    } catch {
      // Storage is a resilience enhancement only; the in-memory call path remains safe.
    }
  }

  list(conversationId?: string): readonly LocalMessageOutboxItem[] {
    return this.read().items
      .filter((item) => conversationId === undefined || item.conversationId === conversationId)
      .map(cloneItem)
      .sort(compareOldest);
  }

  enqueue(input: {
    readonly clientMessageId: string;
    readonly conversationId: string;
    readonly body?: string;
    readonly mediaIds?: readonly string[];
    readonly replyToMessageId?: string | null;
  }): LocalMessageOutboxItem {
    const body = input.body?.trim() ?? '';
    const mediaIds = [...new Set((input.mediaIds ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, 12);
    if (input.clientMessageId.trim().length === 0 || input.conversationId.trim().length === 0)
      throw new Error('clientMessageId and conversationId are required.');
    if ((body.length === 0 && mediaIds.length === 0) || body.length > MAX_DRAFT_LENGTH)
      throw new Error('Queued message must contain permitted text or opaque media IDs.');
    const current = this.read();
    const existing = current.items.find((item) => item.clientMessageId === input.clientMessageId);
    if (existing !== undefined) return cloneItem(existing);
    const next: LocalMessageOutboxItem = {
      clientMessageId: input.clientMessageId.trim(),
      conversationId: input.conversationId.trim(),
      body,
      mediaIds,
      replyToMessageId: input.replyToMessageId?.trim() || null,
      createdAt: new Date(this.now()).toISOString(),
      attempts: 0,
      state: 'PENDING',
      lastErrorCode: null,
    };
    this.write([...current.items, next]);
    return cloneItem(next);
  }

  private replace(next: LocalMessageOutboxItem): LocalMessageOutboxItem {
    const current = this.read();
    const items = current.items.map((item) => item.clientMessageId === next.clientMessageId ? next : item);
    this.write(items);
    return cloneItem(next);
  }

  private remove(clientMessageId: string): void {
    const current = this.read();
    this.write(current.items.filter((item) => item.clientMessageId !== clientMessageId));
  }

  markPending(clientMessageId: string): LocalMessageOutboxItem | null {
    const item = this.read().items.find((candidate) => candidate.clientMessageId === clientMessageId);
    if (item === undefined) return null;
    return this.replace({ ...item, state: 'PENDING', lastErrorCode: null });
  }

  /** Retries with the exact same clientMessageId to preserve server idempotency. */
  async flushOne(client: MessagingClient, clientMessageId: string): Promise<MessagingResult<MessagingMessage>> {
    const item = this.read().items.find((candidate) => candidate.clientMessageId === clientMessageId);
    if (item === undefined) {
      return resultFailure('SERVICE_UNAVAILABLE', '待发送消息已不在本地队列中。', false);
    }
    if (client.source !== 'SERVER') {
      return resultFailure('SERVICE_UNAVAILABLE', '消息服务尚未连接；不会将本地草稿伪装为已发送。', true);
    }
    this.replace({ ...item, state: 'SENDING', attempts: item.attempts + 1, lastErrorCode: null });
    const result = await client.sendMessage({
      conversationId: item.conversationId,
      clientMessageId: item.clientMessageId,
      ...(item.body.length === 0 ? {} : { body: item.body }),
      ...(item.mediaIds.length === 0 ? {} : { mediaIds: item.mediaIds }),
      ...(item.replyToMessageId === null ? {} : { replyToMessageId: item.replyToMessageId }),
      idempotencyKey: item.clientMessageId,
    });
    if (result.ok) {
      this.remove(item.clientMessageId);
      return result;
    }
    const state: LocalMessageState = result.error.retryable ? 'PENDING' : 'FAILED';
    this.replace({
      ...item,
      state,
      attempts: item.attempts + 1,
      lastErrorCode: result.error.code,
    });
    return result;
  }
}

export interface MessagingDraftCacheOptions {
  readonly storage?: MessagingStorage;
  readonly now?: () => number;
  readonly accountSubject?: string;
}

/** Local fallback only. UI always labels it as unsynced until the server confirms. */
export class MessagingDraftCache {
  private readonly storage: MessagingStorage;
  private readonly now: () => number;
  private accountSubject: string;

  constructor(options: MessagingDraftCacheOptions = {}) {
    this.storage = options.storage ?? browserStorage() ?? new MemoryMessagingStorage();
    this.now = options.now ?? (() => Date.now());
    this.accountSubject = normalizeAccountSubject(options.accountSubject ?? DEFAULT_ACCOUNT_SUBJECT);
  }

  setAccountSubject(subject: string): void {
    this.accountSubject = normalizeAccountSubject(subject);
  }

  private get storageKey(): string {
    return scopedStorageKey(DRAFT_STORAGE_KEY, this.accountSubject);
  }

  private read(): DraftEnvelope {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (raw === null) return { schemaVersion: DRAFT_SCHEMA_VERSION, drafts: {} };
      const value: unknown = JSON.parse(raw);
      if (typeof value !== 'object' || value === null || !('schemaVersion' in value) || !('drafts' in value))
        return { schemaVersion: DRAFT_SCHEMA_VERSION, drafts: {} };
      const candidate = value as { readonly schemaVersion?: unknown; readonly drafts?: unknown };
      if (candidate.schemaVersion !== DRAFT_SCHEMA_VERSION || typeof candidate.drafts !== 'object' || candidate.drafts === null || Array.isArray(candidate.drafts))
        return { schemaVersion: DRAFT_SCHEMA_VERSION, drafts: {} };
      const drafts = Object.fromEntries(Object.entries(candidate.drafts)
        .flatMap(([key, draft]) => {
          if (typeof draft !== 'object' || draft === null || Array.isArray(draft)) return [];
          const value = draft as Partial<LocalMessagingDraft>;
          if (value.conversationId !== key || typeof value.body !== 'string' || typeof value.updatedAt !== 'string' || value.body.length > MAX_DRAFT_LENGTH)
            return [];
          return [[key, { conversationId: value.conversationId, body: value.body, updatedAt: value.updatedAt }]];
        }));
      return { schemaVersion: DRAFT_SCHEMA_VERSION, drafts };
    } catch {
      return { schemaVersion: DRAFT_SCHEMA_VERSION, drafts: {} };
    }
  }

  private write(drafts: Readonly<Record<string, LocalMessagingDraft>>): void {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify({ schemaVersion: DRAFT_SCHEMA_VERSION, drafts } satisfies DraftEnvelope));
    } catch {
      // No failure escalation: drafts remain in the active React state.
    }
  }

  get(conversationId: string): LocalMessagingDraft | null {
    return this.read().drafts[conversationId] ?? null;
  }

  save(conversationId: string, body: string): LocalMessagingDraft | null {
    const normalized = body.slice(0, MAX_DRAFT_LENGTH);
    const current = this.read();
    if (normalized.trim().length === 0) {
      const remaining: Record<string, LocalMessagingDraft> = { ...current.drafts };
      delete remaining[conversationId];
      this.write(remaining);
      return null;
    }
    const next: LocalMessagingDraft = {
      conversationId,
      body: normalized,
      updatedAt: new Date(this.now()).toISOString(),
    };
    this.write({ ...current.drafts, [conversationId]: next });
    return next;
  }

  clear(conversationId: string): void {
    const current = this.read();
    const remaining: Record<string, LocalMessagingDraft> = { ...current.drafts };
    delete remaining[conversationId];
    this.write(remaining);
  }
}

export const messagingOutbox = new MessagingOutbox();
export const messagingDraftCache = new MessagingDraftCache();
