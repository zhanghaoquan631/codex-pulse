import { describe, expect, it, vi } from 'vitest';
import { fetchMoviePlayback } from './movie-playback.js';

const url = 'https://www.2nyy.com/dianying/102938.html';
const source = { id: 'a'.repeat(20), label: '正片 · 线路1', url: 'https://media.example/film.m3u8', mimeType: 'application/vnd.apple.mpegurl' };
const payload = { sourceUrl: url, title: '片名 (2000)', platform: '2nyy', sources: [source], warnings: [], metadataOnly: true };

describe('public movie playback metadata', () => {
  it('returns bound sources without changing URLs into local media proxies', async () => {
    const runMetadata = vi.fn(async () => payload);
    expect(await fetchMoviePlayback({ url }, { runMetadata })).toEqual(payload);
    expect(runMetadata).toHaveBeenCalledExactlyOnceWith(url);
  });

  it('rejects unknown parameters, credentials and unsupported routes before any request', async () => {
    const runMetadata = vi.fn();
    for (const query of [{ url, token: 'secret' }, { url: 'https://user:pass@2nyy.com/dianying/123.html' },
      { url: 'https://2nyy.com.evil.example/dianying/123.html' }, { url: 'https://2nyy.com/dianshiju/123.html' },
      { url: 'http://127.0.0.1/dianying/123.html' }, { url: url.replace('https:', 'http:') }, { url: `${url}?token=secret` }, { url: `${url}#other` }, { url: 'https://2nyy.com:444/dianying/123.html' }, {}]) {
      await expect(fetchMoviePlayback(query, { runMetadata })).rejects.toThrow('Invalid movie playback query.');
    }
    expect(runMetadata).not.toHaveBeenCalled();
  });

  it('reports oddym unsupported without guessing sources or contacting it', async () => {
    const runMetadata = vi.fn();
    const result = await fetchMoviePlayback({ url: 'https://oddym.com/detail/123' }, { runMetadata });
    expect(result).toMatchObject({ platform: 'oddym', sources: [], metadataOnly: true });
    expect(result.warnings).toHaveLength(1);
    expect(runMetadata).not.toHaveBeenCalled();
  });

  it('rejects another movie or malformed helper payload', async () => {
    for (const data of [null, [], { ...payload, sourceUrl: 'https://www.2nyy.com/dianying/999.html' }, { ...payload, platform: 'oddym' }, { ...payload, sources: 'invalid' }]) {
      await expect(fetchMoviePlayback({ url }, { runMetadata: async () => data })).rejects.toThrow('Public movie metadata is unavailable.');
    }
  });

  it('drops private, credentialed, executable and incorrectly typed media URLs', async () => {
    const unsafe = ['http://127.0.0.1/a.m3u8', 'http://172.16.0.1/a.m3u8', 'http://[::1]/a.m3u8',
      'https://user:pass@media.example/a.m3u8', 'data:text/plain,aaa', 'https://media.example/html'];
    const result = await fetchMoviePlayback({ url }, { runMetadata: async () => ({ ...payload, sources: unsafe.map((value) => ({ ...source, url: value })) }) });
    expect(result.sources).toEqual([]);
  });

  it('preserves source priority and bounds or deduplicates helper output', async () => {
    const result = await fetchMoviePlayback({ url }, { runMetadata: async () => ({ ...payload,
      sources: [source, source, ...Array.from({ length: 40 }, (_, index) => ({ ...source, url: `https://media.example/${index}.m3u8`, label: 'x'.repeat(1_000) }))],
      warnings: Array.from({ length: 30 }, () => 'x'.repeat(1_000)),
    }) });
    expect(result.sources[0]).toEqual(source);
    expect(result.sources).toHaveLength(15);
    expect(result.sources[1]?.label).toHaveLength(160);
    expect(result.warnings).toHaveLength(10);
    expect(result.warnings[0]).toHaveLength(300);
  });

  it('propagates metadata failure without fabricating a playable source', async () => {
    await expect(fetchMoviePlayback({ url }, { runMetadata: async () => { throw new Error('unavailable'); } })).rejects.toThrow('unavailable');
    const result = await fetchMoviePlayback({ url }, { runMetadata: async () => ({ ...payload, sources: [] }) });
    expect(result.sources).toEqual([]);
  });
});
