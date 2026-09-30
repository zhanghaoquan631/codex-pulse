import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { createRecordingStore, MAX_RECORDING_BYTES } from '../client/live-recording-store.mjs';

const makeStore = (indexedDB = new IDBFactory(), extra = {}) => createRecordingStore({ indexedDB, IDBKeyRange, ...extra });
const chunk = value => new Blob([value], { type: 'video/webm' });
const hasCode = code => error => error?.code === code;
const metadata = { layout: 'portrait-split', title: '我的直播', platform: '抖音', mime: 'video/webm;codecs=vp9,opus', startedAt: '2026-09-30T10:20:00+08:00' };

test('parallel data events persist in call order and completion waits for every chunk commit', async () => {
  const store = makeStore();
  const id = await store.createSession(metadata);
  const pieces = Array.from({ length: 40 }, (_, index) => `${index},`);
  const promises = pieces.map(piece => store.append(id, chunk(piece)));
  const completion = store.markComplete(id, { endedAt: '2026-09-30T10:21:00+08:00' });
  await Promise.all(promises);
  const session = await completion;
  assert.equal(session.status, 'complete');
  assert.equal(session.complete, true);
  assert.equal(session.chunkCount, 40);
  assert.equal(session.size, new Blob(pieces).size);
  assert.equal(session.endedAt, '2026-09-30T02:21:00.000Z');
  assert.equal(session.layout, metadata.layout);
  assert.equal(session.platform, metadata.platform);
  assert.equal(session.uploadEligible, true);
  assert.equal(await (await store.readRange(id, 0)).text(), pieces.join(''));
  await store.close();
});

test('byte ranges cross Blob boundaries, keep binary bytes, and never require Blob.arrayBuffer()', async () => {
  const store = makeStore();
  const id = await store.createSession(metadata);
  await store.append(id, new Blob([new Uint8Array([0, 1, 2, 3])]));
  await store.append(id, new Blob([new Uint8Array([4, 5, 6])]));
  await store.append(id, new Blob([new Uint8Array([7, 8, 9, 10])]));
  await store.markComplete(id);
  const original = Blob.prototype.arrayBuffer;
  let range;
  try {
    Blob.prototype.arrayBuffer = () => { throw new Error('whole-file buffer allocation forbidden'); };
    range = await store.readRange(id, 3, 9);
    assert.equal(range.size, 6);
  } finally { Blob.prototype.arrayBuffer = original; }
  assert.deepEqual([...new Uint8Array(await range.arrayBuffer())], [3, 4, 5, 6, 7, 8]);
  assert.equal((await store.readRange(id, 4, 4)).size, 0);
  assert.equal((await store.readRange(id, 11, 11)).size, 0);
  await assert.rejects(store.readRange(id, 0, 12), hasCode('INVALID_RANGE'));
  await assert.rejects(store.readRange(id, -1, 5), hasCode('INVALID_RANGE'));
  await store.close();
});

test('read-only list preserves another tab recording; recovery requires exclusive lock and respects active IDs', async () => {
  const factory = new IDBFactory();
  const first = makeStore(factory);
  const id = await first.createSession(metadata);
  await first.append(id, chunk('saved before page closes'));
  const second = makeStore(factory);
  assert.equal((await second.list())[0].status, 'recording');
  assert.equal((await first.getSession(id)).activeHere, true);
  await assert.rejects(second.recoverAbandoned(), hasCode('RECOVERY_LOCK_REQUIRED'));
  assert.deepEqual(await second.recoverAbandoned({ lockHeld: true, activeIds: [id] }), []);
  assert.equal((await first.getSession(id)).status, 'recording');
  await first.close();
  const recovered = await second.recoverAbandoned({ lockHeld: true });
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].status, 'interrupted');
  assert.equal(recovered[0].complete, false);
  assert.equal(recovered[0].uploadEligible, false);
  assert.equal(recovered[0].chunkCount, 1);
  assert.equal(recovered[0].endedAt, null);
  await assert.rejects(second.markComplete(id), hasCode('SESSION_CLOSED'));
  const exported = await second.exportBlob(id);
  assert.equal(exported.interrupted, true);
  assert.match(exported.fileName, /中断片段\.webm$/);
  assert.equal(await exported.blob.text(), 'saved before page closes');
  await second.close();
});

test('quota failure aborts the failing chunk, retains committed bytes, and blocks all later appends/completion', async () => {
  const store = makeStore();
  const id = await store.createSession(metadata);
  await store.append(id, chunk('already-saved'));
  const db = await store.open();
  const originalTransaction = db.transaction;
  db.transaction = function (...args) {
    const tx = originalTransaction.apply(this, args);
    const originalObjectStore = tx.objectStore;
    tx.objectStore = function (name) {
      const objectStore = originalObjectStore.call(this, name);
      if (name === 'chunks' && tx.mode === 'readwrite') {
        objectStore.add = () => { throw new DOMException('Disk full', 'QuotaExceededError'); };
      }
      return objectStore;
    };
    return tx;
  };
  const failed = store.append(id, chunk('not committed'));
  const later = store.append(id, chunk('must not be appended'));
  const completion = store.markComplete(id);
  await assert.rejects(failed, hasCode('QUOTA_EXCEEDED'));
  await assert.rejects(later, hasCode('QUOTA_EXCEEDED'));
  await assert.rejects(completion, hasCode('QUOTA_EXCEEDED'));
  db.transaction = originalTransaction;
  const session = await store.getSession(id);
  assert.equal(session.size, chunk('already-saved').size);
  assert.equal(session.chunkCount, 1);
  assert.equal(session.complete, false);
  assert.equal(session.status, 'interrupted');
  assert.match(session.error, /存储空间不足/);
  assert.equal(await (await store.exportBlob(id)).blob.text(), 'already-saved');
  await store.close();
});

test('8 GiB maximum can be lowered; size-limit failure preserves previous chunk instead of deleting data', async () => {
  assert.equal(MAX_RECORDING_BYTES, 8589934592);
  assert.throws(() => makeStore(undefined, { maxSize: MAX_RECORDING_BYTES + 1 }), hasCode('INVALID_LIMIT'));
  const store = makeStore(undefined, { maxSize: 10 });
  const id = await store.createSession(metadata);
  await store.append(id, chunk('12345678'));
  await assert.rejects(store.append(id, chunk('901')), hasCode('MAX_SIZE_EXCEEDED'));
  await assert.rejects(store.markComplete(id), hasCode('MAX_SIZE_EXCEEDED'));
  assert.equal((await store.getSession(id)).size, 8);
  assert.equal(await (await store.readRange(id, 0, 8)).text(), '12345678');
  await store.close();
});

test('uploaded recordings persist until authorized deletion and deletion is scoped to one session', async () => {
  const store = makeStore();
  const firstId = await store.createSession(metadata);
  await store.append(firstId, chunk('first video'));
  await store.markComplete(firstId);
  const secondId = await store.createSession({ ...metadata, title: '第二场' });
  await store.append(secondId, chunk('second video'));
  await store.markComplete(secondId);
  await assert.rejects(store.deleteSession(firstId), hasCode('DELETE_NOT_AUTHORIZED'));
  await assert.rejects(store.deleteSession(firstId, { reason: 'cloud-confirmed' }), hasCode('MISSING_RECEIPT'));
  await assert.rejects(store.markUploaded(firstId), hasCode('MISSING_RECEIPT'));
  await store.markUploaded(firstId, { cloudItemId: 'confirmed-content-id' });
  assert.equal((await store.getSession(firstId)).status, 'uploaded');
  assert.equal((await store.list()).length, 1);
  assert.equal((await store.list({ includeUploaded: true })).length, 2);
  assert.equal(await store.deleteSession(firstId, { reason: 'cloud-confirmed' }), true);
  assert.equal(await store.getSession(firstId), null);
  assert.equal(await (await store.exportBlob(secondId)).blob.text(), 'second video');
  assert.equal(await store.deleteSession(secondId, { reason: 'user-confirmed' }), true);
  await store.close();
});

test('incomplete upload requires explicit confirmation and never becomes a complete recording', async () => {
  const store = makeStore();
  const id = await store.createSession(metadata);
  await store.append(id, chunk('truncated video'));
  await store.markInterrupted(id, { reason: '用户设备断开', endedAt: '2026-09-30T02:22:00Z' });
  await assert.rejects(store.markUploaded(id, { cloudItemId: 'partial-id' }), hasCode('INCOMPLETE_RECORDING'));
  await store.markUploaded(id, { cloudItemId: 'partial-id', allowIncomplete: true });
  const session = await store.getSession(id);
  assert.equal(session.complete, false);
  assert.equal(session.endedAt, '2026-09-30T02:22:00.000Z');
  const exported = await store.exportBlob(id);
  assert.match(exported.fileName, /中断片段/);
  assert.equal(exported.interrupted, true);
  await store.close();
});

test('empty events do not create chunks and active recordings cannot be exported/deleted as finished', async () => {
  const store = makeStore();
  const id = await store.createSession(metadata);
  await store.append(id, chunk(''));
  assert.equal((await store.getSession(id)).chunkCount, 0);
  await assert.rejects(store.markComplete(id), hasCode('EMPTY_RECORDING'));
  await assert.rejects(store.exportBlob(id), hasCode('ACTIVE_RECORDING'));
  await assert.rejects(store.deleteSession(id, { reason: 'user-confirmed' }), hasCode('ACTIVE_RECORDING'));
  await store.markInterrupted(id);
  await store.deleteSession(id, { reason: 'user-confirmed' });
  await store.close();
});

test('missing persisted chunks cause an explicit error instead of silently exporting a shortened file', async () => {
  const store = makeStore();
  const id = await store.createSession(metadata);
  await store.append(id, chunk('abc'));
  await store.append(id, chunk('def'));
  await store.markComplete(id);
  await store.transaction(['chunks'], 'readwrite', tx => tx.objectStore('chunks').delete([id, 0]));
  await assert.rejects(store.readRange(id, 0, 6), hasCode('MISSING_CHUNK'));
  assert.equal(await (await store.readRange(id, 3, 6)).text(), 'def');
  await store.close();
});
