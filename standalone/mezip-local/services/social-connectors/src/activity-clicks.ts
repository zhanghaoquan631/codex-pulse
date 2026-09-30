import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { XCapturePersistenceSnapshot } from './x-local-capture.js';

export const activityClickInputSchema = z.object({
  url: z.string().url().max(4_000),
  title: z.string().trim().max(500).optional(),
  platform: z.string().trim().max(200).optional(),
  // One UUID per user activation, retained unchanged for a network retry.
  idempotencyKey: z.string().uuid().transform((value) => value.toLowerCase()),
}).strict();

export type ActivityClickInput = z.infer<typeof activityClickInputSchema>;

export interface ActivityClickSession {
  readonly id: string;
  readonly clickedAt: string;
  readonly source: string;
  readonly url: string;
  readonly legacy: boolean;
}

export interface PersistedActivityClickSession extends ActivityClickSession {
  readonly ownerId: string;
  readonly title: string;
  readonly platform: string;
  readonly idempotencyKey: string;
}

export interface ActivityClickRecord {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly platform: string;
  readonly kind: 'X' | 'BROWSER';
  readonly clickCount: number;
  readonly lastClickedAt: string | null;
  readonly explicitClickCount: number;
  readonly legacyOpenCount: number;
  readonly missingTimestampCount: number;
}

export interface ActivityClickDetail {
  readonly record: ActivityClickRecord;
  readonly sessions: readonly ActivityClickSession[];
}

function isXHost(host: string): boolean {
  return ['x.com', 'twitter.com'].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function activityClickUrl(value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('Activity click URL is invalid.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Activity click URL must use HTTP or HTTPS.');
  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';
  if (isXHost(parsed.hostname)) {
    parsed.hostname = 'x.com';
    parsed.protocol = 'https:';
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || key === 's' || key === 't') parsed.searchParams.delete(key);
    }
  }
  return parsed.toString();
}

export function activityClickRecordId(ownerId: string, url: string): string {
  return createHash('sha256').update(`${ownerId}|${activityClickUrl(url)}`).digest('hex');
}

function safeUrl(value: string): string | null {
  try { return activityClickUrl(value); } catch { return null; }
}

export function activityClickPlatform(url: string, supplied?: string): string {
  return isXHost(new URL(url).hostname) ? 'X' : supplied?.trim() || new URL(url).hostname;
}

/** Read-only projection: saved/liked/viewed items may appear with zero clicks.
 * Resource opens are read directly, never copied into a second count store. */
export function projectActivityClicks(state: XCapturePersistenceSnapshot, ownerId: string): readonly ActivityClickDetail[] {
  type Group = { record: ActivityClickRecord; sessions: ActivityClickSession[]; keys: Set<string>; legacy: ActivityClickSession[] };
  const groups = new Map<string, Group>();
  const ensure = (rawUrl: string, title?: string | null, platform?: string): Group | null => {
    const url = safeUrl(rawUrl);
    if (url === null) return null;
    let group = groups.get(url);
    if (group === undefined) {
      const kind = isXHost(new URL(url).hostname) ? 'X' : 'BROWSER';
      group = {
        record: { id: activityClickRecordId(ownerId, url), url, title: title?.trim() || url, platform: activityClickPlatform(url, platform), kind, clickCount: 0, lastClickedAt: null, explicitClickCount: 0, legacyOpenCount: 0, missingTimestampCount: 0 },
        sessions: [], keys: new Set(), legacy: [],
      };
      groups.set(url, group);
    } else if (group.record.title === url && title?.trim()) {
      group.record = { ...group.record, title: title.trim() };
    }
    return group;
  };
  const addExplicit = (group: Group, session: ActivityClickSession, key: string | null): void => {
    // The same client activation can pass through both APIs during upgrades.
    const identity = key === null ? `session:${session.id}` : `activation:${key.toLowerCase()}`;
    if (group.keys.has(identity)) return;
    group.keys.add(identity);
    group.sessions.push(session);
  };

  for (const resource of state.resources ?? []) {
    if (resource.ownerId !== ownerId) continue;
    const group = ensure(resource.canonicalUrl, resource.title, resource.platform);
    if (group === null) continue;
    const sessions = (state.resourceSessions ?? []).filter((session) => session.ownerId === ownerId && session.resourceRecordId === resource.id);
    for (const session of sessions) {
      addExplicit(group, { id: session.id, clickedAt: session.openedAt, source: session.source, url: group.record.url, legacy: false }, session.idempotencyKey);
    }
    const missing = Math.max(0, (Number.isInteger(resource.openCount) ? resource.openCount : 0) - sessions.length);
    group.record = {
      ...group.record,
      missingTimestampCount: group.record.missingTimestampCount + missing,
      lastClickedAt: [group.record.lastClickedAt, resource.lastOpenedAt].filter((value): value is string => value !== null).sort().at(-1) ?? null,
    };
  }
  for (const session of state.clickSessions ?? []) {
    if (session.ownerId !== ownerId) continue;
    const group = ensure(session.url, session.title, session.platform);
    if (group !== null) addExplicit(group, { id: session.id, clickedAt: session.clickedAt, source: session.source, url: group.record.url, legacy: false }, session.idempotencyKey);
  }
  for (const event of state.events) {
    if (event.userId !== ownerId) continue;
    const group = ensure(event.postUrl, event.pageTitle, event.platform);
    if (group === null || event.actionType !== 'opened') continue;
    group.legacy.push({ id: `legacy:${event.id}`, clickedAt: event.capturedAt, source: group.record.kind === 'X' ? 'LEGACY_X_OPENED' : 'LEGACY_BROWSER_OPENED', url: group.record.url, legacy: true });
  }
  for (const bookmark of state.edgeBookmarks ?? []) {
    if (bookmark.status === 'active') ensure(bookmark.url, bookmark.title, 'EDGE');
  }
  for (const item of state.privateLibrary ?? []) {
    if (item.ownerId === ownerId) ensure(item.sourceUrl, item.title, item.sourcePlatform);
  }

  return [...groups.values()].map((group): ActivityClickDetail => {
    // Old `opened` means page/URL observation, with a 30s bucket. A page load
    // immediately following our explicit navigation is the same activation,
    // so suppress only that legacy projection, never two explicit clicks.
    const matchedExplicit = new Set<string>();
    const legacy = group.legacy.sort((a, b) => a.clickedAt.localeCompare(b.clickedAt)).filter((observation) => {
      const candidates = group.sessions.filter((session) => {
        const lag = Date.parse(observation.clickedAt) - Date.parse(session.clickedAt);
        return !matchedExplicit.has(session.id) && lag >= 0 && lag <= 30_000;
      }).sort((a, b) => b.clickedAt.localeCompare(a.clickedAt));
      const match = candidates[0];
      if (match === undefined) return true;
      matchedExplicit.add(match.id);
      return false;
    });
    const sessions = [...group.sessions, ...legacy].sort((a, b) => b.clickedAt.localeCompare(a.clickedAt) || a.id.localeCompare(b.id));
    const explicitClickCount = group.sessions.length;
    const legacyOpenCount = legacy.length + group.record.missingTimestampCount;
    return {
      record: {
        ...group.record,
        clickCount: explicitClickCount + legacyOpenCount,
        explicitClickCount,
        legacyOpenCount,
        lastClickedAt: [group.record.lastClickedAt, sessions[0]?.clickedAt ?? null].filter((value): value is string => value !== null).sort().at(-1) ?? null,
      },
      sessions,
    };
  }).sort((a, b) => (b.record.lastClickedAt ?? '').localeCompare(a.record.lastClickedAt ?? '') || a.record.url.localeCompare(b.record.url));
}
