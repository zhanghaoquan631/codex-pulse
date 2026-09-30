(function installMovieWatchBridge(global) {
  'use strict';
  const namespace = global.MEZIP_MOVIE_WATCH = global.MEZIP_MOVIE_WATCH || {};
  const queueKey = 'mezip.movie.watch.outbox.v1';
  const captureKey = id => queueKey + '.capture.' + encodeURIComponent(id);
  const legacyAckKey = id => queueKey + '.legacy-ack.' + encodeURIComponent(id);
  const endpoint = 'http://127.0.0.1:4319/v1/watch/records';
  const verifyOnly = new URLSearchParams(global.location.search).get('verify') === '1';
  let ready = false;
  let sending = null;
  let retryTimer = null;
  let queue = [];
  const acceptedCaptures = new Set();
  const legacyCaptures = new Set();

  function status(message) {
    const target = document.getElementById('watch-status');
    if (target) target.textContent = message;
  }
  if (verifyOnly) {
    namespace.adapters = [];
    status('只读验证：不写入观看记录。');
    return;
  }
  const isCapture = item => item && typeof item.captureId === 'string' && item.captureId.length > 0
    && item.captureId.length <= 200 && item.metadata?.adapter === 'inspiration-movie-player';
  const addCapture = item => { if (!queue.some(progress => progress.captureId === item.captureId)) queue.push(item); };
  try {
    // Read the old array without rewriting it. Independent acknowledgement
    // markers prevent concurrent tabs from overwriting another legacy item.
    const stored = JSON.parse(localStorage.getItem(queueKey) || '[]');
    if (Array.isArray(stored)) for (const item of stored) {
      if (!isCapture(item)) continue;
      legacyCaptures.add(item.captureId);
      if (localStorage.getItem(legacyAckKey(item.captureId)) !== '1') addCapture(item);
    }
  } catch { status('本机进度缓存暂不可用；播放时将尝试直接同步。'); }
  try {
    const names = [];
    for (let index = 0; index < localStorage.length; index++) {
      const name = localStorage.key(index);
      if (name?.startsWith(queueKey + '.capture.')) names.push(name);
    }
    for (const name of names) {
      try {
        const item = JSON.parse(localStorage.getItem(name));
        if (isCapture(item) && name === captureKey(item.captureId)) addCapture(item);
      } catch { /* One invalid cached item must not hide valid captures. */ }
    }
  } catch { status('本机进度缓存暂不可用；播放时将尝试直接同步。'); }

  function persistCapture(item) {
    try {
      // Frames are optional; durable retries preserve counters and identities
      // without retaining large copies of video images in browser storage.
      const metadata = { ...item.metadata };
      delete metadata.lastFrame;
      delete metadata.frameCapturedAt;
      delete metadata.framePositionSeconds;
      if (metadata.frameStatus === 'captured') metadata.frameStatus = 'unavailable';
      // localStorage writes are atomic per key. A tab writes only its capture,
      // never a stale snapshot of the other tabs' pending queue.
      localStorage.setItem(captureKey(item.captureId), JSON.stringify({ ...item, metadata }));
      return true;
    } catch { status('进度正在同步；浏览器暂未能保存重试缓存。'); return false; }
  }

  function forgetCapture(id) {
    try {
      localStorage.removeItem(captureKey(id));
      if (legacyCaptures.has(id)) localStorage.setItem(legacyAckKey(id), '1');
    } catch { /* A stale capture may retry; the backend deduplicates its ID. */ }
  }

  async function postProgress(progress) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('观看进度同步超时')); }, 8000);
    });
    try {
      return await Promise.race([timeout, (async () => {
        const response = await fetch(endpoint, { method: 'POST', credentials: 'include', redirect: 'error',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(progress), keepalive: true, signal: controller.signal });
        if (!response.ok) throw new Error('观看进度尚未保存');
        const result = (await response.json()).data;
        if (!result || (result.ignored === true && !result.record)) throw new Error('电影来源尚未确认');
        return result;
      })()]);
    } finally { clearTimeout(timer); }
  }

  async function drain() {
    if (sending) return sending;
    clearTimeout(retryTimer);
    sending = (async () => {
      while (queue.length) {
        const progress = queue[0];
        const result = await postProgress(progress);
        queue.shift();
        acceptedCaptures.add(progress.captureId);
        if (acceptedCaptures.size > 512) acceptedCaptures.delete(acceptedCaptures.values().next().value);
        forgetCapture(progress.captureId);
        const date = result.record?.lastWatchedAt ? new Date(result.record.lastWatchedAt) : null;
        const time = date && Number.isFinite(date.getTime()) ? date.toLocaleTimeString('zh-CN', {hour12:false}) : '';
        status(`观看进度已同步${time ? ' · ' + time : ''}`);
      }
    })().catch(error => {
      status(`${error.message}，将在后台重试。`);
      retryTimer = setTimeout(() => { void drain().catch(() => {}); }, 5000);
      throw error;
    }).finally(() => { sending = null; });
    return sending;
  }

  namespace.adapters = [{
    id: 'inspiration-movie-player', platform: 'html5',
    canHandle: () => ready && !!global.MEZIP_MOVIE_PLAYER?.data && !global.MEZIP_MOVIE_PLAYER.verifyOnly,
    findPlayers: () => global.MEZIP_MOVIE_PLAYER?.video ? [global.MEZIP_MOVIE_PLAYER.video] : [],
    metadata: () => {
      const data = global.MEZIP_MOVIE_PLAYER?.data;
      const record = data?.record;
      return { contentType: 'MOVIE', canonicalUrl: record?.canonicalUrl || data?.sourceUrl,
        contentKey: record?.contentKey || record?.canonicalUrl || data?.sourceUrl,
        sourceUrl: record?.url || record?.canonicalUrl || data?.sourceUrl,
        sourcePageUrl: data?.sourceUrl, sourcePlatform: record?.platform || 'html5',
        title: record?.title || data?.title || '电影', videoId: record?.videoId || null,
        thumbnail: record?.thumbnail || null, titleSource: 'verified-movie-source',
        playbackLine: document.getElementById('playback-line')?.selectedOptions?.[0]?.textContent || null };
    },
  }];

  namespace.deliver = async message => {
    if (global.MEZIP_MOVIE_PLAYER?.verifyOnly || !message?.progress) throw new Error('电影尚未准备好');
    const input = message.progress;
    if (acceptedCaptures.has(input.captureId)) return { accepted: true };
    const url = new URL(input.canonicalUrl);
    // The engine freezes source identity with the played interval. A retry must
    // not rewrite an older session using whichever film is currently loaded.
    const progress = { ...input, domain: url.hostname, contentType: 'MOVIE',
      metadata: { ...input.metadata, adapter: 'inspiration-movie-player' } };
    if (!queue.some(item => item.captureId === progress.captureId)) {
      queue.push(progress);
    }
    const durable = persistCapture(progress);
    try { await drain(); }
    catch (error) {
      if (!durable) throw error;
      return { accepted: true, queued: true, error: error.message };
    }
    return { accepted: true };
  };

  global.addEventListener('mezip-movie-ready', event => {
    if (!event.detail?.data || event.detail.verifyOnly) return;
    ready = true;
    namespace.scan?.(document);
    status('实际播放后自动记录进度。');
    if (queue.length) void drain().catch(() => {});
  });
  global.addEventListener('mezip-movie-stopped', () => {
    namespace.stop?.();
    ready = false;
  });
})(window);
