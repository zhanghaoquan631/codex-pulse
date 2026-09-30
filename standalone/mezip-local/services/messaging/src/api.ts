import type { AdminRequestContext } from '@me-zip/admin-service';
import {
  idSchema,
  messagingConversationPreferencesSchema,
  messagingDirectConversationCreateSchema,
  messagingDraftSchema,
  messagingGroupConversationCreateSchema,
  messagingMessageCreateSchema,
  messagingMessagePatchSchema,
  messagingPaginationSchema,
  messagingPresenceSchema,
  messagingReactionSchema,
  messagingReadSchema,
  messagingRequestResolveSchema,
  messagingReportCreateSchema,
  messagingSearchSchema,
  messagingTypingSchema,
  messagingUserSettingsPatchSchema,
} from '@me-zip/schemas';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import type {
  AdminMessagingApiAdapter,
  MessagingPageOptions,
  MessagingService,
} from './index.js';
import { MessagingError } from './index.js';

export interface MessagingApiRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly principal: AuthenticatedPrincipal;
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly headers?: Readonly<Record<string, string | undefined>>;
}

export interface MessagingApiResponse {
  readonly status: number;
  readonly body: { readonly data?: unknown; readonly error?: { readonly code: string; readonly message: string; readonly retryable: boolean } };
}

export interface AdminMessagingApiRequest extends MessagingApiRequest {
  readonly context?: AdminRequestContext;
}

const bodyOf = (request: MessagingApiRequest): unknown => request.body ?? {};
const idempotencyKey = (request: MessagingApiRequest): string | undefined => request.headers?.['idempotency-key'] ?? request.headers?.['Idempotency-Key'];
const optionalBoolean = (value: unknown): boolean | undefined => value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined;
const parse = <T>(result: { readonly success: boolean; readonly data?: T }): T => { if (!result.success || result.data === undefined) throw new MessagingError('VALIDATION', 'Messaging request is invalid.'); return result.data; };
const pagination = (value: { readonly cursor?: string | undefined; readonly limit?: number | undefined; readonly beforeSequence?: number | undefined }): MessagingPageOptions & { readonly beforeSequence?: number | undefined } => ({
  ...(value.cursor === undefined ? {} : { cursor: value.cursor }),
  ...(value.limit === undefined ? {} : { limit: value.limit }),
  ...(value.beforeSequence === undefined ? {} : { beforeSequence: value.beforeSequence }),
});
const page = (request: MessagingApiRequest): MessagingPageOptions => pagination(parse(messagingPaginationSchema.safeParse({ cursor: request.query?.cursor, limit: request.query?.limit })));
const withIdempotency = <T extends object>(value: T, valueKey: string | undefined): T & { readonly idempotencyKey?: string } => valueKey === undefined ? value : { ...value, idempotencyKey: valueKey };

function status(error: unknown): number {
  if (!(error instanceof MessagingError)) return 500;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'FORBIDDEN' || error.code === 'BLOCKED' || error.code === 'ENTITLEMENT_REQUIRED') return 403;
  if (error.code === 'VALIDATION') return 400;
  if (error.code === 'CONFLICT' || error.code === 'IDEMPOTENCY_REPLAY' || error.code === 'DUPLICATE_CONTENT') return 409;
  if (error.code === 'RATE_LIMITED') return 429;
  return 400;
}

/** Adapters never serialize an Error message, details, message body, or media
 * metadata. Domain errors are useful to server logs, not to untrusted clients. */
function consumerErrorMessage(error: unknown): string {
  if (!(error instanceof MessagingError)) return 'Messaging request could not be completed.';
  if (error.code === 'NOT_FOUND') return 'Messaging resource was not found.';
  if (error.code === 'RATE_LIMITED') return 'Messaging request is temporarily limited.';
  if (error.code === 'VALIDATION') return 'Messaging request is invalid.';
  if (error.code === 'IDEMPOTENCY_REPLAY' || error.code === 'DUPLICATE_CONTENT') return 'Messaging request conflicts with a prior request.';
  return 'Messaging action is not available.';
}

/** Consumer adapter: it recognizes only /v1/messaging. It has no Admin path. */
export class MessagingApiAdapter {
  public constructor(private readonly service: MessagingService) {}
  public handle(request: MessagingApiRequest): MessagingApiResponse {
    try { return { status: request.method === 'POST' || request.method === 'PUT' ? 201 : 200, body: { data: this.route(request) } }; }
    catch (error) { const code = error instanceof MessagingError ? error.code : 'INTERNAL', http = status(error); return { status: http, body: { error: { code, message: consumerErrorMessage(error), retryable: http === 409 || http === 429 || http >= 500 } } }; }
  }
  private route(request: MessagingApiRequest): unknown {
    const prefix = '/v1/messaging';
    if (!request.path.startsWith(prefix)) throw new MessagingError('NOT_FOUND', 'Messaging route was not found.');
    const segments = request.path.slice(prefix.length).split('/').filter(Boolean);
    const [resource, id, subresource, action] = segments;
    const body = bodyOf(request), idem = idempotencyKey(request);
    if (resource === 'conversations') {
      if (id === undefined && request.method === 'GET') { const includeArchived = optionalBoolean(request.query?.includeArchived); return this.service.listConversations(request.principal, { ...page(request), ...(includeArchived === undefined ? {} : { includeArchived }) }); }
      if (id === 'direct' && request.method === 'POST') { const value = parse(messagingDirectConversationCreateSchema.safeParse(body)); return this.service.openDirect(request.principal, value.recipientUserId, idem); }
      if (id === 'group' && request.method === 'POST') { const value = parse(messagingGroupConversationCreateSchema.safeParse(body)); return this.service.openGroup(request.principal, value.groupId, idem); }
      if (id === undefined) throw new MessagingError('NOT_FOUND', 'Conversation route was not found.');
      if (subresource === undefined && request.method === 'GET') return this.service.getConversation(request.principal, id);
      if (subresource === 'request' && request.method === 'POST') { const value = parse(messagingRequestResolveSchema.safeParse(body)); return this.service.resolveMessageRequest(request.principal, id, value.action, idem); }
      if (subresource === 'preferences' && request.method === 'PATCH') { const value = parse(messagingConversationPreferencesSchema.safeParse(body)); return this.service.updateConversationPreferences(request.principal, id, withIdempotency(value, idem)); }
      if (subresource === 'messages' && action === undefined && request.method === 'GET') { const value = pagination(parse(messagingPaginationSchema.safeParse({ cursor: request.query?.cursor, limit: request.query?.limit, beforeSequence: request.query?.beforeSequence }))); return this.service.listMessages(request.principal, id, value); }
      if (subresource === 'messages' && action === 'backfill' && request.method === 'GET') { const value = page(request); const afterSequence = Number(request.query?.afterSequence); if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) throw new MessagingError('VALIDATION', 'afterSequence is invalid.'); return this.service.backfill(request.principal, id, afterSequence, value); }
      if (subresource === 'messages' && action === undefined && request.method === 'POST') { const value = parse(messagingMessageCreateSchema.safeParse(body)); return this.service.send(request.principal, id, withIdempotency(value, idem)); }
      if (subresource === 'read' && request.method === 'POST') { const value = parse(messagingReadSchema.safeParse(body)); return this.service.markRead(request.principal, id, value.sequence, idem); }
      if (subresource === 'unread' && request.method === 'POST') { const value = parse(messagingReadSchema.safeParse(body)); return this.service.markUnread(request.principal, id, value.sequence, idem); }
      if (subresource === 'draft' && request.method === 'GET') return this.service.getDraft(request.principal, id);
      if (subresource === 'draft' && request.method === 'PUT') { const value = parse(messagingDraftSchema.safeParse(body)); return this.service.saveDraft(request.principal, id, withIdempotency(value, idem)); }
      if (subresource === 'draft' && request.method === 'DELETE') return this.service.deleteDraft(request.principal, id, idem);
      if (subresource === 'typing' && request.method === 'POST') { const value = parse(messagingTypingSchema.safeParse(body)); return this.service.setTyping(request.principal, id, value.active); }
    }
    if (resource === 'requests' && request.method === 'POST') { const value = parse(messagingDirectConversationCreateSchema.safeParse(body)); return this.service.createMessageRequest(request.principal, value.recipientUserId, idem); }
    if (resource === 'founder' && id === 'inbox' && request.method === 'GET') return this.service.listFounderInbox(request.principal, page(request));
    if (resource === 'founder' && id === 'conversation' && request.method === 'POST') return this.service.openFounderInbox(request.principal, idem);
    if (resource === 'messages' && id !== undefined) {
      if (subresource === undefined && request.method === 'PATCH') { const value = parse(messagingMessagePatchSchema.safeParse(body)); return this.service.updateMessage(request.principal, id, withIdempotency(value, idem)); }
      if (subresource === undefined && request.method === 'DELETE') return this.service.deleteMessage(request.principal, id, idem);
      if (subresource === 'reactions' && action !== undefined && (request.method === 'PUT' || request.method === 'DELETE')) { const value = parse(messagingReactionSchema.safeParse({ type: action })); return this.service.setReaction(request.principal, id, value.type, request.method === 'PUT', idem); }
      if (subresource === 'reports' && request.method === 'POST') { const value = parse(messagingReportCreateSchema.safeParse(body)); return this.service.reportMessage(request.principal, id, value.reason, value.details, idem); }
    }
    if (resource === 'unread' && request.method === 'GET') return this.service.getUnreadSummary(request.principal);
    if (resource === 'realtime' && request.method === 'GET') return this.service.getRealtimeHandshake(request.principal);
    if (resource === 'settings' && request.method === 'GET') return this.service.getSettings(request.principal);
    if (resource === 'settings' && request.method === 'PATCH') { const value = parse(messagingUserSettingsPatchSchema.safeParse(body)); return this.service.updateSettings(request.principal, withIdempotency(value, idem)); }
    if (resource === 'blocks' && id !== undefined && (request.method === 'PUT' || request.method === 'DELETE')) return this.service.setBlock(request.principal, id, request.method === 'PUT', idem);
    if (resource === 'search' && request.method === 'GET') { const value = parse(messagingSearchSchema.safeParse({ q: request.query?.q })); return this.service.search(request.principal, value.q, page(request)); }
    if (resource === 'presence' && id !== undefined && request.method === 'GET') { parse(idSchema.safeParse(id)); return this.service.getPresence(request.principal, id); }
    if (resource === 'presence' && id === undefined && request.method === 'PATCH') { const value = parse(messagingPresenceSchema.safeParse(body)); return this.service.updatePresence(request.principal, value.status, value.ttlMs); }
    throw new MessagingError('NOT_FOUND', 'Messaging route was not found.');
  }
}

/** Separate adapter so ordinary /v1/messaging callers cannot forge Root access. */
export class AdminMessagingRouteAdapter {
  public constructor(private readonly admin: AdminMessagingApiAdapter) {}
  public handle(request: AdminMessagingApiRequest): MessagingApiResponse {
    try {
      const match = /^\/v1\/admin\/users\/([^/]+)\/messages\/private$/u.exec(request.path);
      if (match === null || request.method !== 'GET') throw new MessagingError('NOT_FOUND', 'Admin messaging route was not found.');
      const userId = parse(idSchema.safeParse(decodeURIComponent(match[1]!)));
      return { status: 200, body: { data: this.admin.readPrivateMessages(request.principal, userId, request.context) } };
    } catch (error) {
      const code = error instanceof MessagingError ? error.code : 'FORBIDDEN';
      const http = error instanceof MessagingError ? status(error) : 403;
      return { status: http, body: { error: { code, message: 'Admin messaging request is not available.', retryable: false } } };
    }
  }
}
