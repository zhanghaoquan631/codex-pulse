import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { fetchResourceLinkPreview } from './resource-link-preview.js';
import { XLocalCaptureApiAdapter } from './x-local-capture-api.js';
import type { XLocalCaptureService } from './x-local-capture.js';

const principal: AuthenticatedPrincipal = { userId: 'preview-owner', sessionId: 'preview-session', roles: ['USER'], issuedAt: new Date(0).toISOString() };
const requestedUrl = 'https://example.com/article?a=one&b=two';
const localFile = '/api/files/' + 'a'.repeat(32);
const jsonResponse = (data: unknown, options: ResponseInit = {}): Response => new Response(JSON.stringify(data), {
  ...options, headers: { 'content-type': 'application/json', ...options.headers },
});

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('fixed local library preview adapter', () => {
  it('uses only the fixed library API, omits credentials, and returns the stable preview shape', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      url: 'https://example.com/final', title: ' Actual title ', description: ' Actual description ', coverUrl: localFile,
      previewStatus: 'ready', coverKind: 'webpage_image', metadataSource: 'page_meta', originalCoverUrl: 'https://cdn.example.com/cover.jpg',
      coverStorage: 'local', captionWarning: 'check caption', coverWarning: 'check caption', extra: 'discard me',
    }));
    const result = await fetchResourceLinkPreview({ url: requestedUrl });
    const [endpoint, options] = fetchMock.mock.calls[0]!;
    expect(new URL(String(endpoint)).origin).toBe('http://127.0.0.1:4176');
    expect(new URL(String(endpoint)).pathname).toBe('/api/preview');
    expect(new URL(String(endpoint)).searchParams.get('url')).toBe(requestedUrl);
    expect(options).toMatchObject({ method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error' });
    expect(Object.keys(options?.headers ?? {})).toEqual(['Accept']);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      requestedUrl, url: 'https://example.com/final', title: 'Actual title', description: 'Actual description',
      coverUrl: 'http://127.0.0.1:4176' + localFile, previewStatus: 'ready', coverKind: 'webpage_image', metadataSource: 'page_meta',
      originalCoverUrl: 'https://cdn.example.com/cover.jpg', coverStorage: 'local', warnings: ['check caption'],
    });
  });

  it('keeps real remote fallback images and reports unavailable or incomplete results honestly', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ coverUrl: 'https://cdn.example.com/cover.jpg', previewStatus: 'incomplete', coverWarning: 'backup unavailable' }));
    expect(await fetchResourceLinkPreview({ url: requestedUrl })).toMatchObject({
      url: requestedUrl, coverUrl: 'https://cdn.example.com/cover.jpg', originalCoverUrl: 'https://cdn.example.com/cover.jpg',
      coverStorage: 'remote', previewStatus: 'incomplete', warnings: ['backup unavailable'],
    });
    fetchMock.mockResolvedValue(jsonResponse({ url: 'javascript:alert(1)', coverUrl: 'data:image/svg+xml,bad', previewStatus: 'made-up', previewError: 'page blocked' }));
    expect(await fetchResourceLinkPreview({ url: requestedUrl })).toMatchObject({ url: requestedUrl, coverUrl: '', coverStorage: 'none', previewStatus: 'unavailable', warnings: ['page blocked'] });
    fetchMock.mockResolvedValue(jsonResponse({ coverUrl: '/api/files/../../anything', previewStatus: 'unavailable' }));
    expect((await fetchResourceLinkPreview({ url: requestedUrl })).coverUrl).toBe('');
  });

  it('rejects unknown parameters and unsafe or oversized URL inputs before making a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const invalidQueries = [
      {}, { url: '' }, { url: 'file:///local/file' }, { url: 'javascript:alert(1)' },
      { url: 'https://user:password@example.com/' }, { url: 'https://example.com/' + 'a'.repeat(4_000) },
      { url: requestedUrl, endpoint: 'https://different.example.com/api/preview' },
    ];
    for (const query of invalidQueries) await expect(fetchResourceLinkPreview(query)).rejects.toThrow('Invalid link preview query.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bounds JSON responses with and without Content-Length and rejects other response formats', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const responses = [
      new Response('unavailable', { status: 503 }),
      new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
      jsonResponse({}, { headers: { 'content-length': String(256 * 1024 + 1) } }),
      jsonResponse({ description: 'a'.repeat(256 * 1024) }),
      jsonResponse([]), new Response('not json', { headers: { 'content-type': 'application/json' } }),
    ];
    for (const response of responses) {
      fetchMock.mockResolvedValue(response);
      await expect(fetchResourceLinkPreview({ url: requestedUrl })).rejects.toThrow('Link preview service is unavailable.');
    }
  });

  it('aborts after 25 seconds and does not expose transport errors or request credentials', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('internal transport details')), { once: true });
    }));
    const promise = fetchResourceLinkPreview({ url: requestedUrl });
    const assertion = expect(promise).rejects.toThrow('Link preview service is unavailable.');
    await vi.advanceTimersByTimeAsync(25_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the existing authenticated GET envelope without touching the resource service', async () => {
    const service = { upsertResourceRecord: vi.fn(), patchResourceRecord: vi.fn() };
    const adapter = new XLocalCaptureApiAdapter(service as unknown as XLocalCaptureService);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ previewStatus: 'unavailable' }));
    const request = { method: 'GET' as const, path: '/v1/resources/link-preview', principal };
    expect(await adapter.handle({ ...request, query: { url: requestedUrl } })).toMatchObject({ status: 200, body: { data: { requestedUrl, warnings: [] } } });
    expect(await adapter.handle({ ...request, query: { url: requestedUrl, unexpected: 'parameter' } })).toMatchObject({ status: 400 });
    expect(await adapter.handle({ method: 'GET', path: request.path, query: { url: requestedUrl } })).toMatchObject({ status: 401 });
    expect(service.upsertResourceRecord).not.toHaveBeenCalled();
    expect(service.patchResourceRecord).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
