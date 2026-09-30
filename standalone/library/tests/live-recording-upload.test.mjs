import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
// Test the exact integrated modules; this asset does not edit the checkout.
import { createRecordingStore } from '../client/live-recording-store.mjs';
import { uploadRecordedReplay } from '../client/live-upload.mjs';

const CHUNK = 8 * 1024 * 1024;
const metadata = { layout: 'portrait', title: '分块录像测试', platform: 'douyin', mime: 'video/webm', startedAt: '2026-09-30T02:00:00Z' };
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

async function recording(pieces, { incomplete = false } = {}) {
  const store = createRecordingStore({ indexedDB: new IDBFactory(), IDBKeyRange });
  const id = await store.createSession(metadata);
  for (const piece of pieces) await store.append(id, new Blob([piece]));
  if (incomplete) await store.markInterrupted(id, { reason: '模拟设备中断' });
  else await store.markComplete(id, { endedAt: '2026-09-30T02:01:00Z' });
  return { store, id };
}

async function sourceFromStore(store, id, reads = []) {
  const session = await store.getSession(id);
  return { ...session, fileName: 'recording.webm', readRange(start, end) {
    reads.push([start, end]);
    assert.ok(end - start <= CHUNK, 'each requested byte range must stay within 8 MiB');
    return store.readRange(id, start, end);
  } };
}

// The caller must receive a content ID, not merely a transport success or
// create-upload complete flag, before changing the persistent local state.
async function uploadAndConfirm(store, id, server, reads = []) {
  const source = await sourceFromStore(store, id, reads);
  const saved = await uploadRecordedReplay(source, { request: server.request });
  assert.ok(saved.saved && saved.item?.id, 'cloud content receipt required');
  await store.markUploaded(id, { cloudItemId: saved.item.id });
  return saved;
}

function replayServer({ failAfterPart = null, loseFirstCompleteResponse = false, missingReceipt = false } = {}) {
  const uploads = new Map();
  const contents = new Map();
  const calls = [];
  let lostPart = false;
  let lostComplete = false;
  async function request(path, options) {
    calls.push({ path, method: options.method,
      body: options.body instanceof Blob ? { size: options.body.size } : structuredClone(options.body) });
    if (path === '/api/live/uploads') {
      const meta = options.body;
      const id = meta.sha256.slice(0, 32);
      const existing = uploads.get(id);
      if (existing) {
        assert.equal(existing.meta.size, meta.size);
        // Match actual worker/live.js: create dedupe has no content receipt.
        return { id, chunkSize: CHUNK, complete: existing.complete };
      }
      uploads.set(id, { id, meta, parts: new Map(), complete: false });
      return { id, chunkSize: CHUNK, complete: false };
    }
    const match = /^\/api\/live\/uploads\/([a-f0-9]{32})\/(parts\/(\d+)|complete)$/.exec(path);
    assert.ok(match, `unexpected request ${path}`);
    const upload = uploads.get(match[1]);
    assert.ok(upload, 'upload must exist');
    if (match[3]) {
      const number = Number(match[3]);
      const bytes = Buffer.from(await options.body.arrayBuffer());
      const expectedSize = number === Math.ceil(upload.meta.size / CHUNK)
        ? upload.meta.size - (number - 1) * CHUNK : CHUNK;
      assert.equal(bytes.length, expectedSize);
      if (upload.parts.has(number)) assert.ok(upload.parts.get(number).equals(bytes), 'retry must preserve exact bytes');
      else upload.parts.set(number, bytes);
      if (number === failAfterPart && !lostPart) {
        lostPart = true;
        throw Error('模拟片段已保存但网络响应丢失');
      }
      return { uploaded: true };
    }
    assert.equal(upload.parts.size, Math.ceil(upload.meta.size / CHUNK));
    const digest = createHash('sha256');
    let total = 0;
    for (let part = 1; part <= upload.parts.size; part++) {
      const bytes = upload.parts.get(part);
      assert.ok(bytes, 'parts must remain sequential');
      digest.update(bytes); total += bytes.length;
    }
    assert.equal(total, upload.meta.size);
    assert.equal(digest.digest('hex'), upload.meta.sha256, 'server must independently verify full-file digest');
    if (!contents.has(upload.meta.sha256)) contents.set(upload.meta.sha256, { id: `content-${contents.size + 1}` });
    upload.complete = true;
    if (loseFirstCompleteResponse && !lostComplete) {
      lostComplete = true;
      throw Error('模拟云端已保存但最终响应丢失');
    }
    return missingReceipt ? { saved: true } : { saved: true, item: contents.get(upload.meta.sha256) };
  }
  return { request, uploads, contents, calls };
}

test('integrated upload hashes persistent bytes in 8 MiB ranges and sends exact chunks with metadata', async () => {
  const pieces = [Buffer.alloc(4 * 1024 * 1024, 1), Buffer.alloc(5 * 1024 * 1024, 2), Buffer.alloc(7 * 1024 * 1024 + 4096, 3)];
  const expectedHash = createHash('sha256');
  for (const piece of pieces) expectedHash.update(piece);
  const { store, id } = await recording(pieces);
  const source = await sourceFromStore(store, id);
  const ranges = [], progress = [], server = replayServer();
  source.readRange = async (start, end) => {
    assert.ok(end - start <= CHUNK); ranges.push([start, end]);
    return store.readRange(id, start, end);
  };
  const saved = await uploadRecordedReplay(source, { request: server.request, onProgress: value => progress.push(value) });
  assert.deepEqual(ranges, [[0, CHUNK], [CHUNK, 2 * CHUNK], [2 * CHUNK, 2 * CHUNK + 4096],
    [0, CHUNK], [CHUNK, 2 * CHUNK], [2 * CHUNK, 2 * CHUNK + 4096]]);
  const begin = server.calls[0].body;
  assert.equal(begin.sha256, expectedHash.digest('hex'));
  assert.equal(begin.title, metadata.title);
  assert.equal(begin.platform, metadata.platform);
  assert.equal(begin.endedAt, '2026-09-30T02:01:00.000Z');
  assert.equal(server.contents.size, 1);
  assert.ok(saved.saved && saved.item.id);
  // upload function alone never silently deletes or marks local state.
  assert.equal((await store.getSession(id)).status, 'complete');
  await store.markUploaded(id, { cloudItemId: saved.item.id });
  assert.equal((await store.getSession(id)).status, 'uploaded');
  assert.equal((await store.getSession(id)).size, 2 * CHUNK + 4096);
  assert.deepEqual(progress.filter(value => value.stage === 'hash').map(value => value.ratio), [CHUNK / source.size, 2 * CHUNK / source.size, 1]);
  assert.deepEqual(progress.at(-1), { stage: 'saved', ratio: 1 });
  await store.close();
});

test('retry after a saved part loses its response reuses exact parts and creates one cloud item', async () => {
  const { store, id } = await recording([Buffer.alloc(2 * CHUNK + 64, 7)]);
  const server = replayServer({ failAfterPart: 2 });
  await assert.rejects(uploadAndConfirm(store, id, server), /响应丢失/);
  assert.equal((await store.getSession(id)).status, 'complete');
  assert.equal((await store.getSession(id)).cloudItemId, null);
  assert.equal(server.contents.size, 0);
  await uploadAndConfirm(store, id, server);
  assert.equal(server.uploads.size, 1);
  assert.equal(server.contents.size, 1);
  assert.equal([...server.uploads.values()][0].parts.size, 3);
  assert.equal((await store.getSession(id)).status, 'uploaded');
  assert.equal(server.calls.filter(call => call.method === 'PUT').length, 5);
  await store.close();
});

test('retry after cloud save loses final receipt requests complete again and never duplicates content', async () => {
  const { store, id } = await recording([Buffer.alloc(128, 3)]);
  const server = replayServer({ loseFirstCompleteResponse: true });
  await assert.rejects(uploadAndConfirm(store, id, server), /最终响应丢失/);
  assert.equal(server.contents.size, 1);
  assert.equal((await store.getSession(id)).status, 'complete');
  assert.equal((await store.getSession(id)).cloudItemId, null);
  const beforeRetry = server.calls.length;
  const saved = await uploadAndConfirm(store, id, server);
  assert.equal(server.contents.size, 1);
  assert.equal(saved.item.id, 'content-1');
  assert.equal((await store.getSession(id)).cloudItemId, 'content-1');
  assert.deepEqual(server.calls.slice(beforeRetry).map(call => call.method), ['POST', 'POST']);
  assert.ok(server.calls.at(-1).path.endsWith('/complete'));
  await store.close();
});

test('saved flag without cloud item ID cannot mark local recording uploaded or remove bytes', async () => {
  const { store, id } = await recording([Buffer.alloc(64, 5)]);
  const server = replayServer({ missingReceipt: true });
  await assert.rejects(uploadAndConfirm(store, id, server), /保存确认|receipt required/);
  assert.equal(server.contents.size, 1);
  const session = await store.getSession(id);
  assert.equal(session.status, 'complete');
  assert.equal(session.cloudItemId, null);
  assert.equal(session.size, 64);
  assert.equal((await store.readRange(id, 0, 64)).size, 64);
  await store.close();
});

test('interrupted and still-recording sessions are rejected before hashing or network; automatic queue selects only complete', async () => {
  const { store, id } = await recording([Buffer.alloc(64, 9)], { incomplete: true });
  const activeId = await store.createSession(metadata);
  await store.append(activeId, new Blob([Buffer.alloc(64, 1)]));
  const completeId = await store.createSession(metadata);
  await store.append(completeId, new Blob([Buffer.alloc(64, 2)]));
  await store.markComplete(completeId);
  const server = replayServer(), reads = [];
  for (const unsafeId of [id, activeId]) {
    const source = await sourceFromStore(store, unsafeId, reads);
    await assert.rejects(uploadRecordedReplay(source, { request: server.request }), /未完整结束/);
  }
  assert.equal(reads.length, 0);
  assert.equal(server.calls.length, 0);
  const queue = (await store.list()).filter(session => session.status === 'complete' && session.complete && session.uploadEligible);
  assert.deepEqual(queue.map(session => session.id), [completeId]);
  await uploadAndConfirm(store, completeId, server);
  assert.equal((await store.getSession(id)).status, 'interrupted');
  assert.equal((await store.getSession(id)).complete, false);
  assert.equal((await store.getSession(activeId)).status, 'recording');
  const exported = await store.exportBlob(id);
  assert.match(exported.fileName, /中断片段/);
  assert.equal(exported.blob.size, 64);
  await store.markInterrupted(activeId);
  await store.close();
});
