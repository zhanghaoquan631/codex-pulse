import type { WatchRecord } from '@me-zip/shared-types';
import type { WatchProgressInput } from './watch-capture.js';

export const INSPIRATION_MOVIE_PLAYER_ORIGIN = 'http://127.0.0.1:5174';
export const INSPIRATION_MOVIE_PLAYER_PATH = '/x-local-capture-v13/movie-player.html';
export const INSPIRATION_MOVIE_PLAYER_ADAPTER = 'inspiration-movie-player';

export type MovieWatchAttribution =
  | { readonly action: 'pass' | 'normalize'; readonly input: WatchProgressInput; readonly reason: string }
  | { readonly action: 'ignore'; readonly input: null; readonly reason: string };

function httpUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch { return null; }
}

export function movieSourceIdentity(value: unknown): string | null {
  const url = httpUrl(value);
  if (!url || url.port || url.hash) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/u, '');
  for (const [site, path] of [['2nyy.com', /^\/dianying\/(\d+)\.html$/u],
    ['oddym.com', /^\/detail\/(\d+)\/?$/u]] as const) {
    const match = path.exec(url.pathname);
    if (match && (host === site || host.endsWith(`.${site}`))) return `${site}:${match[1]}`;
  }
  return null;
}

function isPlayerLocation(value: unknown): boolean {
  const url = httpUrl(value);
  return Boolean(url && url.origin === INSPIRATION_MOVIE_PLAYER_ORIGIN && url.pathname === INSPIRATION_MOVIE_PLAYER_PATH);
}

function playerSource(value: unknown): URL | null {
  const url = httpUrl(value);
  if (!url || !isPlayerLocation(value) || url.hash) return null;
  const entries = [...url.searchParams.entries()];
  if (entries.length !== 1 || entries[0]?.[0] !== 'source') return null;
  const source = httpUrl(entries[0][1]);
  return source && movieSourceIdentity(source.href) ? source : null;
}

function ignored(reason: string): MovieWatchAttribution { return { action: 'ignore', input: null, reason }; }

function localLibraryUrl(value: unknown): boolean {
  const url = httpUrl(value);
  return Boolean(url && ['http://127.0.0.1:4176', 'http://localhost:4176',
    'http://127.0.0.1:5174', 'http://localhost:5174'].includes(url.origin));
}

function canonicalMovieInput(input: WatchProgressInput, source: URL,
  existingRecords: readonly WatchRecord[], relation: string): MovieWatchAttribution {
  const identity = movieSourceIdentity(source.href);
  if (!identity || input.contentType !== 'MOVIE') return ignored('movie-source-not-confirmed');
  const candidates = existingRecords.filter((record) => record.contentType === 'MOVIE'
    && movieSourceIdentity(record.canonicalUrl) === identity);
  // Prefer the canonical record explicitly returned by the playback API. A page
  // must not select another film merely by sending its contentKey.
  let matches = candidates.filter((record) => record.contentKey === input.contentKey);
  if (!matches.length) matches = candidates.filter((record) => httpUrl(record.canonicalUrl)?.href === httpUrl(input.canonicalUrl)?.href);
  if (!matches.length) matches = candidates;
  if (new Set(matches.map((record) => record.contentKey)).size > 1) return ignored('movie-record-ambiguous');
  const existing = matches[0];
  const canonical = existing ? httpUrl(existing.canonicalUrl)! : source;
  return { action: 'normalize', reason: relation, input: {
    ...input,
    url: existing?.url ?? canonical.href,
    canonicalUrl: canonical.href,
    contentKey: existing?.contentKey ?? canonical.href,
    domain: canonical.hostname,
    title: existing?.title ?? (relation === 'verified-movie-detail-iframe' ? '电影（片名待补充）' : input.title),
    metadata: { ...input.metadata, sourcePageUrl: source.href, sourceRelation: relation,
      movieSourceIdentity: identity },
  } };
}

/** Pure classification only. The caller must supply records for this principal
 * and make no persistence call for an ignored result. No counters are invented.
 */
export function attributeMovieWatchProgress(input: WatchProgressInput,
  existingRecords: readonly WatchRecord[] = []): MovieWatchAttribution {
  const metadata = input.metadata ?? {};
  const native = metadata.adapter === INSPIRATION_MOVIE_PLAYER_ADAPTER;
  if (native) {
    const source = playerSource(metadata.frameUrl);
    const identity = source && movieSourceIdentity(source.href);
    if (!source || !identity || movieSourceIdentity(input.canonicalUrl) !== identity
      || movieSourceIdentity(input.url) !== identity) return ignored('native-movie-source-mismatch');
    return canonicalMovieInput(input, source, existingRecords, 'inspiration-movie-player');
  }
  // The unmodified extension sees the native <video>, too. Ignore its report in
  // top or child frames, including verify/invalid query variants of this route.
  if (isPlayerLocation(metadata.frameUrl) || isPlayerLocation(input.url)) return ignored('native-player-extension-duplicate');
  const attributedLocalFrame = metadata.adapter === 'html5' && metadata.frame === 'iframe'
    && metadata.attributedToTopFrame === true && Number.isInteger(metadata.frameId)
    && (metadata.frameId as number) > 0 && localLibraryUrl(input.url);
  if (!attributedLocalFrame) return { action: 'pass', input, reason: 'ordinary-playback' };
  const source = httpUrl(metadata.frameUrl);
  if (!source || !movieSourceIdentity(source.href)) return ignored('local-iframe-movie-source-unproven');
  return canonicalMovieInput(input, source, existingRecords, 'verified-movie-detail-iframe');
}
