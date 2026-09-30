(() => {
  // client/live-composition.mjs
  var layouts = Object.freeze({
    presenter: { name: "\u4EBA\u7269\u5168\u5C4F", width: 1920, height: 1080, camera: { x: 0, y: 0, width: 1920, height: 1080, fit: "cover" } },
    "screen-inset": { name: "\u5C4F\u5E55 + \u4EBA\u7269\u5C0F\u7A97", width: 1920, height: 1080, screen: { x: 0, y: 0, width: 1920, height: 1080, fit: "contain" }, camera: { x: 28, y: 772, width: 380, height: 280, fit: "contain" } },
    portrait: { name: "\u4E0A\u5C4F\u5E55 + \u4E0B\u4EBA\u7269", width: 1080, height: 1920, screen: { x: 0, y: 240, width: 1080, height: 608, fit: "contain" }, camera: { x: 0, y: 848, width: 1080, height: 1072, fit: "cover" } }
  });
  function defaultLayoutSettings(layoutId) {
    const layout = layouts[layoutId];
    if (!layout) throw Error("\u8BF7\u9009\u62E9\u4E00\u79CD\u5F55\u5236\u5E03\u5C40");
    return Object.fromEntries(["screen", "camera"].filter((source) => layout[source]).map((source) => {
      const box = layout[source];
      return [source, { x: box.x / layout.width * 100, y: box.y / layout.height * 100, width: box.width / layout.width * 100, height: box.height / layout.height * 100, fit: box.fit }];
    }));
  }
  function normalizeLayoutSettings(layoutId, settings2) {
    const defaults = defaultLayoutSettings(layoutId), result = {};
    const finite = (value, fallback) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    for (const [source, base] of Object.entries(defaults)) {
      const box = settings2?.[source] || {}, width = clamp(finite(box.width, base.width), 5, 100), height = clamp(finite(box.height, base.height), 5, 100);
      result[source] = { x: clamp(finite(box.x, base.x), 0, 100 - width), y: clamp(finite(box.y, base.y), 0, 100 - height), width, height, fit: ["contain", "cover"].includes(box.fit) ? box.fit : base.fit };
    }
    return result;
  }

  // client/live-capture.mjs
  var codecs = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm"];
  function createMediaRecorder(stream, Recorder = MediaRecorder) {
    for (const mimeType of codecs) {
      if (!Recorder.isTypeSupported(mimeType)) continue;
      try {
        return new Recorder(stream, { mimeType, videoBitsPerSecond: 5e6, audioBitsPerSecond: 16e4 });
      } catch {
      }
    }
    throw Error("\u5F53\u524D\u6D4F\u89C8\u5668\u65E0\u6CD5\u7F16\u7801\u5F55\u50CF\uFF0C\u8BF7\u4F7F\u7528\u65B0\u7248 Chrome \u6216 Edge\u3002");
  }
  function captureSupported(scope = globalThis) {
    return Boolean(scope.isSecureContext && scope.navigator?.mediaDevices?.getUserMedia && scope.navigator.mediaDevices.getDisplayMedia && scope.MediaRecorder && (scope.AudioContext || scope.webkitAudioContext) && scope.MediaStreamTrackProcessor && scope.MediaStreamTrackGenerator && scope.OffscreenCanvas && scope.VideoFrame && scope.Worker && scope.indexedDB);
  }
  async function recordingLock() {
    if (!navigator.locks) throw Error("\u8BF7\u7528\u65B0\u7248 Chrome \u6216 Edge \u6253\u5F00\u7F51\u7AD9\u5F55\u5236\u3002");
    return new Promise((resolve, reject) => {
      navigator.locks.request("lingan-live-recording", { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock) {
          resolve(null);
          return;
        }
        let release;
        const held = new Promise((done) => release = done);
        resolve(release);
        await held;
      }).catch(reject);
    });
  }
  var LiveCapture = class {
    constructor({ store: store2, onState = () => {
    }, onComplete = () => {
    }, onDevices = () => {
    }, onPreview = () => {
    } }) {
      Object.assign(this, { store: store2, onState, onComplete, onDevices, onPreview });
      this.phase = "idle";
      this.streams = [];
    }
    emit(phase, message) {
      this.phase = phase;
      this.onState({ phase, message, layoutId: this.layoutId, sessionId: this.sessionId, systemAudio: this.systemAudio, elapsed: this.elapsed() });
    }
    elapsed() {
      return this.startAt ? Math.max(0, ((this.pauseAt || performance.now()) - this.startAt - this.pausedMs) / 1e3) : 0;
    }
    start(layoutId, options = {}) {
      if (this.phase !== "idle") return Promise.resolve();
      if (!layouts[layoutId]) return Promise.reject(Error("\u8BF7\u9009\u62E9\u4E00\u79CD\u753B\u9762\u5E03\u5C40"));
      if (!captureSupported()) return Promise.reject(Error("\u7F51\u9875\u5F55\u5236\u9700\u8981\u7535\u8111\u4E0A\u7684\u65B0\u7248 Chrome \u6216 Edge\u3002\u8BF7\u7528\u8FD9\u4E9B\u6D4F\u89C8\u5668\u6253\u5F00\u7F51\u7AD9\u3002"));
      this.layoutId = layoutId;
      this.layoutSettings = normalizeLayoutSettings(layoutId, options.layoutSettings);
      this.options = options;
      this.streams = [];
      this.cancelled = false;
      this.sessionId = null;
      this.writeError = null;
      this.interrupted = null;
      this.finishPromise = null;
      this.recorder = null;
      this.startupError = null;
      this.startAt = 0;
      this.pausedMs = 0;
      this.pauseAt = 0;
      this.pending = Promise.resolve();
      this.systemAudio = false;
      this.emit("starting", layoutId === "presenter" ? "\u8BF7\u5141\u8BB8\u6444\u50CF\u5934\u548C\u9EA6\u514B\u98CE\uFF0C\u968F\u540E\u81EA\u52A8\u5F00\u59CB\u5F55\u5236\u3002" : "\u8BF7\u9009\u62E9\u5171\u4EAB\u7684\u5C4F\u5E55\u6216\u7A97\u53E3\uFF1B\u60F3\u5F55\u7535\u8111\u58F0\u97F3\uFF0C\u8BF7\u52FE\u9009\u5171\u4EAB\u58F0\u97F3\u3002");
      let displayRequest;
      try {
        displayRequest = layoutId === "presenter" ? Promise.resolve(null) : navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: options.systemAudio !== false, systemAudio: "include", selfBrowserSurface: "exclude", surfaceSwitching: "exclude" });
      } catch (error) {
        this.emit("idle", "\u5C4F\u5E55\u5171\u4EAB\u672A\u5F00\u59CB\u3002");
        return Promise.reject(error);
      }
      displayRequest.catch(() => {
      });
      try {
        this.audioContext = new (globalThis.AudioContext || globalThis.webkitAudioContext)({ sampleRate: 48e3 });
      } catch (error) {
        this.cancelled = true;
        displayRequest.then((stream) => stream?.getTracks().forEach((track) => track.stop())).catch(() => {
        });
        this.emit("idle", "\u58F0\u97F3\u8BBE\u5907\u672A\u51C6\u5907\u597D\uFF0C\u8BF7\u91CD\u65B0\u70B9\u51FB\u5E03\u5C40\u3002");
        return Promise.reject(error);
      }
      this.audioContext.resume().catch(() => {
      });
      displayRequest = displayRequest.then((stream) => {
        if (stream) {
          this.streams.push(stream);
          if (this.cancelled) stream.getTracks().forEach((track) => track.stop());
        }
        return stream;
      });
      return this.prepare(displayRequest, options).catch(async (error) => {
        this.cancelled = true;
        await this.cleanup();
        if (this.sessionId) {
          try {
            await this.store.markInterrupted(this.sessionId, { reason: "\u542F\u52A8\u672A\u5B8C\u6210", endedAt: (/* @__PURE__ */ new Date()).toISOString() });
          } catch {
          }
        }
        this.emit("idle", error.name === "NotAllowedError" ? "\u5F55\u5236\u672A\u5F00\u59CB\uFF1A\u8BBE\u5907\u6216\u5C4F\u5E55\u5171\u4EAB\u5C1A\u672A\u6388\u6743\u3002\u53EF\u4EE5\u91CD\u65B0\u70B9\u51FB\u5E03\u5C40\u3002" : error.name === "NotFoundError" ? "\u672A\u627E\u5230\u6444\u50CF\u5934\u6216\u9EA6\u514B\u98CE\uFF0C\u8BF7\u8FDE\u63A5\u8BBE\u5907\uFF0C\u6216\u5173\u95ED\u9EA6\u514B\u98CE\u540E\u91CD\u65B0\u9009\u62E9\u3002" : error.name === "NotReadableError" ? "\u6444\u50CF\u5934\u6216\u9EA6\u514B\u98CE\u6B63\u5728\u88AB\u5176\u4ED6\u7A0B\u5E8F\u5360\u7528\uFF0C\u8BF7\u5173\u95ED\u5360\u7528\u540E\u91CD\u8BD5\u3002" : error.message || "\u5F55\u5236\u672A\u5F00\u59CB\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u8BBE\u5907\u3002");
        throw error;
      });
    }
    async prepare(displayRequest, options) {
      this.releaseLock = await recordingLock();
      if (!this.releaseLock) {
        this.cancelled = true;
        displayRequest.then((stream) => stream?.getTracks().forEach((track) => track.stop())).catch(() => {
        });
        throw Error("\u53E6\u4E00\u9875\u6B63\u5728\u5F55\u5236\uFF0C\u8BF7\u5148\u5728\u90A3\u4E00\u9875\u505C\u6B62\u3002");
      }
      const display = await displayRequest;
      if (this.cancelled) throw Error("\u5DF2\u53D6\u6D88\u5F55\u5236\u3002");
      const camera = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 }, ...options.cameraId ? { deviceId: { exact: options.cameraId } } : {} }, audio: options.microphone === false ? false : { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...options.microphoneId ? { deviceId: { exact: options.microphoneId } } : {} } });
      this.streams.push(camera);
      if (this.cancelled) throw Error("\u5DF2\u53D6\u6D88\u5F55\u5236\u3002");
      this.onDevices(await navigator.mediaDevices.enumerateDevices());
      const destination = this.audioContext.createMediaStreamDestination();
      this.destinationStream = destination.stream;
      this.gains = {};
      let audioTracks = 0;
      for (const [key2, stream, volume] of [["microphone", camera, options.microphoneVolume ?? 1], ["system", display, options.systemVolume ?? 0.5]]) {
        const tracks = stream?.getAudioTracks() || [];
        if (!tracks.length) continue;
        const source = this.audioContext.createMediaStreamSource(new MediaStream(tracks)), gain = this.audioContext.createGain();
        gain.gain.value = volume;
        source.connect(gain);
        gain.connect(destination);
        this.gains[key2] = gain;
        audioTracks += tracks.length;
        if (key2 === "system") this.systemAudio = true;
      }
      await this.audioContext.resume();
      const cameraVideo = camera.getVideoTracks()[0];
      if (!cameraVideo) throw Error("\u6444\u50CF\u5934\u672A\u63D0\u4F9B\u753B\u9762\u3002");
      const processor = new MediaStreamTrackProcessor({ track: cameraVideo }), generator = new MediaStreamTrackGenerator({ kind: "video" });
      const displayVideo = display?.getVideoTracks()[0], screen = displayVideo ? new MediaStreamTrackProcessor({ track: displayVideo }).readable : null;
      this.output = new MediaStream([generator, ...audioTracks ? destination.stream.getAudioTracks() : []]);
      this.worker = new Worker("/live-render-worker.js", { type: "module", name: "\u7075\u611F\u5E93\u5F55\u5236\u753B\u9762" });
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error("\u753B\u9762\u51C6\u5907\u8D85\u65F6\uFF0C\u8BF7\u786E\u8BA4\u6444\u50CF\u5934\u6B63\u5E38\u3002")), 2e4);
        this.worker.onerror = () => {
          clearTimeout(timeout);
          this.startupError = Error("\u753B\u9762\u5408\u6210\u672A\u542F\u52A8\uFF0C\u8BF7\u5237\u65B0\u7F51\u7AD9\u540E\u91CD\u8BD5\u3002");
          reject(this.startupError);
        };
        this.worker.onmessage = (event) => {
          if (event.data.type === "ready") {
            clearTimeout(timeout);
            resolve();
          }
          if (event.data.type === "error") {
            clearTimeout(timeout);
            this.startupError = Error(event.data.message);
            reject(this.startupError);
          }
        };
        const transfers = [processor.readable, generator.writable, ...screen ? [screen] : []];
        this.worker.postMessage({ type: "start", layoutId: this.layoutId, settings: this.layoutSettings, camera: processor.readable, screen, output: generator.writable }, transfers);
      });
      if (this.cancelled) throw Error("\u5DF2\u53D6\u6D88\u5F55\u5236\u3002");
      this.recorder = createMediaRecorder(this.output);
      const mime = this.recorder.mimeType;
      const at = /* @__PURE__ */ new Date();
      this.sessionId = await this.store.createSession({ layout: this.layoutId, title: options.title?.trim() || layouts[this.layoutId].name + " \xB7 " + at.toLocaleString(), platform: options.platform || "douyin", mime, startedAt: at.toISOString() });
      if (this.cancelled) throw Error("\u5DF2\u53D6\u6D88\u5F55\u5236\u3002");
      if (this.startupError) throw this.startupError;
      if ([cameraVideo, displayVideo, generator].filter(Boolean).some((track) => track.readyState === "ended")) throw Error("\u8F93\u5165\u753B\u9762\u5DF2\u505C\u6B62\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002");
      this.recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        this.pending = this.pending.then(() => this.store.append(this.sessionId, event.data)).catch((error) => {
          this.writeError = error;
          this.interrupted = "\u672C\u673A\u5B58\u50A8\u5199\u5165\u5931\u8D25";
          this.stop();
        });
      };
      this.done = new Promise((resolve) => this.resolveDone = resolve);
      this.recorder.onstop = () => {
        this.finish();
      };
      this.recorder.onerror = () => {
        this.interrupted = "\u6D4F\u89C8\u5668\u7F16\u7801\u4E2D\u65AD";
        this.stop();
      };
      this.worker.onerror = () => {
        this.interrupted = "\u753B\u9762\u5408\u6210\u4E2D\u65AD";
        this.stop();
      };
      this.worker.onmessage = (event) => {
        if (event.data.type === "error") {
          this.interrupted = event.data.message;
          this.stop();
        }
        if (event.data.type === "frame") this.lastFrameAt = performance.now();
      };
      for (const track of [...camera.getVideoTracks(), ...display?.getVideoTracks() || []]) track.addEventListener("ended", () => this.stop(), { once: true });
      this.recorder.start(2e3);
      this.startAt = performance.now();
      this.lastFrameAt = this.startAt;
      this.onPreview(this.output);
      this.emit("recording", this.layoutId !== "presenter" && !this.systemAudio && options.systemAudio !== false ? "\u6B63\u5728\u5F55\u5236\u3002\u672A\u6536\u5230\u7535\u8111\u58F0\u97F3\uFF1B\u4E0B\u6B21\u5171\u4EAB\u65F6\u52FE\u9009\u5171\u4EAB\u58F0\u97F3\u3002" : "\u6B63\u5728\u6309\u56FA\u5B9A\u753B\u9762\u5F55\u5236\u3002\u505C\u6B62\u540E\u81EA\u52A8\u4FDD\u5B58\u56DE\u653E\u3002");
      return this.sessionId;
    }
    volume(key2, value) {
      if (this.gains?.[key2]) this.gains[key2].gain.value = Math.max(0, Math.min(1.5, Number(value) || 0));
    }
    updateLayout(settings2) {
      if (!["starting", "recording", "paused"].includes(this.phase)) return false;
      this.layoutSettings = normalizeLayoutSettings(this.layoutId, settings2);
      this.worker?.postMessage({ type: "layout", settings: this.layoutSettings });
      return true;
    }
    pause() {
      if (this.phase === "recording") {
        this.recorder.pause();
        this.pauseAt = performance.now();
        this.emit("paused", "\u5DF2\u6682\u505C\u5F55\u5236\uFF0C\u70B9\u51FB\u7EE7\u7EED\u540E\u63A5\u7740\u4FDD\u5B58\u540C\u4E00\u6BB5\u56DE\u653E\u3002");
      } else if (this.phase === "paused") {
        this.recorder.resume();
        this.pausedMs += performance.now() - this.pauseAt;
        this.pauseAt = 0;
        this.emit("recording", "\u6B63\u5728\u6309\u56FA\u5B9A\u753B\u9762\u5F55\u5236\u3002");
      }
    }
    stop() {
      if (this.phase === "starting") {
        this.cancelled = true;
        for (const stream of this.streams) stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!["recording", "paused"].includes(this.phase)) return this.done;
      this.emit("finishing", "\u6B63\u5728\u7ED3\u675F\u5F55\u5236\u5E76\u4FDD\u5B58\u6700\u540E\u4E00\u6BB5\u2026");
      if (this.recorder.state !== "inactive") this.recorder.stop();
      return this.done;
    }
    async finish() {
      if (this.finishPromise) return this.finishPromise;
      this.finishPromise = (async () => {
        const sessionId = this.sessionId;
        this.emit("finishing", "\u6B63\u5728\u4FDD\u5B58\u5F55\u5236\u2026");
        try {
          await this.pending;
          await this.cleanup();
          if (this.writeError || this.interrupted) {
            await this.store.markInterrupted(sessionId, { reason: this.interrupted || "\u5F55\u5236\u4E2D\u65AD", endedAt: (/* @__PURE__ */ new Date()).toISOString() });
            throw Error(this.writeError?.code === "QUOTA_EXCEEDED" ? "\u672C\u673A\u5B58\u50A8\u7A7A\u95F4\u4E0D\u8DB3\uFF0C\u5DF2\u505C\u6B62\u3002\u5DF2\u5199\u5165\u7684\u7247\u6BB5\u7559\u5728\u4E0B\u65B9\u672C\u673A\u5F55\u5236\u4E2D\u3002" : "\u5F55\u5236\u4E2D\u65AD\uFF0C\u5DF2\u4FDD\u7559\u5199\u5165\u7684\u7247\u6BB5\u3002\u8BF7\u5728\u4E0B\u65B9\u4E0B\u8F7D\u68C0\u67E5\u3002");
          }
          await this.store.markComplete(sessionId, { endedAt: (/* @__PURE__ */ new Date()).toISOString() });
          this.emit("idle", "\u5F55\u5236\u5DF2\u5B8C\u6574\u4FDD\u5B58\u5728\u672C\u673A\uFF0C\u6B63\u5728\u4E0A\u4F20\u5230\u5F85\u5904\u7406\u4E0E\u56DE\u653E\u5386\u53F2\u3002");
          this.onComplete(sessionId);
        } catch (error) {
          try {
            await this.store.markInterrupted(sessionId, { reason: this.interrupted || "\u5F55\u5236\u672A\u5B8C\u6210", endedAt: (/* @__PURE__ */ new Date()).toISOString() });
          } catch {
          }
          this.emit("idle", error.message || "\u5F55\u5236\u672A\u5B8C\u6210\uFF0C\u5DF2\u4FDD\u7559\u672C\u673A\u7247\u6BB5\u3002");
        } finally {
          this.resolveDone?.(sessionId);
        }
        return sessionId;
      })();
      return this.finishPromise;
    }
    async cleanup() {
      try {
        for (const stream of this.streams) for (const track of stream.getTracks()) track.stop();
        this.output?.getTracks().forEach((track) => track.stop());
        this.destinationStream?.getTracks().forEach((track) => track.stop());
        this.worker?.terminate();
        this.worker = null;
        try {
          await this.audioContext?.close();
        } catch {
        }
        this.onPreview(null);
      } finally {
        this.releaseLock?.();
        this.releaseLock = null;
      }
    }
  };

  // client/live-recording-store.mjs
  var MAX_RECORDING_BYTES = 8 * 1024 * 1024 * 1024;
  var RecordingStoreError = class extends Error {
    constructor(code, message, options) {
      super(message, options);
      this.name = "RecordingStoreError";
      this.code = code;
    }
  };
  var problem = (code, message) => new RecordingStoreError(code, message);
  function recordingFileName(session) {
    const extension = session.mime.includes("mp4") ? "mp4" : session.mime.includes("matroska") ? "mkv" : "webm";
    const title = (session.title || "\u76F4\u64AD\u5F55\u50CF").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 80);
    const timestamp = session.startedAt.replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    return `${title}-${timestamp}${session.complete ? "" : "-\u4E2D\u65AD\u7247\u6BB5"}.${extension}`;
  }
  function normalizeFailure(error) {
    if (error instanceof RecordingStoreError) return error;
    if (error?.name === "QuotaExceededError") {
      return new RecordingStoreError("QUOTA_EXCEEDED", "\u6D4F\u89C8\u5668\u5B58\u50A8\u7A7A\u95F4\u4E0D\u8DB3\u3002\u5DF2\u4FDD\u5B58\u7684\u5F55\u50CF\u7247\u6BB5\u4ECD\u4FDD\u7559\uFF0C\u8BF7\u505C\u6B62\u5F55\u5236\u5E76\u4E0B\u8F7D\u6216\u4E0A\u4F20\u5DF2\u6709\u7247\u6BB5\u3002", { cause: error });
    }
    return new RecordingStoreError("STORAGE_FAILED", "\u5F55\u50CF\u7247\u6BB5\u672A\u80FD\u4FDD\u5B58\uFF0C\u5DF2\u4FDD\u5B58\u7684\u7247\u6BB5\u4ECD\u4FDD\u7559\u3002", { cause: error });
  }
  function isoTime(value, fallback) {
    const parsed = value == null ? fallback : new Date(value);
    if (!(parsed instanceof Date) || !Number.isFinite(parsed.getTime())) throw problem("INVALID_TIME", "\u5F55\u50CF\u65F6\u95F4\u65E0\u6548\u3002");
    return parsed.toISOString();
  }
  function label(value, maxLength) {
    return String(value ?? "").trim().slice(0, maxLength);
  }
  function checkedId(value) {
    if (typeof value !== "string" || !value || value.length > 128) throw problem("INVALID_ID", "\u5F55\u50CF\u7F16\u53F7\u65E0\u6548\u3002");
    return value;
  }
  function createRecordingStore(options = {}) {
    return new RecordingStore(options);
  }
  var RecordingStore = class {
    constructor({
      indexedDB = globalThis.indexedDB,
      IDBKeyRange = globalThis.IDBKeyRange,
      dbName = "lingan-live-recordings-v1",
      maxSize = MAX_RECORDING_BYTES,
      now = () => /* @__PURE__ */ new Date(),
      makeId = () => globalThis.crypto.randomUUID()
    } = {}) {
      if (!indexedDB || !IDBKeyRange) throw problem("UNSUPPORTED", "\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u672C\u5730\u5F55\u50CF\u4FDD\u5B58\uFF0C\u8BF7\u6362\u7528 Chrome \u6216 Edge\u3002");
      if (!Number.isSafeInteger(maxSize) || maxSize < 1 || maxSize > MAX_RECORDING_BYTES) {
        throw problem("INVALID_LIMIT", "\u5F55\u50CF\u5927\u5C0F\u4E0A\u9650\u5FC5\u987B\u4E3A 1 \u5B57\u8282\u81F3 8 GiB\u3002");
      }
      this.indexedDB = indexedDB;
      this.keyRange = IDBKeyRange;
      this.dbName = dbName;
      this.maxSize = maxSize;
      this.now = now;
      this.makeId = makeId;
      this.writerId = makeId();
      this.dbPromise = null;
      this.queues = /* @__PURE__ */ new Map();
      this.failures = /* @__PURE__ */ new Map();
      this.active = /* @__PURE__ */ new Set();
      this.closed = false;
    }
    async open() {
      if (this.closed) throw problem("CLOSED", "\u5F55\u50CF\u5B58\u50A8\u5DF2\u5173\u95ED\u3002");
      if (!this.dbPromise) {
        this.dbPromise = new Promise((resolve, reject) => {
          const request2 = this.indexedDB.open(this.dbName, 1);
          request2.onupgradeneeded = () => {
            const db = request2.result;
            db.createObjectStore("sessions", { keyPath: "id" });
            const chunks = db.createObjectStore("chunks", { keyPath: ["sessionId", "index"] });
            chunks.createIndex("bySession", "sessionId");
            chunks.createIndex("byEnd", ["sessionId", "end"], { unique: true });
          };
          request2.onerror = () => reject(normalizeFailure(request2.error));
          request2.onblocked = () => reject(problem("DATABASE_BLOCKED", "\u53E6\u4E00\u9875\u9762\u5360\u7528\u4E86\u5F55\u50CF\u5B58\u50A8\uFF0C\u8BF7\u5173\u95ED\u65E7\u7684\u5F55\u50CF\u9875\u9762\u540E\u91CD\u8BD5\u3002"));
          request2.onsuccess = () => {
            const db = request2.result;
            if (this.closed) {
              db.close();
              reject(problem("CLOSED", "\u5F55\u50CF\u5B58\u50A8\u5DF2\u5173\u95ED\u3002"));
              return;
            }
            db.onversionchange = () => db.close();
            resolve(db);
          };
        }).catch((error) => {
          this.dbPromise = null;
          throw error;
        });
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
          tx = db.transaction(stores, mode, { durability: "strict" });
        } catch (error) {
          if (error?.name === "TypeError") tx = db.transaction(stores, mode);
          else throw normalizeFailure(error);
        }
        let result;
        let explicitError;
        const fail = (error) => {
          explicitError = error;
          try {
            tx.abort();
          } catch {
            reject(normalizeFailure(error));
          }
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(normalizeFailure(explicitError ?? tx.error));
        tx.onerror = () => {
        };
        try {
          work(tx, (value) => {
            result = value;
          }, fail);
        } catch (error) {
          fail(error);
        }
      });
    }
    serialize(id, operation, { ignorePreviousFailure = false } = {}) {
      checkedId(id);
      const previous = this.queues.get(id) ?? Promise.resolve();
      const next = previous.catch(() => {
      }).then(() => {
        if (!ignorePreviousFailure && this.failures.has(id)) throw this.failures.get(id);
        return operation();
      });
      this.queues.set(id, next);
      next.catch(() => {
      });
      return next;
    }
    present(record) {
      if (!record) return null;
      return {
        ...record,
        complete: record.complete === true,
        activeHere: record.status === "recording" && this.active.has(record.id),
        error: this.failures.get(record.id)?.message ?? record.error ?? null,
        uploadEligible: record.complete === true && record.status !== "uploaded"
      };
    }
    async createSession(metadata = {}) {
      const id = checkedId(metadata.id ?? this.makeId());
      const startedAt = isoTime(metadata.startedAt, this.now());
      const record = {
        id,
        layout: label(metadata.layout, 128),
        title: label(metadata.title, 256),
        platform: label(metadata.platform, 128),
        mime: label(metadata.mime, 256) || "video/webm",
        startedAt,
        createdAt: isoTime(null, this.now()),
        endedAt: null,
        status: "recording",
        complete: false,
        writerId: this.writerId,
        size: 0,
        chunkCount: 0,
        cloudItemId: null,
        error: null
      };
      await this.transaction(["sessions"], "readwrite", (tx, done) => {
        tx.objectStore("sessions").add(record);
        done(record);
      });
      this.active.add(id);
      return id;
    }
    assertWritable(record, id) {
      if (!record) throw problem("NOT_FOUND", "\u672A\u627E\u5230\u8FD9\u6BB5\u5F55\u50CF\u3002");
      if (record.status !== "recording" || record.writerId !== this.writerId || !this.active.has(id)) {
        throw problem("SESSION_CLOSED", "\u8FD9\u6BB5\u5F55\u50CF\u5DF2\u7ED3\u675F\u6216\u4E2D\u65AD\uFF0C\u65E0\u6CD5\u518D\u8FFD\u52A0\u7247\u6BB5\u3002");
      }
    }
    append(id, blob) {
      return this.serialize(id, async () => {
        try {
          if (!(blob instanceof Blob)) throw problem("INVALID_CHUNK", "\u5F55\u50CF\u7247\u6BB5\u5FC5\u987B\u662F Blob\u3002");
          const result = await this.transaction(["sessions", "chunks"], "readwrite", (tx, done, fail) => {
            const sessions = tx.objectStore("sessions");
            const request2 = sessions.get(id);
            request2.onsuccess = () => {
              try {
                const record = request2.result;
                this.assertWritable(record, id);
                if (record.size + blob.size > this.maxSize) throw problem("MAX_SIZE_EXCEEDED", "\u5F55\u50CF\u5DF2\u8FBE\u5230\u4FDD\u5B58\u5927\u5C0F\u4E0A\u9650\u3002\u5DF2\u4FDD\u5B58\u7684\u7247\u6BB5\u4ECD\u4FDD\u7559\uFF0C\u8BF7\u505C\u6B62\u5F55\u5236\u3002");
                if (blob.size > 0) {
                  tx.objectStore("chunks").add({
                    sessionId: id,
                    index: record.chunkCount,
                    start: record.size,
                    end: record.size + blob.size,
                    blob
                  });
                  record.size += blob.size;
                  record.chunkCount += 1;
                  sessions.put(record);
                }
                done(record);
              } catch (error) {
                fail(error);
              }
            };
          });
          return this.present(result);
        } catch (error) {
          const failure = normalizeFailure(error);
          this.failures.set(id, failure);
          await this.setInterrupted(id, failure.message, null).catch(() => {
          });
          throw failure;
        }
      });
    }
    markComplete(id, { endedAt } = {}) {
      return this.serialize(id, async () => {
        const result = await this.transaction(["sessions"], "readwrite", (tx, done, fail) => {
          const sessions = tx.objectStore("sessions");
          const request2 = sessions.get(id);
          request2.onsuccess = () => {
            try {
              const record = request2.result;
              this.assertWritable(record, id);
              if (!record.size || !record.chunkCount) throw problem("EMPTY_RECORDING", "\u6CA1\u6709\u53EF\u4FDD\u5B58\u7684\u5F55\u50CF\u7247\u6BB5\uFF0C\u4E0D\u80FD\u6807\u8BB0\u4E3A\u5B8C\u6574\u5F55\u50CF\u3002");
              record.status = "complete";
              record.complete = true;
              record.endedAt = isoTime(endedAt, this.now());
              record.error = null;
              sessions.put(record);
              done(record);
            } catch (error) {
              fail(error);
            }
          };
        });
        this.active.delete(id);
        return this.present(result);
      });
    }
    async setInterrupted(id, reason, endedAt) {
      const result = await this.transaction(["sessions"], "readwrite", (tx, done, fail) => {
        const sessions = tx.objectStore("sessions");
        const request2 = sessions.get(id);
        request2.onsuccess = () => {
          try {
            const record = request2.result;
            if (!record) throw problem("NOT_FOUND", "\u672A\u627E\u5230\u8FD9\u6BB5\u5F55\u50CF\u3002");
            if (record.complete || record.status === "uploaded") throw problem("SESSION_CLOSED", "\u8FD9\u6BB5\u5F55\u50CF\u5DF2\u5B8C\u6210\uFF0C\u4E0D\u80FD\u6539\u6210\u4E2D\u65AD\u3002");
            record.status = "interrupted";
            record.complete = false;
            record.error = label(reason, 512) || "\u5F55\u5236\u4E2D\u65AD\uFF0C\u4FDD\u7559\u5DF2\u4FDD\u5B58\u7684\u7247\u6BB5\u3002";
            if (endedAt != null) record.endedAt = isoTime(endedAt, this.now());
            sessions.put(record);
            done(record);
          } catch (error) {
            fail(error);
          }
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
      const record = await this.transaction(["sessions"], "readonly", (tx, done) => {
        const request2 = tx.objectStore("sessions").get(id);
        request2.onsuccess = () => done(request2.result ?? null);
      });
      return this.present(record);
    }
    async list({ includeUploaded = false } = {}) {
      const records = await this.transaction(["sessions"], "readonly", (tx, done) => {
        const request2 = tx.objectStore("sessions").getAll();
        request2.onsuccess = () => done(request2.result);
      });
      return records.filter((record) => includeUploaded || record.status !== "uploaded").map((record) => this.present(record)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    }
    /** Caller must hold the same exclusive Web Lock used for recording. */
    async recoverAbandoned({ activeIds = [], lockHeld = false } = {}) {
      if (!lockHeld) throw problem("RECOVERY_LOCK_REQUIRED", "\u6062\u590D\u4E2D\u65AD\u5F55\u50CF\u524D\u5FC5\u987B\u786E\u8BA4\u5176\u4ED6\u9875\u9762\u6CA1\u6709\u6B63\u5728\u5F55\u5236\u3002");
      const keep = /* @__PURE__ */ new Set([...activeIds, ...this.active]);
      const records = await this.list();
      const candidates = records.filter((record) => record.status === "recording" && !keep.has(record.id));
      return Promise.all(candidates.map((record) => this.markInterrupted(
        record.id,
        { reason: "\u9875\u9762\u5173\u95ED\u6216\u5F55\u5236\u5F02\u5E38\u4E2D\u65AD\uFF0C\u5DF2\u4FDD\u5B58\u7684\u7247\u6BB5\u4ECD\u4FDD\u7559\u3002" }
      )));
    }
    async readRange(id, start, end) {
      checkedId(id);
      if (!Number.isSafeInteger(start) || start < 0 || end != null && (!Number.isSafeInteger(end) || end < start)) {
        throw problem("INVALID_RANGE", "\u5F55\u50CF\u8BFB\u53D6\u8303\u56F4\u65E0\u6548\u3002");
      }
      return this.transaction(["sessions", "chunks"], "readonly", (tx, done, fail) => {
        const request2 = tx.objectStore("sessions").get(id);
        request2.onsuccess = () => {
          try {
            const record = request2.result;
            if (!record) throw problem("NOT_FOUND", "\u672A\u627E\u5230\u8FD9\u6BB5\u5F55\u50CF\u3002");
            const limit = end ?? record.size;
            if (start > record.size || limit > record.size) throw problem("INVALID_RANGE", "\u8BFB\u53D6\u8303\u56F4\u8D85\u51FA\u4E86\u5DF2\u4FDD\u5B58\u7684\u5F55\u50CF\u3002");
            if (start === limit) {
              done(new Blob([], { type: record.mime }));
              return;
            }
            let expected = start;
            const parts = [];
            const range = this.keyRange.bound([id, start + 1], [id, record.size]);
            const cursorRequest = tx.objectStore("chunks").index("byEnd").openCursor(range);
            cursorRequest.onsuccess = () => {
              try {
                const cursor = cursorRequest.result;
                if (!cursor || cursor.value.start >= limit) {
                  if (expected !== limit) throw problem("MISSING_CHUNK", "\u5F55\u50CF\u7247\u6BB5\u4E0D\u5B8C\u6574\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u8BF7\u6C42\u7684\u8303\u56F4\u3002");
                  done(new Blob(parts, { type: record.mime }));
                  return;
                }
                const chunk = cursor.value;
                if (chunk.start > expected || chunk.end <= expected || chunk.blob.size !== chunk.end - chunk.start) {
                  throw problem("MISSING_CHUNK", "\u5F55\u50CF\u7247\u6BB5\u4E0D\u5B8C\u6574\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u8BF7\u6C42\u7684\u8303\u56F4\u3002");
                }
                const next = Math.min(limit, chunk.end);
                parts.push(chunk.blob.slice(expected - chunk.start, next - chunk.start));
                expected = next;
                if (expected === limit) {
                  done(new Blob(parts, { type: record.mime }));
                  return;
                }
                cursor.continue();
              } catch (error) {
                fail(error);
              }
            };
          } catch (error) {
            fail(error);
          }
        };
      });
    }
    async exportBlob(id) {
      const session = await this.getSession(id);
      if (!session) throw problem("NOT_FOUND", "\u672A\u627E\u5230\u8FD9\u6BB5\u5F55\u50CF\u3002");
      if (session.activeHere) throw problem("ACTIVE_RECORDING", "\u8BF7\u5148\u505C\u6B62\u5F55\u5236\uFF0C\u518D\u5BFC\u51FA\u5F55\u50CF\u3002");
      const blob = await this.readRange(id, 0, session.size);
      return {
        blob,
        session,
        interrupted: !session.complete,
        fileName: recordingFileName(session)
      };
    }
    markUploaded(id, { cloudItemId, allowIncomplete = false } = {}) {
      return this.serialize(id, async () => {
        if (!label(cloudItemId, 256)) throw problem("MISSING_RECEIPT", "\u4E91\u7AEF\u5C1A\u672A\u786E\u8BA4\u4FDD\u5B58\uFF0C\u4E0D\u80FD\u6807\u8BB0\u4E3A\u5DF2\u4E0A\u4F20\u3002");
        const result = await this.transaction(["sessions"], "readwrite", (tx, done, fail) => {
          const sessions = tx.objectStore("sessions");
          const request2 = sessions.get(id);
          request2.onsuccess = () => {
            try {
              const record = request2.result;
              if (!record) throw problem("NOT_FOUND", "\u672A\u627E\u5230\u8FD9\u6BB5\u5F55\u50CF\u3002");
              if (this.active.has(id)) throw problem("ACTIVE_RECORDING", "\u5F55\u5236\u4ECD\u5728\u8FDB\u884C\uFF0C\u4E0D\u80FD\u6807\u8BB0\u4E3A\u5DF2\u4E0A\u4F20\u3002");
              if (!record.complete && !allowIncomplete) throw problem("INCOMPLETE_RECORDING", "\u8FD9\u6BB5\u5F55\u50CF\u66FE\u4E2D\u65AD\uFF0C\u9700\u8981\u7528\u6237\u786E\u8BA4\u540E\u624D\u80FD\u4E0A\u4F20\u4E2D\u65AD\u7247\u6BB5\u3002");
              record.status = "uploaded";
              record.cloudItemId = label(cloudItemId, 256);
              record.uploadedAt = isoTime(null, this.now());
              sessions.put(record);
              done(record);
            } catch (error) {
              fail(error);
            }
          };
        });
        return this.present(result);
      }, { ignorePreviousFailure: true });
    }
    deleteSession(id, { reason } = {}) {
      return this.serialize(id, () => {
        if (!["user-confirmed", "cloud-confirmed"].includes(reason)) {
          throw problem("DELETE_NOT_AUTHORIZED", "\u53EA\u80FD\u5728\u7528\u6237\u660E\u786E\u5220\u9664\u6216\u4E91\u7AEF\u786E\u8BA4\u4FDD\u5B58\u540E\u5220\u9664\u672C\u5730\u5F55\u50CF\u3002");
        }
        if (this.active.has(id)) throw problem("ACTIVE_RECORDING", "\u8BF7\u5148\u505C\u6B62\u5F55\u5236\uFF0C\u518D\u5220\u9664\u672C\u5730\u5F55\u50CF\u3002");
        return this.transaction(["sessions", "chunks"], "readwrite", (tx, done, fail) => {
          const sessions = tx.objectStore("sessions");
          const request2 = sessions.get(id);
          request2.onsuccess = () => {
            const record = request2.result;
            if (!record) {
              done(false);
              return;
            }
            if (reason === "cloud-confirmed" && (record.status !== "uploaded" || !record.cloudItemId)) {
              fail(problem("MISSING_RECEIPT", "\u4E91\u7AEF\u5C1A\u672A\u786E\u8BA4\u4FDD\u5B58\uFF0C\u672C\u5730\u5F55\u50CF\u4ECD\u4FDD\u7559\u3002"));
              return;
            }
            const cursorRequest = tx.objectStore("chunks").index("bySession").openCursor(this.keyRange.only(id));
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result;
              if (cursor) {
                cursor.delete();
                cursor.continue();
              } else {
                sessions.delete(id);
                done(true);
              }
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
  };

  // node_modules/@noble/hashes/utils.js
  function isBytes(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
  }
  function abytes(value, length, title = "") {
    const bytes2 = isBytes(value);
    const len = value?.length;
    const needsLen = length !== void 0;
    if (!bytes2 || needsLen && len !== length) {
      const prefix = title && `"${title}" `;
      const ofLen = needsLen ? ` of length ${length}` : "";
      const got = bytes2 ? `length=${len}` : `type=${typeof value}`;
      throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
    }
    return value;
  }
  function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("Hash instance has been destroyed");
    if (checkFinished && instance.finished)
      throw new Error("Hash#digest() has already been called");
  }
  function aoutput(out, instance) {
    abytes(out, void 0, "digestInto() output");
    const min = instance.outputLen;
    if (out.length < min) {
      throw new Error('"digestInto() output" expected to be of length >=' + min);
    }
  }
  function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  function createView(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  function rotr(word, shift) {
    return word << 32 - shift | word >>> shift;
  }
  function createHasher(hashCons, info = {}) {
    const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
    const tmp = hashCons(void 0);
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (opts) => hashCons(opts);
    Object.assign(hashC, info);
    return Object.freeze(hashC);
  }
  var oidNist = (suffix) => ({
    oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
  });

  // node_modules/@noble/hashes/_md.js
  function Chi(a, b, c) {
    return a & b ^ ~a & c;
  }
  function Maj(a, b, c) {
    return a & b ^ a & c ^ b & c;
  }
  var HashMD = class {
    blockLen;
    outputLen;
    padOffset;
    isLE;
    // For partial updates less than block size
    buffer;
    view;
    finished = false;
    length = 0;
    pos = 0;
    destroyed = false;
    constructor(blockLen, outputLen, padOffset, isLE) {
      this.blockLen = blockLen;
      this.outputLen = outputLen;
      this.padOffset = padOffset;
      this.isLE = isLE;
      this.buffer = new Uint8Array(blockLen);
      this.view = createView(this.buffer);
    }
    update(data) {
      aexists(this);
      abytes(data);
      const { view, buffer, blockLen } = this;
      const len = data.length;
      for (let pos = 0; pos < len; ) {
        const take = Math.min(blockLen - this.pos, len - pos);
        if (take === blockLen) {
          const dataView = createView(data);
          for (; blockLen <= len - pos; pos += blockLen)
            this.process(dataView, pos);
          continue;
        }
        buffer.set(data.subarray(pos, pos + take), this.pos);
        this.pos += take;
        pos += take;
        if (this.pos === blockLen) {
          this.process(view, 0);
          this.pos = 0;
        }
      }
      this.length += data.length;
      this.roundClean();
      return this;
    }
    digestInto(out) {
      aexists(this);
      aoutput(out, this);
      this.finished = true;
      const { buffer, view, blockLen, isLE } = this;
      let { pos } = this;
      buffer[pos++] = 128;
      clean(this.buffer.subarray(pos));
      if (this.padOffset > blockLen - pos) {
        this.process(view, 0);
        pos = 0;
      }
      for (let i = pos; i < blockLen; i++)
        buffer[i] = 0;
      view.setBigUint64(blockLen - 8, BigInt(this.length * 8), isLE);
      this.process(view, 0);
      const oview = createView(out);
      const len = this.outputLen;
      if (len % 4)
        throw new Error("_sha2: outputLen must be aligned to 32bit");
      const outLen = len / 4;
      const state = this.get();
      if (outLen > state.length)
        throw new Error("_sha2: outputLen bigger than state");
      for (let i = 0; i < outLen; i++)
        oview.setUint32(4 * i, state[i], isLE);
    }
    digest() {
      const { buffer, outputLen } = this;
      this.digestInto(buffer);
      const res = buffer.slice(0, outputLen);
      this.destroy();
      return res;
    }
    _cloneInto(to) {
      to ||= new this.constructor();
      to.set(...this.get());
      const { blockLen, buffer, length, finished, destroyed, pos } = this;
      to.destroyed = destroyed;
      to.finished = finished;
      to.length = length;
      to.pos = pos;
      if (length % blockLen)
        to.buffer.set(buffer);
      return to;
    }
    clone() {
      return this._cloneInto();
    }
  };
  var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);

  // node_modules/@noble/hashes/sha2.js
  var SHA256_K = /* @__PURE__ */ Uint32Array.from([
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ]);
  var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
  var SHA2_32B = class extends HashMD {
    constructor(outputLen) {
      super(64, outputLen, 8, false);
    }
    get() {
      const { A, B, C, D, E, F, G, H } = this;
      return [A, B, C, D, E, F, G, H];
    }
    // prettier-ignore
    set(A, B, C, D, E, F, G, H) {
      this.A = A | 0;
      this.B = B | 0;
      this.C = C | 0;
      this.D = D | 0;
      this.E = E | 0;
      this.F = F | 0;
      this.G = G | 0;
      this.H = H | 0;
    }
    process(view, offset) {
      for (let i = 0; i < 16; i++, offset += 4)
        SHA256_W[i] = view.getUint32(offset, false);
      for (let i = 16; i < 64; i++) {
        const W15 = SHA256_W[i - 15];
        const W2 = SHA256_W[i - 2];
        const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
        const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
        SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
      }
      let { A, B, C, D, E, F, G, H } = this;
      for (let i = 0; i < 64; i++) {
        const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
        const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
        const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
        const T2 = sigma0 + Maj(A, B, C) | 0;
        H = G;
        G = F;
        F = E;
        E = D + T1 | 0;
        D = C;
        C = B;
        B = A;
        A = T1 + T2 | 0;
      }
      A = A + this.A | 0;
      B = B + this.B | 0;
      C = C + this.C | 0;
      D = D + this.D | 0;
      E = E + this.E | 0;
      F = F + this.F | 0;
      G = G + this.G | 0;
      H = H + this.H | 0;
      this.set(A, B, C, D, E, F, G, H);
    }
    roundClean() {
      clean(SHA256_W);
    }
    destroy() {
      this.set(0, 0, 0, 0, 0, 0, 0, 0);
      clean(this.buffer);
    }
  };
  var _SHA256 = class extends SHA2_32B {
    // We cannot use array here since array allows indexing by variable
    // which means optimizer/compiler cannot use registers.
    A = SHA256_IV[0] | 0;
    B = SHA256_IV[1] | 0;
    C = SHA256_IV[2] | 0;
    D = SHA256_IV[3] | 0;
    E = SHA256_IV[4] | 0;
    F = SHA256_IV[5] | 0;
    G = SHA256_IV[6] | 0;
    H = SHA256_IV[7] | 0;
    constructor() {
      super(32);
    }
  };
  var sha256 = /* @__PURE__ */ createHasher(
    () => new _SHA256(),
    /* @__PURE__ */ oidNist(1)
  );

  // client/live-upload.mjs
  async function uploadRecordedReplay(source, { request: request2, onProgress = () => {
  } }) {
    if (!source.complete || source.size < 16 || source.size > 8 * 1024 ** 3) throw Error("\u5F55\u5236\u672A\u5B8C\u6574\u7ED3\u675F\uFF0C\u6216\u6587\u4EF6\u8D85\u8FC7 8 GB\u3002\u5DF2\u4FDD\u7559\u672C\u673A\u5F55\u5236\u3002");
    const hash = sha256.create(), chunkSize = 8 * 1024 ** 2;
    for (let offset = 0; offset < source.size; offset += chunkSize) {
      const bytes2 = await source.readRange(offset, Math.min(source.size, offset + chunkSize));
      hash.update(new Uint8Array(await bytes2.arrayBuffer()));
      onProgress({ stage: "hash", ratio: Math.min(source.size, offset + chunkSize) / source.size });
    }
    const checksum = Array.from(hash.digest(), (x) => x.toString(16).padStart(2, "0")).join("");
    const info = await request2("/api/live/uploads", { method: "POST", body: { name: source.fileName, size: source.size, sha256: checksum, platform: source.platform, title: source.title, endedAt: source.endedAt } });
    if (!info.id || !Number.isSafeInteger(info.chunkSize) || info.chunkSize < 1 || info.chunkSize > chunkSize) throw Error("\u4E0A\u4F20\u54CD\u5E94\u65E0\u6548\uFF0C\u5F55\u5236\u4FDD\u7559\u5728\u672C\u673A\u3002");
    for (let offset = 0, part = 1; !info.complete && offset < source.size; offset += info.chunkSize, part++) {
      await request2(`/api/live/uploads/${info.id}/parts/${part}`, { method: "PUT", body: await source.readRange(offset, Math.min(source.size, offset + info.chunkSize)) });
      onProgress({ stage: "upload", ratio: Math.min(source.size, offset + info.chunkSize) / source.size });
    }
    const saved2 = await request2(`/api/live/uploads/${info.id}/complete`, { method: "POST", body: {} });
    if (!saved2.saved || !saved2.item?.id) throw Error("\u5C1A\u672A\u6536\u5230\u4FDD\u5B58\u786E\u8BA4\uFF0C\u5F55\u5236\u4FDD\u7559\u5728\u672C\u673A\u3002");
    onProgress({ stage: "saved", ratio: 1 });
    return saved2;
  }

  // client/live-layout-editor.mjs
  var ids = ["screen-inset", "portrait"];
  var key = "lingan-live-layouts-v1";
  var LayoutPreferences = class {
    constructor(storage) {
      this.storage = storage;
      let saved2 = {};
      try {
        saved2 = JSON.parse(storage?.getItem(key) || "{}") || {};
      } catch {
      }
      this.values = Object.fromEntries(ids.map((id) => [id, normalizeLayoutSettings(id, saved2[id])]));
    }
    get(id) {
      return normalizeLayoutSettings(id, this.values[id]);
    }
    set(id, value) {
      if (!ids.includes(id)) throw Error("\u8BF7\u9009\u62E9\u53EF\u81EA\u5B9A\u4E49\u7684\u5E03\u5C40");
      this.values[id] = normalizeLayoutSettings(id, value);
      try {
        if (!this.storage) return false;
        this.storage.setItem(key, JSON.stringify(this.values));
        return true;
      } catch {
        return false;
      }
    }
    reset(id) {
      return this.set(id, defaultLayoutSettings(id));
    }
  };
  function createLayoutEditor({ onChange = () => {
  } } = {}) {
    const el2 = (id) => document.getElementById(id), root = el2("liveLayoutEditor"), stage = el2("liveLayoutStage"), layoutSelect = el2("liveLayoutChoice"), sourceSelect = el2("liveLayoutSource"), fields = el2("liveLayoutFields"), fit = el2("liveLayoutFit"), status = el2("liveLayoutStatus"), start = el2("liveLayoutStart"), reset = el2("liveLayoutReset");
    let storage;
    try {
      storage = localStorage;
    } catch {
    }
    const preferences2 = new LayoutPreferences(storage), controls = {};
    let layoutId = "portrait", source = "camera", phase = "idle", canStart = false, drag = null;
    for (const [name, label2] of [["x", "\u5DE6\u53F3\u4F4D\u7F6E"], ["y", "\u4E0A\u4E0B\u4F4D\u7F6E"], ["width", "\u5BBD\u5EA6"], ["height", "\u9AD8\u5EA6"]]) {
      const row = document.createElement("label");
      row.className = "live-layout-field";
      row.append(document.createTextNode(label2 + "\uFF08%\uFF09"));
      const pair = document.createElement("span"), range = document.createElement("input"), number = document.createElement("input");
      pair.className = "live-layout-field-pair";
      range.type = "range";
      number.type = "number";
      for (const input of [range, number]) {
        input.min = name === "width" || name === "height" ? "5" : "0";
        input.max = "100";
        input.step = "0.1";
        input.setAttribute("aria-label", label2 + "\u767E\u5206\u6BD4");
        input.addEventListener("input", () => {
          if (input.value !== "" && Number.isFinite(Number(input.value))) change({ [name]: Number(input.value) }, input === number ? number : null);
        });
      }
      number.addEventListener("change", () => render());
      number.addEventListener("blur", () => render());
      pair.append(range, number);
      row.append(pair);
      fields.append(row);
      controls[name] = { range, number };
    }
    const boxes = Object.fromEntries(["screen", "camera"].map((name) => [name, stage.querySelector('[data-layout-source="' + name + '"]')]));
    const current = () => preferences2.get(layoutId);
    function editable() {
      return ids.includes(layoutId) && phase !== "finishing";
    }
    function render(keepInput) {
      const custom = ids.includes(layoutId), layout = layouts[layoutId];
      root.querySelector(".live-layout-content").hidden = !custom;
      layoutSelect.value = layoutId;
      layoutSelect.disabled = phase !== "idle";
      start.disabled = !custom || phase !== "idle" || !canStart;
      reset.disabled = !editable();
      if (!custom) {
        status.textContent = "\u4EBA\u7269\u5168\u5C4F\u4F7F\u7528\u9ED8\u8BA4\u753B\u9762\u3002\u9009\u62E9\u53E6\u5916\u4E24\u79CD\u5E03\u5C40\uFF0C\u53EF\u4EE5\u8C03\u6574\u5C4F\u5E55\u4E0E\u4EBA\u7269\u3002";
        return;
      }
      const values = current(), box = values[source];
      stage.style.aspectRatio = layout.width + "/" + layout.height;
      stage.classList.toggle("is-portrait", layoutId === "portrait");
      for (const [name, node] of Object.entries(boxes)) {
        const rect = values[name];
        Object.assign(node.style, { left: rect.x + "%", top: rect.y + "%", width: rect.width + "%", height: rect.height + "%" });
        node.classList.toggle("is-selected", source === name);
        node.setAttribute("aria-pressed", String(source === name));
        node.setAttribute("aria-label", (name === "screen" ? "\u5C4F\u5E55" : "\u4EBA\u7269") + "\u753B\u9762\uFF0C\u65B9\u5411\u952E\u79FB\u52A8\uFF0CShift \u52A0\u65B9\u5411\u952E\u8C03\u6574\u5927\u5C0F");
        node.tabIndex = editable() ? 0 : -1;
      }
      sourceSelect.value = source;
      sourceSelect.disabled = !editable();
      fit.value = box.fit;
      fit.disabled = !editable();
      for (const [name, inputs] of Object.entries(controls)) {
        const max = name === "x" ? 100 - box.width : name === "y" ? 100 - box.height : 100;
        for (const input of Object.values(inputs)) {
          input.max = String(Math.ceil(max * 10) / 10);
          if (input !== keepInput) input.value = String(Math.round(box[name] * 10) / 10);
          input.disabled = !editable();
        }
      }
      const card = document.querySelector('[data-live-scene="' + layoutId + '"]');
      for (const name of ["screen", "camera"]) {
        const node = card?.querySelector(".live-" + name), rect = values[name];
        if (node) Object.assign(node.style, { inset: "auto", left: rect.x + "%", top: rect.y + "%", width: rect.width + "%", height: rect.height + "%" });
      }
    }
    function change(patch, keepInput) {
      if (!editable()) return;
      const values = current();
      values[source] = { ...values[source], ...patch };
      const saved2 = preferences2.set(layoutId, values);
      render(keepInput);
      onChange(layoutId, current());
      status.textContent = saved2 ? phase === "idle" ? "\u5DF2\u81EA\u52A8\u4FDD\u5B58\u6B64\u5E03\u5C40\u3002\u4E0B\u6B21\u6253\u5F00\u4ECD\u4F1A\u4F7F\u7528\u8FD9\u4E9B\u8BBE\u7F6E\u3002" : "\u8C03\u6574\u5DF2\u5E94\u7528\u5230\u5F55\u5236\u753B\u9762\uFF0C\u5E76\u81EA\u52A8\u4FDD\u5B58\u3002" : "\u8C03\u6574\u5DF2\u751F\u6548\uFF1B\u6B64\u6D4F\u89C8\u5668\u6682\u65F6\u65E0\u6CD5\u4FDD\u5B58\u8BBE\u7F6E\u3002";
    }
    function setLayout(id) {
      if (!layouts[id]) return;
      layoutId = id;
      drag = null;
      render();
      status.textContent = ids.includes(id) ? "\u62D6\u52A8\u753B\u9762\u6539\u53D8\u4F4D\u7F6E\uFF0C\u62D6\u53F3\u4E0B\u89D2\u6539\u53D8\u5927\u5C0F\u3002\u6B64\u6D4F\u89C8\u5668\u5206\u522B\u8BB0\u4F4F\u4E24\u79CD\u5E03\u5C40\u3002" : "\u4EBA\u7269\u5168\u5C4F\u4F7F\u7528\u9ED8\u8BA4\u753B\u9762\u3002\u9009\u62E9\u53E6\u5916\u4E24\u79CD\u5E03\u5C40\uFF0C\u53EF\u4EE5\u81EA\u5B9A\u4E49\u3002";
    }
    layoutSelect.addEventListener("change", () => {
      if (phase !== "idle") return;
      setLayout(layoutSelect.value);
      window.LinganLiveScenes?.select(layoutId);
    });
    sourceSelect.addEventListener("change", () => {
      source = sourceSelect.value;
      render();
    });
    fit.addEventListener("change", () => change({ fit: fit.value }));
    reset.addEventListener("click", () => {
      if (!editable()) return;
      const saved2 = preferences2.reset(layoutId);
      render();
      onChange(layoutId, current());
      status.textContent = saved2 ? "\u5F53\u524D\u5E03\u5C40\u5DF2\u6062\u590D\u9ED8\u8BA4\uFF0C\u53E6\u4E00\u79CD\u5E03\u5C40\u4F1A\u4FDD\u7559\u3002" : "\u5F53\u524D\u5E03\u5C40\u5DF2\u6062\u590D\u9ED8\u8BA4\uFF1B\u6B64\u6D4F\u89C8\u5668\u6682\u65F6\u65E0\u6CD5\u4FDD\u5B58\u8BBE\u7F6E\u3002";
    });
    start.addEventListener("click", () => {
      window.LinganLiveScenes?.select(layoutId);
      window.LinganRecorder?.start(layoutId);
    });
    stage.addEventListener("pointerdown", (event) => {
      const node = event.target.closest("[data-layout-source]");
      if (!node || !editable() || event.button !== 0) return;
      source = node.dataset.layoutSource;
      render();
      const rect = stage.getBoundingClientRect();
      drag = { pointerId: event.pointerId, source, startX: event.clientX, startY: event.clientY, rect, box: current()[source], resize: Boolean(event.target.closest("[data-layout-resize]")) };
      node.setPointerCapture(event.pointerId);
      node.focus();
      event.preventDefault();
    });
    stage.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId || !editable()) return;
      const dx = (event.clientX - drag.startX) / drag.rect.width * 100, dy = (event.clientY - drag.startY) / drag.rect.height * 100;
      change(drag.resize ? { width: Math.min(100 - drag.box.x, drag.box.width + dx), height: Math.min(100 - drag.box.y, drag.box.height + dy) } : { x: drag.box.x + dx, y: drag.box.y + dy });
      event.preventDefault();
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) stage.addEventListener(name, () => {
      drag = null;
    });
    stage.addEventListener("keydown", (event) => {
      const node = event.target.closest("[data-layout-source]"), direction = { ArrowLeft: ["x", -1], ArrowRight: ["x", 1], ArrowUp: ["y", -1], ArrowDown: ["y", 1] }[event.key];
      if (!node || !direction || !editable()) return;
      source = node.dataset.layoutSource;
      const [axis, step] = direction, field = event.shiftKey ? axis === "x" ? "width" : "height" : axis;
      change({ [field]: current()[source][field] + step });
      event.preventDefault();
    });
    window.addEventListener("lingan-live-scene", (event) => {
      if (phase === "idle") setLayout(event.detail);
    });
    let initial = document.querySelector("[data-live-scene].is-selected")?.dataset.liveScene || "portrait";
    setLayout(initial);
    for (const id of ids) {
      layoutId = id;
      render();
    }
    layoutId = initial;
    render();
    return { settings: (id) => preferences2.get(id), setPhase(next, id, ready2) {
      phase = next;
      canStart = ready2;
      if (next !== "idle" && id) setLayout(id);
      else render();
      if (next === "finishing") status.textContent = "\u6B63\u5728\u4FDD\u5B58\u5F55\u50CF\uFF0C\u5B8C\u6210\u540E\u53EF\u4EE5\u7EE7\u7EED\u8C03\u6574\u3002";
    } };
  }

  // client/live-recorder.mjs
  var el = (id) => document.getElementById(id);
  var cards = [...document.querySelectorAll("[data-live-scene]")];
  var settings = ["Camera", "Microphone", "Platform", "Title", "MicEnabled", "SystemEnabled", "MicVolume", "SystemVolume"];
  var preferenceKey = "lingan-live-recording-options";
  var timer = (seconds) => {
    const n = Math.floor(seconds);
    return `${Math.floor(n / 3600) ? String(Math.floor(n / 3600)).padStart(2, "0") + ":" : ""}${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  };
  var bytes = (n) => n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(2) + " GB" : (n / 1024 ** 2).toFixed(1) + " MB";
  var ready = false;
  var controller;
  var store;
  var busy = false;
  var uploadingId = null;
  var uploadRequested = false;
  var errors = /* @__PURE__ */ new Map();
  var layoutEditor = createLayoutEditor({ onChange: (id, settings2) => {
    if (controller?.layoutId === id) controller.updateLayout(settings2);
  } });
  function preferences() {
    const result = {};
    for (const name of settings) {
      const node = el("liveRecord" + name);
      result[name] = node.type === "checkbox" ? node.checked : node.value;
    }
    return result;
  }
  function savePreferences() {
    saved = preferences();
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(saved));
    } catch {
    }
  }
  var saved = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(preferenceKey) || "{}");
    if (parsed && typeof parsed === "object") saved = parsed;
  } catch {
  }
  for (const name of settings) {
    const node = el("liveRecord" + name);
    if (saved[name] !== void 0) {
      if (node.type === "checkbox") node.checked = Boolean(saved[name]);
      else if (name !== "Camera" && name !== "Microphone") node.value = String(saved[name]);
    }
    node.addEventListener("change", savePreferences);
  }
  var badge = document.createElement("button");
  badge.type = "button";
  badge.className = "live-recording-return";
  badge.hidden = true;
  badge.addEventListener("click", () => document.querySelector('[data-view="live"]')?.click());
  document.body.append(badge);
  function renderState({ phase, message, layoutId, systemAudio }) {
    layoutEditor.setPhase(phase, layoutId, ready);
    const active = phase !== "idle", recording = ["recording", "paused"].includes(phase);
    for (const card of cards) card.disabled = active || !ready;
    for (const name of settings.filter((name2) => !name2.endsWith("Volume"))) el("liveRecord" + name).disabled = active;
    el("liveRecordStop").disabled = !["starting", "recording", "paused"].includes(phase);
    el("liveRecordStop").textContent = phase === "starting" ? "\u53D6\u6D88\u51C6\u5907" : "\u505C\u6B62\u5E76\u4FDD\u5B58\u56DE\u653E";
    el("liveRecordPause").disabled = !recording;
    el("liveRecordPause").textContent = phase === "paused" ? "\u7EE7\u7EED\u5F55\u5236" : "\u6682\u505C";
    el("liveRecordHeading").textContent = active ? layouts[layoutId]?.name + " \xB7 " + (phase === "paused" ? "\u5DF2\u6682\u505C" : phase === "recording" ? "\u6B63\u5728\u5F55\u5236" : phase === "finishing" ? "\u6B63\u5728\u4FDD\u5B58" : "\u51C6\u5907\u4E2D") : "\u5F55\u5236\u9884\u89C8";
    el("liveRecordStatus").textContent = message;
    el("liveAudioState").textContent = recording ? `\u9EA6\u514B\u98CE${controller.gains?.microphone ? "\u5DF2\u8FDE\u63A5" : "\u672A\u5F55\u5236"} \xB7 \u7535\u8111\u58F0\u97F3${systemAudio ? "\u5DF2\u8FDE\u63A5" : layoutId === "presenter" ? "\u6B64\u5E03\u5C40\u4E0D\u91C7\u96C6" : "\u672A\u6536\u5230"}` : "\u9EA6\u514B\u98CE\u4E0E\u7535\u8111\u58F0\u97F3\u7B49\u5F85\u8FDE\u63A5";
    badge.hidden = !active;
    badge.textContent = el("liveRecordHeading").textContent;
    refreshLocal().catch(showLocalError);
  }
  function showLocalError(error) {
    el("liveLocalStatus").textContent = error.message || "\u672C\u673A\u5F55\u5236\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u91CD\u8BD5\u3002";
  }
  function deviceList(devices) {
    for (const [name, kind] of [["Camera", "videoinput"], ["Microphone", "audioinput"]]) {
      const select = el("liveRecord" + name), selected = select.value || saved[name] || "";
      select.replaceChildren(new Option("\u7CFB\u7EDF\u9ED8\u8BA4" + (name === "Camera" ? "\u6444\u50CF\u5934" : "\u9EA6\u514B\u98CE"), ""));
      let n = 0;
      for (const d of devices.filter((d2) => d2.kind === kind)) select.add(new Option(d.label || (name === "Camera" ? "\u6444\u50CF\u5934" : "\u9EA6\u514B\u98CE") + " " + ++n, d.deviceId));
      if ([...select.options].some((o) => o.value === selected)) select.value = selected;
    }
  }
  async function request(path, { method = "GET", body } = {}) {
    const blob = body instanceof Blob, response = await fetch(path, { method, headers: body ? { "Content-Type": blob ? "application/octet-stream" : "application/json" } : void 0, body: body ? blob ? body : JSON.stringify(body) : void 0 });
    let data;
    try {
      data = await response.json();
    } catch {
      throw Error("\u7F51\u7AD9\u5C1A\u672A\u786E\u8BA4\u4FDD\u5B58\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u4E0A\u4F20\u3002");
    }
    if (!response.ok) throw Error(data.error || data.message || "\u4E0A\u4F20\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u767B\u5F55\u4E0E\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002");
    return data;
  }
  async function refreshLocal() {
    if (!store) return;
    const records = await store.list({ includeUploaded: true }), container = el("liveLocalRecordings");
    container.replaceChildren();
    if (!records.length) {
      const p = document.createElement("p");
      p.className = "live-note";
      p.textContent = "\u8FD8\u6CA1\u6709\u672C\u673A\u5F55\u5236\u3002\u5B8C\u6210\u7B2C\u4E00\u6BB5\u5F55\u5236\u540E\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\u3002";
      container.append(p);
      return;
    }
    for (const r of records) {
      const row = document.createElement("article");
      row.className = "live-local-row";
      const detail = document.createElement("div"), title = document.createElement("strong"), note = document.createElement("p");
      title.textContent = r.title || layouts[r.layout]?.name || "\u76F4\u64AD\u5F55\u50CF";
      note.textContent = `${new Date(r.startedAt).toLocaleString()} \xB7 ${bytes(r.size)} \xB7 ${uploadingId === r.id ? "\u6B63\u5728\u4E0A\u4F20" : r.status === "uploaded" ? "\u5DF2\u4FDD\u5B58\u5230\u56DE\u653E\u5386\u53F2" : r.complete ? "\u5DF2\u5B8C\u6574\u4FDD\u5B58\u5728\u672C\u673A" : r.status === "recording" ? "\u6B63\u5728\u5F55\u5236" : "\u4E2D\u65AD\u7247\u6BB5"}${errors.has(r.id) ? " \xB7 " + errors.get(r.id) : ""}`;
      detail.append(title, note);
      row.append(detail);
      const actions = document.createElement("div");
      actions.className = "live-local-actions";
      if (r.size && r.status !== "recording") {
        const download = document.createElement("button");
        download.className = "quiet-button";
        download.textContent = r.complete ? "\u4E0B\u8F7D\u5F55\u50CF" : "\u4E0B\u8F7D\u4E2D\u65AD\u7247\u6BB5";
        download.addEventListener("click", async () => {
          download.disabled = true;
          try {
            const exported = await store.exportBlob(r.id), url = URL.createObjectURL(exported.blob), a = document.createElement("a");
            a.href = url;
            a.download = exported.fileName;
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 6e4);
          } catch (error) {
            showLocalError(error);
          } finally {
            download.disabled = false;
          }
        });
        actions.append(download);
      }
      if (r.uploadEligible) {
        const retry = document.createElement("button");
        retry.className = "quiet-button";
        retry.textContent = "\u91CD\u8BD5\u4E0A\u4F20";
        retry.disabled = uploadingId === r.id;
        retry.addEventListener("click", () => {
          errors.delete(r.id);
          runUploads().catch(showLocalError);
        });
        actions.append(retry);
      }
      if (r.status !== "recording") {
        const remove = document.createElement("button");
        remove.className = "quiet-button";
        remove.textContent = "\u5220\u9664\u672C\u673A\u526F\u672C";
        remove.disabled = uploadingId === r.id;
        remove.addEventListener("click", async () => {
          if (!confirm(r.status === "uploaded" ? "\u5220\u9664\u8FD9\u6BB5\u5F55\u50CF\u7684\u672C\u673A\u526F\u672C\uFF1F\u5DF2\u4FDD\u5B58\u7684\u4E91\u7AEF\u56DE\u653E\u4F1A\u4FDD\u7559\u3002" : "\u8FD9\u6BB5\u5F55\u50CF\u5C1A\u672A\u4FDD\u5B58\u5230\u4E91\u7AEF\uFF0C\u786E\u5B9A\u5220\u9664\u672C\u673A\u5F55\u50CF\uFF1F")) return;
          try {
            await store.deleteSession(r.id, { reason: "user-confirmed" });
            await refreshLocal();
          } catch (error) {
            showLocalError(error);
          }
        });
        actions.append(remove);
      }
      row.append(actions);
      container.append(row);
    }
  }
  async function runUploads() {
    if (!store) return;
    if (busy) {
      uploadRequested = true;
      return;
    }
    busy = true;
    try {
      for (const session of await store.list()) {
        if (!session.uploadEligible || errors.has(session.id)) continue;
        try {
          await navigator.locks.request("lingan-live-upload-" + session.id, { ifAvailable: true }, async (lock) => {
            if (!lock) return;
            const current = await store.getSession(session.id);
            if (!current.uploadEligible) return;
            uploadingId = session.id;
            await refreshLocal();
            const receipt = await uploadRecordedReplay({ ...current, fileName: recordingFileName(current), readRange: (start, end) => store.readRange(current.id, start, end) }, { request, onProgress: (progress) => {
              el("liveLocalStatus").textContent = progress.stage === "saved" ? "\u56DE\u653E\u5DF2\u4FDD\u5B58\u5230\u5F85\u5904\u7406\u548C\u76F4\u64AD\u56DE\u653E\u5386\u53F2\u3002" : `${progress.stage === "hash" ? "\u6B63\u5728\u68C0\u67E5\u5B8C\u6574\u5F55\u50CF" : "\u6B63\u5728\u4E0A\u4F20\u56DE\u653E"} ${Math.round(progress.ratio * 100)}% \xB7 ${current.title}`;
            } });
            await store.markUploaded(current.id, { cloudItemId: receipt.item.id });
            window.LinganLive?.refresh();
          });
        } catch (error) {
          errors.set(session.id, error.message);
          el("liveLocalStatus").textContent = "\u4E0A\u4F20\u672A\u5B8C\u6210\uFF0C\u5F55\u50CF\u4FDD\u7559\u5728\u672C\u673A\u3002\u53EF\u70B9\u51FB\u91CD\u8BD5\u4E0A\u4F20\u6216\u4E0B\u8F7D\u3002";
        } finally {
          uploadingId = null;
          await refreshLocal();
        }
      }
    } finally {
      busy = false;
      if (uploadRequested) {
        uploadRequested = false;
        runUploads().catch(showLocalError);
      }
    }
  }
  window.LinganRecorder = { start(id) {
    if (!ready) {
      el("liveRecordStatus").textContent = captureSupported() ? "\u6B63\u5728\u51C6\u5907\u672C\u673A\u4FDD\u5B58\uFF0C\u8BF7\u7A0D\u540E\u518D\u70B9\u3002" : "\u8BF7\u5728\u7535\u8111\u4E0A\u7684\u65B0\u7248 Chrome \u6216 Edge \u4E2D\u6253\u5F00\u7F51\u7AD9\u5F55\u5236\u3002";
      return;
    }
    savePreferences();
    const p = preferences();
    controller.start(id, { layoutSettings: layoutEditor.settings(id), cameraId: p.Camera, microphoneId: p.Microphone, microphone: p.MicEnabled, systemAudio: p.SystemEnabled, microphoneVolume: Number(p.MicVolume), systemVolume: Number(p.SystemVolume), platform: p.Platform, title: p.Title }).catch(() => {
    });
    navigator.storage?.persist?.().catch(() => {
    });
  } };
  el("liveRecordStop").addEventListener("click", () => controller?.stop());
  el("liveRecordPause").addEventListener("click", () => controller?.pause());
  el("liveRecordMicVolume").addEventListener("input", (event) => controller?.volume("microphone", event.target.value));
  el("liveRecordSystemVolume").addEventListener("input", (event) => controller?.volume("system", event.target.value));
  setInterval(() => {
    if (controller?.phase !== "idle" && controller) {
      el("liveRecordTimer").textContent = timer(controller.elapsed());
      if (controller.phase === "recording" || controller.phase === "paused") badge.textContent = `${controller.phase === "paused" ? "\u5DF2\u6682\u505C" : "\u6B63\u5728\u5F55\u5236"} \xB7 ${timer(controller.elapsed())} \xB7 \u8FD4\u56DE\u76F4\u64AD`;
    }
  }, 1e3);
  setInterval(() => {
    if (controller?.phase === "recording" && performance.now() - controller.lastFrameAt > 3e4) {
      controller.interrupted = "\u6444\u50CF\u5934\u5DF2\u8D85\u8FC7 30 \u79D2\u6CA1\u6709\u9001\u6765\u753B\u9762";
      controller.stop();
    }
  }, 2e3);
  window.addEventListener("beforeunload", (event) => {
    if (controller?.phase !== "idle" && controller || busy) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("pagehide", () => {
    if (controller && controller.phase !== "idle") {
      controller.cancelled = true;
      controller.streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
      controller.worker?.terminate();
      controller.output?.getTracks().forEach((track) => track.stop());
      controller.audioContext?.close().catch(() => {
      });
    }
  });
  window.addEventListener("online", () => {
    errors.clear();
    runUploads().catch(showLocalError);
  });
  async function init() {
    if (!captureSupported()) {
      el("liveRecordStatus").textContent = "\u7F51\u9875\u5F55\u5236\u9700\u8981\u7535\u8111\u4E0A\u7684\u65B0\u7248 Chrome \u6216 Edge\uFF0C\u8BF7\u7528\u8FD9\u4E9B\u6D4F\u89C8\u5668\u6253\u5F00\u7F51\u7AD9\u3002";
      return;
    }
    for (const card of cards) card.disabled = true;
    store = createRecordingStore();
    await store.open();
    const release = await recordingLock();
    if (release) {
      try {
        await store.recoverAbandoned({ lockHeld: true });
      } finally {
        release();
      }
    }
    try {
      deviceList(await navigator.mediaDevices.enumerateDevices());
    } catch {
    }
    controller = new LiveCapture({ store, onState: renderState, onComplete: () => runUploads().catch(showLocalError), onDevices: deviceList, onPreview: (stream) => {
      const video = el("liveRecordPreview");
      video.srcObject = stream;
      video.hidden = !stream;
      el("liveRecordEmpty").hidden = Boolean(stream);
      if (stream) {
        video.style.aspectRatio = layouts[controller.layoutId].width + "/" + layouts[controller.layoutId].height;
        video.play().catch(() => {
        });
      }
    } });
    ready = true;
    renderState({ phase: "idle", message: "\u70B9\u4E0A\u65B9\u4E00\u79CD\u753B\u9762\uFF0C\u9009\u597D\u8BBE\u5907\u5E76\u6388\u6743\u540E\u81EA\u52A8\u5F00\u59CB\u5F55\u5236\u3002" });
    await refreshLocal();
    await runUploads();
  }
  init().catch((error) => {
    el("liveRecordStatus").textContent = error.message || "\u672C\u673A\u4FDD\u5B58\u5C1A\u672A\u51C6\u5907\u597D\uFF0C\u8BF7\u5237\u65B0\u91CD\u8BD5\u3002";
  });
})();
/*! Bundled license information:

@noble/hashes/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
