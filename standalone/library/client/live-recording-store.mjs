/**
 * Durable, chunked browser recordings. No media devices or network requests.
 * All byte ranges are [start, end), matching Blob.slice().
 */
export const MAX_RECORDING_BYTES = 8 * 1024 * 1024 * 1024;

export class RecordingStoreError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'RecordingStoreError';
    this.code = code;
  }
}

const problem = (code, message) => new RecordingStoreError(code, message);
export function recordingFileName(session) {
  const extension = session.mime.includes('mp4') ? 'mp4' : session.mime.includes('matroska') ? 'mkv' : 'webm';
  const title = (session.title || '直播录像').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80);
  const timestamp = session.startedAt.replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `${title}-${timestamp}${session.complete ? '' : '-中断片段'}.${extension}`;
}
function normalizeFailure(error) {
  if (error instanceof RecordingStoreError) return error;
  if (error?.name === 'QuotaExceededError') {
    return new RecordingStoreError('QUOTA_EXCEEDED', '浏览器存储空间不足。已保存的录像片段仍保留，请停止录制并下载或上传已有片段。', { cause: error });
  }
  return new RecordingStoreError('STORAGE_FAILED', '录像片段未能保存，已保存的片段仍保留。', { cause: error });
}
function isoTime(value, fallback) {
  const parsed = value == null ? fallback : new Date(value);
  if (!(parsed instanceof Date) || !Number.isFinite(parsed.getTime())) throw problem('INVALID_TIME', '录像时间无效。');
  return parsed.toISOString();
}
function label(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}
function checkedId(value) {
  if (typeof value !== 'string' || !value || value.length > 128) throw problem('INVALID_ID', '录像编号无效。');
  return value;
}

export function createRecordingStore(options = {}) {
  return new RecordingStore(options);
}

export class RecordingStore {
  constructor({ indexedDB = globalThis.indexedDB, IDBKeyRange = globalThis.IDBKeyRange,
    dbName = 'lingan-live-recordings-v1', maxSize = MAX_RECORDING_BYTES,
    now = () => new Date(), makeId = () => globalThis.crypto.randomUUID() } = {}) {
    if (!indexedDB || !IDBKeyRange) throw problem('UNSUPPORTED', '当前浏览器不支持本地录像保存，请换用 Chrome 或 Edge。');
    if (!Number.isSafeInteger(maxSize) || maxSize < 1 || maxSize > MAX_RECORDING_BYTES) {
      throw problem('INVALID_LIMIT', '录像大小上限必须为 1 字节至 8 GiB。');
    }
    this.indexedDB = indexedDB;
    this.keyRange = IDBKeyRange;
    this.dbName = dbName;
    this.maxSize = maxSize;
    this.now = now;
    this.makeId = makeId;
    this.writerId = makeId();
    this.dbPromise = null;
    this.queues = new Map();
    this.failures = new Map();
    this.active = new Set();
    this.closed = false;
  }

  async open() {
    if (this.closed) throw problem('CLOSED', '录像存储已关闭。');
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = this.indexedDB.open(this.dbName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('sessions', { keyPath: 'id' });
          const chunks = db.createObjectStore('chunks', { keyPath: ['sessionId', 'index'] });
          chunks.createIndex('bySession', 'sessionId');
          chunks.createIndex('byEnd', ['sessionId', 'end'], { unique: true });
        };
        request.onerror = () => reject(normalizeFailure(request.error));
        request.onblocked = () => reject(problem('DATABASE_BLOCKED', '另一页面占用了录像存储，请关闭旧的录像页面后重试。'));
        request.onsuccess = () => {
          const db = request.result;
          if (this.closed) { db.close(); reject(problem('CLOSED', '录像存储已关闭。')); return; }
          db.onversionchange = () => db.close();
          resolve(db);
        };
      }).catch(error => { this.dbPromise = null; throw error; });
    }
    return this.dbPromise;
  }

  // Work callbacks issue requests synchronously or from IDB request callbacks.
  // Resolve only after transaction commit, never merely after put() success.
  async transaction(stores, mode, work) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(stores, mode, { durability: 'strict' });
      } catch (error) {
        // Older implementations may reject the optional durability argument.
        if (error?.name === 'TypeError') tx = db.transaction(stores, mode);
        else throw normalizeFailure(error);
      }
      let result;
      let explicitError;
      const fail = error => {
        explicitError = error;
        try { tx.abort(); } catch { reject(normalizeFailure(error)); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(normalizeFailure(explicitError ?? tx.error));
      // onerror bubbles from requests, onabort owns the rejection.
      tx.onerror = () => {};
      try { work(tx, value => { result = value; }, fail); }
      catch (error) { fail(error); }
    });
  }

  serialize(id, operation, { ignorePreviousFailure = false } = {}) {
    checkedId(id);
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => {
      if (!ignorePreviousFailure && this.failures.has(id)) throw this.failures.get(id);
      return operation();
    });
    this.queues.set(id, next);
    // Consumers still receive the rejecting promise; internal bookkeeping does
    // not create a second unhandled rejection if an event handler ignores it.
    next.catch(() => {});
    return next;
  }

  present(record) {
    if (!record) return null;
    return { ...record,
      complete: record.complete === true,
      activeHere: record.status === 'recording' && this.active.has(record.id),
      error: this.failures.get(record.id)?.message ?? record.error ?? null,
      uploadEligible: record.complete === true && record.status !== 'uploaded',
    };
  }

  async createSession(metadata = {}) {
    const id = checkedId(metadata.id ?? this.makeId());
    const startedAt = isoTime(metadata.startedAt, this.now());
    const record = { id, layout: label(metadata.layout, 128), title: label(metadata.title, 256),
      platform: label(metadata.platform, 128), mime: label(metadata.mime, 256) || 'video/webm',
      startedAt, createdAt: isoTime(null, this.now()), endedAt: null,
      status: 'recording', complete: false, writerId: this.writerId,
      size: 0, chunkCount: 0, cloudItemId: null, error: null };
    await this.transaction(['sessions'], 'readwrite', (tx, done) => {
      tx.objectStore('sessions').add(record);
      done(record);
    });
    this.active.add(id);
    return id;
  }

  assertWritable(record, id) {
    if (!record) throw problem('NOT_FOUND', '未找到这段录像。');
    if (record.status !== 'recording' || record.writerId !== this.writerId || !this.active.has(id)) {
      throw problem('SESSION_CLOSED', '这段录像已结束或中断，无法再追加片段。');
    }
  }

  append(id, blob) {
    return this.serialize(id, async () => {
      try {
        if (!(blob instanceof Blob)) throw problem('INVALID_CHUNK', '录像片段必须是 Blob。');
        const result = await this.transaction(['sessions', 'chunks'], 'readwrite', (tx, done, fail) => {
          const sessions = tx.objectStore('sessions');
          const request = sessions.get(id);
          request.onsuccess = () => {
            try {
              const record = request.result;
              this.assertWritable(record, id);
              if (record.size + blob.size > this.maxSize) throw problem('MAX_SIZE_EXCEEDED', '录像已达到保存大小上限。已保存的片段仍保留，请停止录制。');
              if (blob.size > 0) {
                tx.objectStore('chunks').add({ sessionId: id, index: record.chunkCount,
                  start: record.size, end: record.size + blob.size, blob });
                record.size += blob.size;
                record.chunkCount += 1;
                sessions.put(record);
              }
              done(record);
            } catch (error) { fail(error); }
          };
        });
        return this.present(result);
      } catch (error) {
        const failure = normalizeFailure(error);
        this.failures.set(id, failure);
        // A quota error can also prevent this small metadata write. The prior
        // atomic chunks remain intact either way, and a reopened recording is
        // incomplete until markComplete explicitly succeeds.
        await this.setInterrupted(id, failure.message, null).catch(() => {});
        throw failure;
      }
    });
  }

  markComplete(id, { endedAt } = {}) {
    return this.serialize(id, async () => {
      const result = await this.transaction(['sessions'], 'readwrite', (tx, done, fail) => {
        const sessions = tx.objectStore('sessions');
        const request = sessions.get(id);
        request.onsuccess = () => {
          try {
            const record = request.result;
            this.assertWritable(record, id);
            if (!record.size || !record.chunkCount) throw problem('EMPTY_RECORDING', '没有可保存的录像片段，不能标记为完整录像。');
            record.status = 'complete';
            record.complete = true;
            record.endedAt = isoTime(endedAt, this.now());
            record.error = null;
            sessions.put(record);
            done(record);
          } catch (error) { fail(error); }
        };
      });
      this.active.delete(id);
      return this.present(result);
    });
  }

  async setInterrupted(id, reason, endedAt) {
    const result = await this.transaction(['sessions'], 'readwrite', (tx, done, fail) => {
      const sessions = tx.objectStore('sessions');
      const request = sessions.get(id);
      request.onsuccess = () => {
        try {
          const record = request.result;
          if (!record) throw problem('NOT_FOUND', '未找到这段录像。');
          if (record.complete || record.status === 'uploaded') throw problem('SESSION_CLOSED', '这段录像已完成，不能改成中断。');
          record.status = 'interrupted';
          record.complete = false;
          record.error = label(reason, 512) || '录制中断，保留已保存的片段。';
          if (endedAt != null) record.endedAt = isoTime(endedAt, this.now());
          sessions.put(record);
          done(record);
        } catch (error) { fail(error); }
      };
    });
    this.active.delete(id);
    return this.present(result);
  }

  markInterrupted(id, { reason, endedAt } = {}) {
    return this.serialize(id, () => this.setInterrupted(id, reason, endedAt), { ignorePreviousFailure: true });
  }

  async getSession(id) {
    checkedId(id);
    const record = await this.transaction(['sessions'], 'readonly', (tx, done) => {
      const request = tx.objectStore('sessions').get(id);
      request.onsuccess = () => done(request.result ?? null);
    });
    return this.present(record);
  }

  async list({ includeUploaded = false } = {}) {
    const records = await this.transaction(['sessions'], 'readonly', (tx, done) => {
      const request = tx.objectStore('sessions').getAll();
      request.onsuccess = () => done(request.result);
    });
    return records.filter(record => includeUploaded || record.status !== 'uploaded')
      .map(record => this.present(record)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  }

  /** Caller must hold the same exclusive Web Lock used for recording. */
  async recoverAbandoned({ activeIds = [], lockHeld = false } = {}) {
    if (!lockHeld) throw problem('RECOVERY_LOCK_REQUIRED', '恢复中断录像前必须确认其他页面没有正在录制。');
    const keep = new Set([...activeIds, ...this.active]);
    const records = await this.list();
    const candidates = records.filter(record => record.status === 'recording' && !keep.has(record.id));
    return Promise.all(candidates.map(record => this.markInterrupted(record.id,
      { reason: '页面关闭或录制异常中断，已保存的片段仍保留。' })));
  }

  async readRange(id, start, end) {
    checkedId(id);
    if (!Number.isSafeInteger(start) || start < 0 || (end != null && (!Number.isSafeInteger(end) || end < start))) {
      throw problem('INVALID_RANGE', '录像读取范围无效。');
    }
    return this.transaction(['sessions', 'chunks'], 'readonly', (tx, done, fail) => {
      const request = tx.objectStore('sessions').get(id);
      request.onsuccess = () => {
        try {
          const record = request.result;
          if (!record) throw problem('NOT_FOUND', '未找到这段录像。');
          const limit = end ?? record.size;
          if (start > record.size || limit > record.size) throw problem('INVALID_RANGE', '读取范围超出了已保存的录像。');
          if (start === limit) { done(new Blob([], { type: record.mime })); return; }
          let expected = start;
          const parts = [];
          const range = this.keyRange.bound([id, start + 1], [id, record.size]);
          const cursorRequest = tx.objectStore('chunks').index('byEnd').openCursor(range);
          cursorRequest.onsuccess = () => {
            try {
              const cursor = cursorRequest.result;
              if (!cursor || cursor.value.start >= limit) {
                if (expected !== limit) throw problem('MISSING_CHUNK', '录像片段不完整，无法读取请求的范围。');
                done(new Blob(parts, { type: record.mime }));
                return;
              }
              const chunk = cursor.value;
              if (chunk.start > expected || chunk.end <= expected || chunk.blob.size !== chunk.end - chunk.start) {
                throw problem('MISSING_CHUNK', '录像片段不完整，无法读取请求的范围。');
              }
              const next = Math.min(limit, chunk.end);
              parts.push(chunk.blob.slice(expected - chunk.start, next - chunk.start));
              expected = next;
              if (expected === limit) { done(new Blob(parts, { type: record.mime })); return; }
              cursor.continue();
            } catch (error) { fail(error); }
          };
        } catch (error) { fail(error); }
      };
    });
  }

  async exportBlob(id) {
    const session = await this.getSession(id);
    if (!session) throw problem('NOT_FOUND', '未找到这段录像。');
    if (session.activeHere) throw problem('ACTIVE_RECORDING', '请先停止录制，再导出录像。');
    const blob = await this.readRange(id, 0, session.size);
    return { blob, session, interrupted: !session.complete,
      fileName: recordingFileName(session) };
  }

  markUploaded(id, { cloudItemId, allowIncomplete = false } = {}) {
    return this.serialize(id, async () => {
      if (!label(cloudItemId, 256)) throw problem('MISSING_RECEIPT', '云端尚未确认保存，不能标记为已上传。');
      const result = await this.transaction(['sessions'], 'readwrite', (tx, done, fail) => {
        const sessions = tx.objectStore('sessions');
        const request = sessions.get(id);
        request.onsuccess = () => {
          try {
            const record = request.result;
            if (!record) throw problem('NOT_FOUND', '未找到这段录像。');
            if (this.active.has(id)) throw problem('ACTIVE_RECORDING', '录制仍在进行，不能标记为已上传。');
            if (!record.complete && !allowIncomplete) throw problem('INCOMPLETE_RECORDING', '这段录像曾中断，需要用户确认后才能上传中断片段。');
            record.status = 'uploaded';
            record.cloudItemId = label(cloudItemId, 256);
            record.uploadedAt = isoTime(null, this.now());
            sessions.put(record);
            done(record);
          } catch (error) { fail(error); }
        };
      });
      return this.present(result);
    }, { ignorePreviousFailure: true });
  }

  deleteSession(id, { reason } = {}) {
    return this.serialize(id, () => {
      if (!['user-confirmed', 'cloud-confirmed'].includes(reason)) {
        throw problem('DELETE_NOT_AUTHORIZED', '只能在用户明确删除或云端确认保存后删除本地录像。');
      }
      if (this.active.has(id)) throw problem('ACTIVE_RECORDING', '请先停止录制，再删除本地录像。');
      return this.transaction(['sessions', 'chunks'], 'readwrite', (tx, done, fail) => {
        const sessions = tx.objectStore('sessions');
        const request = sessions.get(id);
        request.onsuccess = () => {
          const record = request.result;
          if (!record) { done(false); return; }
          if (reason === 'cloud-confirmed' && (record.status !== 'uploaded' || !record.cloudItemId)) {
            fail(problem('MISSING_RECEIPT', '云端尚未确认保存，本地录像仍保留。'));
            return;
          }
          const cursorRequest = tx.objectStore('chunks').index('bySession').openCursor(this.keyRange.only(id));
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (cursor) { cursor.delete(); cursor.continue(); }
            else { sessions.delete(id); done(true); }
          };
        };
      });
    }, { ignorePreviousFailure: true });
  }

  async close() {
    await Promise.allSettled([...this.queues.values()]);
    this.closed = true;
    this.active.clear();
    if (this.dbPromise) (await this.dbPromise.catch(() => null))?.close();
    this.dbPromise = null;
  }
}
