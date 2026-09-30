import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
// Deliberately test the stable emitted entrypoint used by the supervisor, not
// the TS source: otherwise stale flat outputs pass every source-level test.
import { createLocalCaptureServer } from '../dist/local-capture-server.js';
const { fetch } = globalThis;

test('the supervisor entrypoint serves click and movie routes with durable, idempotent data', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'mezip-built-capture-'));
  const priorWatchPath = process.env.MEZIP_WATCH_CAPTURE_DATA_PATH;
  process.env.MEZIP_WATCH_CAPTURE_DATA_PATH = path.join(directory, 'watch.json');
  let server;
  async function stop() {
    if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  async function start() {
    server = createLocalCaptureServer({ dataPath: path.join(directory, 'events.json') });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    return `http://127.0.0.1:${server.address().port}`;
  }
  async function request(base, route, body) {
    const response = await fetch(base + route, body === undefined ? {} : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const result = await response.json();
    assert.equal(response.status, body === undefined ? 200 : 201, JSON.stringify(result));
    return result.data;
  }
  try {
    const base = await start();
    assert.equal((await request(base, '/v1/x/local-capture/health')).active, true);
    assert.deepEqual((await request(base, '/v1/activity/clicks')).items, []);
    assert.deepEqual((await request(base, '/v1/watch/movies')).items, []);
    const click = { url: 'https://example.com/built-endpoint', title: 'Build route fixture', idempotencyKey: randomUUID() };
    const first = await request(base, '/v1/activity/clicks', click);
    assert.equal(first.record.clickCount, 1);
    assert.equal((await request(base, '/v1/activity/clicks', click)).deduplicated, true);
    const next = await request(base, '/v1/activity/clicks', { ...click, idempotencyKey: randomUUID() });
    assert.equal(next.record.clickCount, 2);
    const detail = await request(base, `/v1/activity/clicks/${first.record.id}`);
    assert.equal(detail.sessions.length, 2);
    assert.ok(detail.sessions.every(session => Number.isFinite(Date.parse(session.clickedAt))));

    const frame = 'data:image/jpeg;base64,/9j/2Q==';
    const progress = {
      sessionId: randomUUID(), captureId: randomUUID(), sequence: 1, sessionActualPlayedSeconds: 1800,
      contentKey: 'movie:build-route', contentType: 'MOVIE', platform: 'HTML5', domain: 'movie.example',
      title: 'Isolated movie fixture', url: 'https://movie.example/play/1', canonicalUrl: 'https://movie.example/play/1',
      durationSeconds: 7200, currentTimeSeconds: 1800, actualPlayedSeconds: 0, eventType: 'pause',
      metadata: { playbackLine: 'Test line', lastFrame: frame, frameStatus: 'captured' },
    };
    const watched = await request(base, '/v1/watch/records', progress);
    assert.equal(watched.record.totalWatchSeconds, 1800);
    assert.equal((await request(base, '/v1/watch/records', progress)).ignored, true);
    const movies = await request(base, '/v1/watch/movies');
    assert.equal(movies.items.length, 1);
    assert.equal(movies.items[0].metadata.hasLastFrame, true);
    assert.equal(movies.items[0].metadata.movieQualified, true);
    assert.equal(movies.items[0].metadata.lastFrame, undefined);
    const watchedDetail = await request(base, `/v1/watch/records/${watched.record.id}`);
    assert.equal(watchedDetail.record.metadata.lastFrame, frame);
    const disk = JSON.parse(await readFile(path.join(directory, 'watch.json'), 'utf8'));
    assert.equal(disk.owners[0].snapshot.checkpoints[0].sequence, 1);
    assert.equal(disk.owners[0].snapshot.checkpoints[0].actualPlayedSeconds, 1800);

    const unauthorized = await fetch(base + '/v1/activity/clicks', { headers: { Origin: 'https://untrusted.example' } });
    assert.equal(unauthorized.status, 403);
    await stop();
    const restarted = await start();
    assert.equal((await request(restarted, '/v1/activity/clicks')).items[0].clickCount, 2);
    assert.equal((await request(restarted, '/v1/activity/clicks', click)).deduplicated, true);
    assert.equal((await request(restarted, '/v1/watch/movies')).items[0].totalWatchSeconds, 1800);
    assert.equal((await request(restarted, '/v1/watch/records', progress)).ignored, true);
  } finally {
    await stop();
    if (priorWatchPath === undefined) delete process.env.MEZIP_WATCH_CAPTURE_DATA_PATH;
    else process.env.MEZIP_WATCH_CAPTURE_DATA_PATH = priorWatchPath;
    // Only remove the unique temporary test directory, never a configured path.
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('mezip-built-capture-'));
    await rm(directory, { recursive: true, force: true });
  }
});
