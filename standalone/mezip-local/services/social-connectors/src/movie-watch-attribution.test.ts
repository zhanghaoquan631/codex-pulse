import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal, WatchRecord } from '@me-zip/shared-types';
import { attributeMovieWatchProgress, movieSourceIdentity } from './movie-watch-attribution.js';
import { WatchCaptureService, type WatchPersistence, type WatchPersistenceSnapshot, type WatchProgressInput } from './watch-capture.js';

const source = 'https://www.2nyy.com/dianying/102938.html';
const localPlayer = (url = source) => `http://127.0.0.1:5174/x-local-capture-v13/movie-player.html?source=${encodeURIComponent(url)}`;
const input = (patch: Partial<WatchProgressInput> = {}): WatchProgressInput => ({
  sessionId: 'native-session', captureId: 'native-capture-1', sequence: 1, sessionActualPlayedSeconds: 20,
  contentType: 'MOVIE', platform: 'HTML5', domain: 'www.2nyy.com', title: '实际电影片名',
  url: source, canonicalUrl: source, durationSeconds: 6000, currentTimeSeconds: 50,
  actualPlayedSeconds: 20, eventType: 'progress', metadata: { adapter: 'inspiration-movie-player', frameUrl: localPlayer() }, ...patch,
});
const owner: AuthenticatedPrincipal = { userId: 'isolated-owner', sessionId: 'owner-session', roles: ['USER'], issuedAt: '2026-09-30T00:00:00.000Z' };
class MemoryPersistence implements WatchPersistence {
  value: WatchPersistenceSnapshot | null = null;
  writes = 0;
  read(): WatchPersistenceSnapshot | null { return this.value; }
  write(_id: string, value: WatchPersistenceSnapshot): void { this.value = structuredClone(value); this.writes++; }
}
const existing = (patch: Partial<WatchProgressInput> = {}): WatchRecord => {
  const service = new WatchCaptureService(new MemoryPersistence(), () => new Date('2026-09-30T00:00:00.000Z'), () => 'existing-movie');
  return service.upsertProgress(owner, input({ sessionId: 'previous', captureId: 'previous-capture', sequence: 1,
    sessionActualPlayedSeconds: 30, actualPlayedSeconds: 30, contentKey: 'preserved-movie-key', title: '既有正确片名', ...patch })).record!;
};
const extension = (frameUrl: string, top = 'http://127.0.0.1:4176/'): WatchProgressInput => input({
  url: top, canonicalUrl: top, contentKey: top, title: '灵感库标题', metadata: { adapter: 'html5', frame: 'iframe',
    frameId: 2, frameUrl, attributedToTopFrame: true, playbackLineUrl: frameUrl },
});

describe('movie watch attribution without browser, network or production storage', () => {
  it('keeps ordinary top level movie and dedicated video adapters unchanged', () => {
    for (const progress of [input({ metadata: { adapter: 'html5', frame: 'top', frameUrl: source } }),
      input({ metadata: { adapter: 'youtube', frame: 'iframe' } })]) {
      const result = attributeMovieWatchProgress(progress);
      expect(result.action).toBe('pass');
      expect(result.input).toBe(progress);
    }
  });

  it('ignores extension reports from the native route for both top library origins', () => {
    for (const top of ['http://127.0.0.1:4176/', 'http://127.0.0.1:5174/x-local-capture-v13/index.html']) {
      for (const frameUrl of [localPlayer(), localPlayer() + '&verify=1', localPlayer() + '&source=bad',
        'http://127.0.0.1:5174/x-local-capture-v13/movie-player.html?source=invalid']) {
        expect(attributeMovieWatchProgress(extension(frameUrl, top))).toMatchObject({ action: 'ignore', input: null, reason: 'native-player-extension-duplicate' });
      }
    }
    expect(attributeMovieWatchProgress(input({ url: localPlayer(), canonicalUrl: localPlayer(), metadata: { adapter: 'html5', frame: 'top' } })).action).toBe('ignore');
  });

  it('native valid proof restores existing key and title without changing counters or original input', () => {
    const stored = existing();
    const progress = input({ contentKey: 'untrusted-local-key', title: 'incoming-placeholder' });
    const before = structuredClone(progress);
    const result = attributeMovieWatchProgress(progress, [stored]);
    expect(result.action).toBe('normalize');
    expect(result.input).toMatchObject({ url: stored.url, canonicalUrl: stored.canonicalUrl,
      contentKey: stored.contentKey, title: stored.title, domain: 'www.2nyy.com',
      sessionId: progress.sessionId, captureId: progress.captureId, sequence: progress.sequence,
      sessionActualPlayedSeconds: progress.sessionActualPlayedSeconds, actualPlayedSeconds: progress.actualPlayedSeconds,
      currentTimeSeconds: progress.currentTimeSeconds, eventType: progress.eventType });
    expect(progress).toEqual(before);
  });

  it('accepts HTTP/WWW source variants only when their verified movie identity agrees', () => {
    const stored = existing();
    const sourceVariant = 'http://2nyy.com/dianying/102938.html?line=2';
    const result = attributeMovieWatchProgress(input({ contentKey: stored.contentKey,
      metadata: { adapter: 'inspiration-movie-player', frameUrl: localPlayer(sourceVariant) } }), [stored]);
    expect(result.input).toMatchObject({ contentKey: stored.contentKey, canonicalUrl: stored.canonicalUrl, title: stored.title });
    expect(result.action).toBe('normalize');
  });

  it('rejects native wrong movie identity or nonmovie type', () => {
    for (const progress of [input({ canonicalUrl: 'https://www.2nyy.com/dianying/9.html' }),
      input({ url: 'https://www.2nyy.com/dianying/9.html' }), input({ contentType: 'EPISODE' }), input({ contentType: 'VIDEO' })]) {
      expect(attributeMovieWatchProgress(progress).action).toBe('ignore');
    }
  });

  it('rejects extra native query keys, verify mode, hash, aliases and missing source', () => {
    for (const frameUrl of [localPlayer() + '&verify=1', localPlayer() + '&unknown=1', localPlayer() + '&source=' + encodeURIComponent(source),
      localPlayer() + '#player', localPlayer().replace('127.0.0.1', 'localhost'), localPlayer().replace(':5174', ':4176'),
      localPlayer().replace('http:', 'https:'), 'http://127.0.0.1:5174/x-local-capture-v13/movie-player.html']) {
      expect(attributeMovieWatchProgress(input({ metadata: { adapter: 'inspiration-movie-player', frameUrl } })).action).toBe('ignore');
    }
  });

  it('only accepts established movie routes and no lookalike domains, credentials, ports or source fragments', () => {
    for (const value of ['https://2nyy.com.evil.example/dianying/102938.html', 'https://fake2nyy.com/dianying/102938.html',
      'https://user:pass@2nyy.com/dianying/102938.html', 'https://2nyy.com:444/dianying/102938.html',
      'https://2nyy.com/dianshiju/102938.html', 'https://oddym.com/detail/123/episode/2', source + '#fragment']) {
      expect(movieSourceIdentity(value)).toBeNull();
      expect(attributeMovieWatchProgress(input({ metadata: { adapter: 'inspiration-movie-player', frameUrl: localPlayer(value) } })).action).toBe('ignore');
    }
    expect(movieSourceIdentity('https://E6.ODDYM.COM/detail/123/')).toBe('oddym.com:123');
  });

  it('new movie key is the verified source instead of a submitted arbitrary key', () => {
    const result = attributeMovieWatchProgress(input({ contentKey: 'arbitrary-local-key' }));
    expect(result.input).toMatchObject({ contentKey: source, canonicalUrl: source, url: source });
  });

  it('explicit existing canonical key resolves same-film alternatives but unknown ambiguity fails closed', () => {
    const first = existing({ contentKey: 'first' });
    const second = existing({ contentKey: 'second' });
    expect(attributeMovieWatchProgress(input({ contentKey: 'second' }), [first, second]).input?.contentKey).toBe('second');
    expect(attributeMovieWatchProgress(input(), [first, second]).action).toBe('ignore');
  });

  it('direct original movie iframe may recover its identity and original title', () => {
    const stored = existing();
    const result = attributeMovieWatchProgress(extension(source), [stored]);
    expect(result.input).toMatchObject({ contentKey: stored.contentKey, title: stored.title, canonicalUrl: stored.canonicalUrl });
    expect(result.action).toBe('normalize');
    expect(attributeMovieWatchProgress(extension(source)).input?.title).toBe('电影（片名待补充）');
  });

  it('unknown or nested external local iframe cannot invent a movie ancestor', () => {
    for (const url of ['https://external-player.example/player/123', 'about:srcdoc', 'https://x.com/search?q=film']) {
      expect(attributeMovieWatchProgress(extension(url))).toMatchObject({ action: 'ignore', input: null });
    }
  });

  it('normalizes before upsert so native retry and extension duplicate cannot count twice', () => {
    const memory = new MemoryPersistence();
    const service = new WatchCaptureService(memory, () => new Date('2026-09-30T00:00:00.000Z'), () => 'stable-existing');
    service.upsertProgress(owner, input({ sessionId: 'old', captureId: 'old-delivery', sessionActualPlayedSeconds: 30,
      actualPlayedSeconds: 30, contentKey: 'existing-key', title: '正确既有片名' }));
    const progress = input();
    const native = attributeMovieWatchProgress(progress, service.listMovies(owner));
    if (native.input) service.upsertProgress(owner, native.input);
    const repeated = attributeMovieWatchProgress(progress, service.listMovies(owner));
    if (repeated.input) expect(service.upsertProgress(owner, repeated.input).ignored).toBe(true);
    const writes = memory.writes;
    const duplicate = attributeMovieWatchProgress(extension(localPlayer()), service.listMovies(owner));
    expect(duplicate.action).toBe('ignore');
    expect(memory.writes).toBe(writes);
    expect(service.listMovies(owner)).toHaveLength(1);
    expect(service.listMovies(owner)[0]).toMatchObject({ id: 'stable-existing', contentKey: 'existing-key', title: '正确既有片名', totalWatchSeconds: 50 });
  });
});
