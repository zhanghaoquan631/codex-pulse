import { randomUUID } from 'node:crypto';
import type { AuthenticatedPrincipal, JsonObject, WatchRecord, WatchSession } from '@me-zip/shared-types';

export interface WatchProgressInput {
  readonly sessionId: string;
  readonly captureId?: string;
  readonly sequence?: number;
  readonly sessionActualPlayedSeconds?: number;
  readonly contentKey?: string;
  readonly contentType: WatchRecord['contentType'];
  readonly platform: string;
  readonly domain: string;
  readonly videoId?: string | null;
  readonly title: string;
  readonly subtitle?: string | null;
  readonly creator?: string | null;
  readonly url: string;
  readonly canonicalUrl: string;
  readonly thumbnail?: string | null;
  readonly poster?: string | null;
  readonly durationSeconds: number;
  readonly currentTimeSeconds: number;
  readonly actualPlayedSeconds: number;
  readonly eventType: 'play' | 'progress' | 'pause' | 'seeking' | 'seeked' | 'ended' | 'visibilitychange' | 'pagehide';
  readonly startedAt?: string;
  readonly endedAt?: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface WatchPersistenceSnapshot {
  readonly records: readonly WatchRecord[];
  readonly sessions: readonly WatchSession[];
  readonly checkpoints?: readonly { readonly sessionId: string; readonly contentKey: string; readonly sequence: number; readonly actualPlayedSeconds: number }[];
  readonly receipts?: readonly string[];
}

export interface WatchPersistence {
  read(ownerId: string): WatchPersistenceSnapshot | null;
  write(ownerId: string, snapshot: WatchPersistenceSnapshot): void;
}

export interface WatchProgressResult {
  readonly record: WatchRecord | null;
  readonly session: WatchSession | null;
  readonly created: boolean;
  readonly ignored: boolean;
}

export interface WatchRecordQuery {
  readonly status?: WatchRecord['status'];
  readonly contentType?: WatchRecord['contentType'];
  readonly query?: string;
  readonly limit?: number;
}

export interface WatchRecordPageQuery extends WatchRecordQuery {
  readonly cursor?: string;
}

export interface WatchRecordPage {
  readonly items: readonly WatchRecord[];
  readonly nextCursor: string | null;
}

interface WatchCursor {
  readonly lastWatchedAt: string;
  readonly id: string;
}

function compareWatchOrder(left: WatchCursor, right: WatchCursor): number {
  if (left.lastWatchedAt !== right.lastWatchedAt) return left.lastWatchedAt > right.lastWatchedAt ? -1 : 1;
  return left.id === right.id ? 0 : left.id > right.id ? -1 : 1;
}

function encodeWatchCursor(record: WatchCursor): string {
  return Buffer.from(JSON.stringify({ lastWatchedAt: record.lastWatchedAt, id: record.id }), 'utf8').toString('base64url');
}

function decodeWatchCursor(cursor: string): WatchCursor {
  try {
    if (cursor.length > 1_000 || !/^[A-Za-z0-9_-]+$/u.test(cursor)) throw new Error();
    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) throw new Error();
    const value: unknown = JSON.parse(decoded.toString('utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    const fields = value as Record<string, unknown>;
    if (Object.keys(fields).length !== 2 || typeof fields.lastWatchedAt !== 'string' || typeof fields.id !== 'string') throw new Error();
    if (fields.lastWatchedAt.length > 64 || new Date(fields.lastWatchedAt).toISOString() !== fields.lastWatchedAt) throw new Error();
    if (fields.id.length === 0 || fields.id.length > 200 || fields.id.trim() !== fields.id
      || Array.from(fields.id).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error();
    return { lastWatchedAt: fields.lastWatchedAt, id: fields.id };
  } catch {
    throw new Error('Invalid watch cursor.');
  }
}

function nowIso(clock: () => Date): string { return clock().toISOString(); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function validUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Video URL must use HTTP or HTTPS.');
    return parsed.toString();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Video URL is invalid.');
  }
}
function contentKeyFor(input: WatchProgressInput, canonicalUrl: string): string {
  return input.contentKey?.trim() || (input.videoId?.trim() ? `${input.platform.toLowerCase()}:${input.videoId.trim()}` : canonicalUrl);
}
function statusFor(duration: number, current: number): WatchRecord['status'] {
  if (duration > 0 && current / duration >= 0.9) return 'COMPLETED';
  if (current > 0) return 'IN_PROGRESS';
  return 'STARTED';
}

function movieTitle(value: string): string {
  return value.replace(/^《(.+?)》(?:高清|在线).*?[-_|｜]\s*(?:电影\s*[-_|｜]\s*)?努努影院.*$/u, '$1')
    .replace(/\s*[-_|｜]\s*(?:哒哒影漫|低端影视|低端影视官网|在线[观播]看|免费在线观看|高清[在视]线播放).*$/u, '').trim() || value;
}

function mergeWatchMetadata(previous: JsonObject | undefined, input: WatchProgressInput, totalWatchSeconds: number): JsonObject {
  const incoming = { ...(input.metadata ?? {}) };
  // Missing or blocked snapshots retain the last successfully captured image
  // and its original timestamp, while frameStatus describes this attempt.
  if (typeof incoming.lastFrame !== 'string' || incoming.lastFrame.length > 10_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/u.test(incoming.lastFrame)) {
    delete incoming.lastFrame; delete incoming.frameCapturedAt; delete incoming.framePositionSeconds;
    if (incoming.frameStatus === 'captured') incoming.frameStatus = 'unavailable';
  }
  return { ...previous, ...incoming,
    movieQualified: ['MOVIE', 'EPISODE'].includes(input.contentType) && totalWatchSeconds >= 1_800,
    movieQualificationSeconds: 1_800,
  } as JsonObject;
}

export class WatchCaptureService {
  private readonly states = new Map<string, WatchPersistenceSnapshot>();

  public constructor(
    private readonly persistence: WatchPersistence,
    private readonly clock: () => Date = () => new Date(),
    private readonly id: () => string = () => randomUUID(),
  ) {}

  private principal(principal: AuthenticatedPrincipal): string {
    if (principal.userId.trim() === '') throw new Error('An authenticated owner is required.');
    return principal.userId;
  }

  private state(ownerId: string): WatchPersistenceSnapshot {
    const current = this.states.get(ownerId) ?? this.persistence.read(ownerId);
    if (current !== null && current !== undefined) {
      const normalized = { ...current, records: [...(current.records ?? [])], sessions: [...(current.sessions ?? [])] };
      this.states.set(ownerId, normalized);
      return normalized;
    }
    const created: WatchPersistenceSnapshot = { records: [], sessions: [] };
    this.persist(ownerId, created);
    return created;
  }

  private persist(ownerId: string, snapshot: WatchPersistenceSnapshot): void {
    const cloned = structuredClone(snapshot);
    this.persistence.write(ownerId, cloned);
    this.states.set(ownerId, cloned);
  }

  public upsertProgress(principal: AuthenticatedPrincipal, input: WatchProgressInput): WatchProgressResult {
    const ownerId = this.principal(principal);
    const url = validUrl(input.url);
    const canonicalUrl = validUrl(input.canonicalUrl);
    const duration = clamp(Number.isFinite(input.durationSeconds) ? input.durationSeconds : 0, 0, 86_400);
    const current = clamp(Number.isFinite(input.currentTimeSeconds) ? input.currentTimeSeconds : 0, 0, duration || 86_400);
    const contentKey = contentKeyFor(input, canonicalUrl);
    const state = this.state(ownerId);
    const existing = state.records.find((record) => record.ownerId === ownerId && record.contentKey === contentKey);
    const previousSession = state.sessions.find((session) => session.ownerId === ownerId && session.watchRecordId === existing?.id && session.id === input.sessionId);
    const checkpoint = state.checkpoints?.find((item) => item.sessionId === input.sessionId && item.contentKey === contentKey);
    const cumulative = Number.isFinite(input.sessionActualPlayedSeconds) && Number.isInteger(input.sequence) && (input.sequence ?? 0) > 0;
    if ((input.captureId && state.receipts?.includes(input.captureId)) || (cumulative && checkpoint && input.sequence! <= checkpoint.sequence)) {
      return { record: existing ? structuredClone(existing) : null, session: previousSession ? structuredClone(previousSession) : null, created: false, ignored: true };
    }
    const played = cumulative
      ? clamp(input.sessionActualPlayedSeconds! - (checkpoint?.actualPlayedSeconds ?? previousSession?.actualPlayedSeconds ?? 0), 0, 31_536_000)
      : clamp(Number.isFinite(input.actualPlayedSeconds) ? input.actualPlayedSeconds : 0, 0, 3_600);
    // Opening a page or pressing play without any elapsed playback is not a
    // watch. The first durable record requires a positive playback delta.
    if (existing === undefined && played < 0.05) return { record: null, session: null, created: false, ignored: true };
    const timestamp = nowIso(this.clock);
    const firstWatchedAt = existing?.firstWatchedAt ?? input.startedAt ?? timestamp;
    const progressPercent = duration > 0 ? clamp((current / duration) * 100, 0, 100) : 0;
    const totalWatchSeconds = (existing?.totalWatchSeconds ?? 0) + played;
    const record: WatchRecord = {
      id: existing?.id ?? this.id(), ownerId, contentKey, contentType: input.contentType,
      platform: input.platform.trim(), domain: input.domain.trim().toLowerCase(), videoId: input.videoId?.trim() || null,
      title: (['MOVIE', 'EPISODE'].includes(input.contentType) ? movieTitle(input.title.trim()) : input.title.trim()) || '未命名视频', subtitle: input.subtitle?.trim() || null, creator: input.creator?.trim() || null,
      url, canonicalUrl, thumbnail: input.thumbnail ?? existing?.thumbnail ?? null, poster: input.poster ?? existing?.poster ?? null,
      durationSeconds: duration, currentTimeSeconds: current, progressPercent,
      status: statusFor(duration, current), firstWatchedAt, lastWatchedAt: timestamp,
      totalWatchSeconds,
      watchCount: existing === undefined ? 1 : existing.watchCount + (previousSession === undefined ? 1 : 0),
      metadata: mergeWatchMetadata(existing?.metadata, input, totalWatchSeconds), privacy: 'PRIVATE',
      createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp,
    };
    const session: WatchSession = {
      id: input.sessionId, watchRecordId: record.id, ownerId,
      startedAt: previousSession?.startedAt ?? input.startedAt ?? timestamp,
      endedAt: input.endedAt ?? (['pause', 'ended', 'visibilitychange', 'pagehide'].includes(input.eventType) ? timestamp : previousSession?.endedAt ?? null),
      startPositionSeconds: previousSession?.startPositionSeconds ?? current,
      endPositionSeconds: current,
      actualPlayedSeconds: (previousSession?.actualPlayedSeconds ?? 0) + played,
      createdAt: previousSession?.createdAt ?? timestamp,
    };
    const sessions = previousSession === undefined ? [session, ...state.sessions] : state.sessions.map((item) => item.id === session.id ? session : item);
    const records = existing === undefined ? [record, ...state.records] : state.records.map((item) => item.id === record.id ? record : item);
    const checkpoints = cumulative ? [...(state.checkpoints ?? []).filter((item) => item.sessionId !== input.sessionId || item.contentKey !== contentKey),
      { sessionId: input.sessionId, contentKey, sequence: input.sequence!, actualPlayedSeconds: Math.max(checkpoint?.actualPlayedSeconds ?? 0, input.sessionActualPlayedSeconds!) }] : state.checkpoints;
    this.persist(ownerId, { records, sessions, ...(checkpoints ? { checkpoints } : {}),
      receipts: input.captureId ? [...(state.receipts ?? []), input.captureId].slice(-4096) : state.receipts ?? [] });
    return { record: structuredClone(record), session: structuredClone(session), created: existing === undefined, ignored: false };
  }

  public listMovies(principal: AuthenticatedPrincipal, createState = true): readonly WatchRecord[] {
    const ownerId = this.principal(principal);
    const state = createState ? this.state(ownerId) : this.states.get(ownerId) ?? this.persistence.read(ownerId);
    return structuredClone((state?.records ?? []).filter((record) => record.ownerId === ownerId && ['MOVIE', 'EPISODE'].includes(record.contentType))
      .sort((left, right) => right.lastWatchedAt.localeCompare(left.lastWatchedAt))
      .map((record) => {
        const { lastFrame, ...metadata } = record.metadata;
        return { ...record, metadata: { ...metadata, hasLastFrame: typeof lastFrame === 'string' && lastFrame.startsWith('data:image/jpeg;base64,'), movieQualified: record.totalWatchSeconds >= 1_800 } };
      }));
  }

  private matchingRecords(principal: AuthenticatedPrincipal, query: WatchRecordQuery, createState = true): readonly WatchRecord[] {
    const ownerId = this.principal(principal);
    const needle = query.query?.toLocaleLowerCase();
    const state = createState ? this.state(ownerId) : this.states.get(ownerId) ?? this.persistence.read(ownerId);
    return (state?.records ?? [])
      .filter((record) => record.ownerId === ownerId)
      .filter((record) => query.status === undefined || record.status === query.status)
      .filter((record) => query.contentType === undefined || record.contentType === query.contentType)
      .filter((record) => needle === undefined || `${record.title} ${record.subtitle ?? ''} ${record.creator ?? ''} ${record.platform} ${record.domain} ${record.url}`.toLocaleLowerCase().includes(needle))
      .sort(compareWatchOrder);
  }

  public list(principal: AuthenticatedPrincipal, query: WatchRecordQuery = {}): readonly WatchRecord[] {
    return structuredClone(this.matchingRecords(principal, query).slice(0, query.limit ?? 100));
  }

  public listPage(principal: AuthenticatedPrincipal, query: WatchRecordPageQuery = {}): WatchRecordPage {
    const cursor = query.cursor === undefined ? null : decodeWatchCursor(query.cursor);
    const limit = query.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid watch page limit.');
    const records = this.matchingRecords(principal, query, false)
      .filter((record) => cursor === null || compareWatchOrder(record, cursor) > 0);
    const items = records.slice(0, limit);
    const last = items.at(-1);
    return {
      items: structuredClone(items),
      nextCursor: records.length > limit && last !== undefined ? encodeWatchCursor(last) : null,
    };
  }

  public get(principal: AuthenticatedPrincipal, recordId: string): { readonly record: WatchRecord; readonly sessions: readonly WatchSession[] } {
    const ownerId = this.principal(principal);
    const state = this.state(ownerId);
    const record = state.records.find((item) => item.id === recordId && item.ownerId === ownerId);
    if (record === undefined) throw new Error('Watch record was not found.');
    return { record: structuredClone(record), sessions: structuredClone(state.sessions.filter((item) => item.watchRecordId === recordId && item.ownerId === ownerId).sort((left, right) => right.startedAt.localeCompare(left.startedAt))) };
  }

  public remove(principal: AuthenticatedPrincipal, recordId: string): boolean {
    const ownerId = this.principal(principal);
    const state = this.state(ownerId);
    const exists = state.records.some((record) => record.id === recordId && record.ownerId === ownerId);
    if (!exists) return false;
    const removed = state.records.find((record) => record.id === recordId);
    this.persist(ownerId, { ...state, records: state.records.filter((record) => record.id !== recordId), sessions: state.sessions.filter((session) => session.watchRecordId !== recordId),
      checkpoints: state.checkpoints?.filter((item) => item.contentKey !== removed?.contentKey) ?? [] });
    return true;
  }
}
