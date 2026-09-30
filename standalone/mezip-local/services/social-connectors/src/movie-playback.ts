import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// tsc emits workspace sources under dist/services/social-connectors/src.
// Both candidates are fixed package locations; no request controls the path.
const helperCandidates = [new URL('../scripts/movie-playback-helper.py', import.meta.url), new URL('../../../../scripts/movie-playback-helper.py', import.meta.url)].map((url) => fileURLToPath(url));
const HELPER_PATH = helperCandidates.find((path) => existsSync(path)) ?? helperCandidates[0]!;
const PYTHON_PATH = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Programs', 'Python', 'Python311', 'python.exe');
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: MoviePlayback }>();
const pending = new Map<string, Promise<MoviePlayback>>();

export interface MoviePlaybackSource {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly mimeType: 'application/vnd.apple.mpegurl' | 'video/mp4' | 'video/webm';
}

export interface MoviePlayback {
  readonly sourceUrl: string;
  readonly title: string;
  readonly platform: '2nyy' | 'oddym';
  readonly sources: readonly MoviePlaybackSource[];
  readonly warnings: readonly string[];
  readonly metadataOnly: true;
}

interface MovieSource { readonly url: string; readonly platform: '2nyy' | 'oddym'; }

function movieSource(value: unknown): MovieSource {
  if (typeof value !== 'string' || value.length > 4_000) throw new Error('Invalid movie playback query.');
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.search) throw new Error();
    const host = url.hostname.toLowerCase();
    if (['2nyy.com', 'www.2nyy.com'].includes(host) && /^\/dianying\/\d+\.html$/u.test(url.pathname)) return { url: url.href, platform: '2nyy' };
    if (['oddym.com', 'www.oddym.com'].includes(host) && /^\/detail\/\d+\/?$/u.test(url.pathname)) return { url: url.href, platform: 'oddym' };
  } catch { /* Return one strict input error without exposing credentials. */ }
  throw new Error('Invalid movie playback query.');
}

function publicMediaUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4_000) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || url.hash) return '';
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host.includes(':')
      || /^(?:127|10|0|169\.254|192\.168)\./u.test(host) || /^172\.(?:1[6-9]|2\d|3[01])\./u.test(host)) return '';
    return url.href;
  } catch { return ''; }
}

function runPublicMetadata(sourceUrl: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // The trusted helper uses urllib's normal Windows proxy and fixed public
    // movie routes. No browser cookies, pairing token or caller headers enter it.
    execFile(PYTHON_PATH, ['-B', HELPER_PATH, sourceUrl], {
      timeout: 25_000, maxBuffer: 128 * 1024, encoding: 'utf8', windowsHide: true,
    }, (error, stdout) => {
      if (error) { reject(new Error('Public movie metadata is unavailable.')); return; }
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Public movie metadata is unavailable.')); }
    });
  });
}

function playbackResult(value: unknown, source: MovieSource): MoviePlayback {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Public movie metadata is unavailable.');
  const data = value as Record<string, unknown>;
  if (data.sourceUrl !== source.url || data.platform !== source.platform || !Array.isArray(data.sources)) throw new Error('Public movie metadata is unavailable.');
  const sources: MoviePlaybackSource[] = [];
  const seen = new Set<string>();
  for (const raw of data.sources.slice(0, 16)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const url = publicMediaUrl(item.url);
    if (!url || seen.has(url) || !['application/vnd.apple.mpegurl', 'video/mp4', 'video/webm'].includes(String(item.mimeType))) continue;
    const extension = new URL(url).pathname.toLowerCase();
    if (!(item.mimeType === 'application/vnd.apple.mpegurl' && extension.endsWith('.m3u8'))
      && !(item.mimeType === 'video/mp4' && extension.endsWith('.mp4'))
      && !(item.mimeType === 'video/webm' && extension.endsWith('.webm'))) continue;
    seen.add(url);
    sources.push({
      id: typeof item.id === 'string' && /^[a-f0-9]{20}$/u.test(item.id) ? item.id : String(sources.length),
      label: typeof item.label === 'string' ? item.label.trim().slice(0, 160) : `线路 ${sources.length + 1}`,
      url, mimeType: item.mimeType as MoviePlaybackSource['mimeType'],
    });
  }
  return {
    sourceUrl: source.url, platform: source.platform,
    title: typeof data.title === 'string' ? data.title.trim().slice(0, 500) : '',
    sources,
    warnings: Array.isArray(data.warnings) ? data.warnings.filter((item): item is string => typeof item === 'string').slice(0, 10).map((item) => item.slice(0, 300)) : [],
    metadataOnly: true,
  };
}

/** Metadata only: the browser plays original public media directly. This never
 * proxies media, reads encryption keys, or updates capture/library records. */
export async function fetchMoviePlayback(
  query: Readonly<Record<string, string | undefined>>,
  options: { readonly runMetadata?: (sourceUrl: string) => Promise<unknown> } = {},
): Promise<MoviePlayback> {
  if (Object.keys(query).some((key) => key !== 'url')) throw new Error('Invalid movie playback query.');
  const source = movieSource(query.url);
  if (source.platform === 'oddym') return {
    sourceUrl: source.url, title: '', platform: 'oddym', sources: [], metadataOnly: true,
    warnings: ['此站尚无已验证的公开播放元数据入口，请在原电影页面播放。'],
  };
  const run = options.runMetadata || runPublicMetadata;
  // Test runners are isolated from the production metadata cache.
  if (options.runMetadata) return playbackResult(await run(source.url), source);
  const cached = cache.get(source.url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  const running = pending.get(source.url);
  if (running) return running;
  const request = run(source.url).then((data) => {
    const result = playbackResult(data, source);
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    cache.set(source.url, { at: Date.now(), value: result });
    return result;
  }).finally(() => { pending.delete(source.url); });
  pending.set(source.url, request);
  return request;
}
