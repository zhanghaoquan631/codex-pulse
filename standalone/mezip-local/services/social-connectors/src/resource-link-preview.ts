const LIBRARY_ORIGIN = 'http://127.0.0.1:4176';
const PREVIEW_TIMEOUT_MS = 25_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const LOCAL_COVER_PATH = /^\/api\/files\/[a-f0-9]{32}$/u;

export interface ResourceLinkPreview {
  readonly requestedUrl: string;
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly coverUrl: string;
  readonly previewStatus: string;
  readonly coverKind: string;
  readonly metadataSource: string;
  readonly originalCoverUrl: string;
  readonly coverStorage: 'local' | 'remote' | 'none';
  readonly warnings: readonly string[];
}

function httpUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4_000) return '';
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

function text(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function coverUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const candidate = value.trim();
  if (LOCAL_COVER_PATH.test(candidate)) return new URL(candidate, LIBRARY_ORIGIN).href;
  return httpUrl(candidate);
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok || response.headers.get('content-type')?.toLowerCase().split(';')[0]?.trim() !== 'application/json') {
    throw new Error('The preview service did not return JSON.');
  }
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) throw new Error('The preview response is too large.');
  if (response.body === null) throw new Error('The preview response is empty.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error('The preview response is too large.');
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('The preview response has an unsupported shape.');
  return value as Record<string, unknown>;
}

/** Reuse the library's metadata extraction and cover backup. This adapter never
 * changes resource progress, records, library content, or authentication. */
export async function fetchResourceLinkPreview(query: Readonly<Record<string, string | undefined>>): Promise<ResourceLinkPreview> {
  const requestedUrl = httpUrl(query.url);
  if (Object.keys(query).some((key) => key !== 'url') || !requestedUrl) throw new Error('Invalid link preview query.');
  const endpoint = new URL('/api/preview', LIBRARY_ORIGIN);
  endpoint.searchParams.set('url', requestedUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint.href, {
      method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error', signal: controller.signal,
    });
    const data = await responseJson(response);
    const cover = coverUrl(data.coverUrl);
    const localCover = cover ? new URL(cover) : null;
    const statuses = ['ready', 'incomplete', 'unavailable', 'pending', 'invalid_url'];
    return {
      requestedUrl,
      url: httpUrl(data.url) || requestedUrl,
      title: text(data.title, 1_000),
      description: text(data.description, 50_000),
      coverUrl: cover,
      previewStatus: typeof data.previewStatus === 'string' && statuses.includes(data.previewStatus) ? data.previewStatus : 'unavailable',
      coverKind: text(data.coverKind, 80) || 'unknown',
      metadataSource: text(data.metadataSource, 80) || 'none',
      originalCoverUrl: httpUrl(data.originalCoverUrl) || (cover && localCover?.origin !== LIBRARY_ORIGIN ? cover : ''),
      coverStorage: !cover ? 'none' : localCover?.origin === LIBRARY_ORIGIN && LOCAL_COVER_PATH.test(localCover.pathname) ? 'local' : 'remote',
      warnings: [...new Set([data.captionWarning, data.coverWarning, data.previewError].map((value) => text(value, 500)).filter(Boolean))],
    };
  } catch {
    throw new Error('Link preview service is unavailable.');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
