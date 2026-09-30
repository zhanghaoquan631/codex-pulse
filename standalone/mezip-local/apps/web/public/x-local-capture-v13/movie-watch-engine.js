// Application transport adapter for the existing ME.zip actual-playback engine.
(function installWatchEngine(global) {
  const namespace = global.MEZIP_MOVIE_WATCH = global.MEZIP_MOVIE_WATCH || {};
  if (namespace.engineInstalled) return;
  namespace.engineInstalled = true;
  const attached = new WeakMap();
  const active = new Set();
  const checkpointSeconds = 20;
  const maxWallDelta = 12;
  const nowSeconds = () => performance.now() / 1000;
  const uid = () => crypto.randomUUID?.() || 'watch-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  const safeNumber = (value, fallback = 0) => Number.isFinite(value) ? Math.max(0, value) : fallback;
  const adapterFor = () => (namespace.adapters || []).find((adapter) => adapter.canHandle()) || null;
  const mediaSource = (player) => (player.currentSrc || '') + '\n' + (player.getAttribute('src') || '');

  function absoluteOptional(value) {
    if (!value) return null;
    try { const url = new URL(value, location.href); return /^https?:$/.test(url.protocol) ? url.href : null; } catch { return null; }
  }

  function captureFrame(state) {
    const player = state.player;
    state.frameAttemptedAt = new Date().toISOString();
    state.frameStatus = 'unavailable';
    if (player.mediaKeys) { state.frameStatus = 'protected'; return; }
    if (player.readyState < 2 || !player.videoWidth || !player.videoHeight) return;
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 256 / player.videoWidth, 160 / player.videoHeight);
      canvas.width = Math.max(1, Math.round(player.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(player.videoHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(player, 0, 0, canvas.width, canvas.height);
      // Bound the whole data URL, including base64 overhead, so 100 records
      // fit within the private bridge's response limit.
      for (const quality of [0.55, 0.35, 0.2]) {
        const data = canvas.toDataURL('image/jpeg', quality);
        if (/^data:image\/jpeg;base64,/u.test(data) && data.length <= 10_000) {
          state.lastFrame = data; state.frameCapturedAt = new Date().toISOString();
          state.framePositionSeconds = safeNumber(player.currentTime);
          state.frameStatus = 'captured'; return;
        }
      }
      state.frameStatus = 'too-large';
    } catch (error) {
      state.frameStatus = error?.name === 'SecurityError' ? 'cross-origin-blocked' : 'unavailable';
    }
  }

  // Keep a payload until the worker confirms it was saved or durably queued.
  // A retry retains its ID, so a lost response need not count playback twice.
  async function deliver(state) {
    if (state.sending || !state.outbox.length) return;
    clearTimeout(state.retryTimer);
    state.sending = true;
    try {
      while (state.outbox.length) {
        if (!namespace.deliver) throw new Error('Movie watch bridge is unavailable');
        const receipt = await namespace.deliver(state.outbox[0]);
        if (!receipt || (receipt.error && !receipt.queued) || receipt.accepted === false) throw new Error('Capture was not acknowledged');
        state.outbox.shift();
      }
    } catch {
      state.retryTimer = setTimeout(() => void deliver(state), 5000);
    } finally { state.sending = false; }
  }

  function send(state, eventType, force = false) {
    if (!force && (!state.playing || state.pendingPlayed < checkpointSeconds)) return;
    // Discovery/pressing play alone is not a watch. Zero-delta updates apply
    // only to a session that has already accumulated actual playback.
    if (state.pendingPlayed <= 0 && !state.hasPlayback) return;
    if (state.pageUrl === location.href && state.source === mediaSource(state.player)) state.refreshMetadata?.();
    const delta = Math.min(3600, state.pendingPlayed);
    state.pendingPlayed -= delta;
    state.hasPlayback ||= delta > 0;
    if (delta > 0 && state.visible && !state.seeking && !state.player.seeking && state.source === mediaSource(state.player)) captureFrame(state);
    state.sentPlayed += delta;
    const captureId = uid();
    state.outbox.push({ type: 'watch-progress', deliveryId: captureId, progress: {
      sessionId: state.sessionId,
      captureId, sequence: ++state.sequence, sessionActualPlayedSeconds: state.sentPlayed,
      contentKey: state.meta.contentKey || (state.meta.videoId ? state.meta.platform + ':' + state.meta.videoId : state.meta.canonicalUrl),
      contentType: state.meta.contentType || 'VIDEO', platform: state.meta.sourcePlatform || state.meta.platform,
      domain: state.pageDomain, videoId: state.meta.videoId || null,
      title: state.meta.title || '未命名视频', subtitle: state.subtitle,
      creator: state.meta.creator || null, url: state.meta.sourceUrl || state.pageUrl,
      canonicalUrl: state.meta.canonicalUrl, thumbnail: absoluteOptional(state.meta.thumbnail),
      poster: state.poster, durationSeconds: state.duration, currentTimeSeconds: state.lastPosition,
      actualPlayedSeconds: delta, eventType, startedAt: state.startedAt,
      endedAt: ['pause', 'ended', 'visibilitychange', 'pagehide'].includes(eventType) ? new Date().toISOString() : null,
      metadata: { adapter: state.meta.adapter, frame: window.top !== window.self ? 'iframe' : 'top', frameUrl: state.pageUrl,
        titleSource: state.meta.titleSource || 'platform', playbackLine: state.meta.playbackLine || null,
        sourcePageUrl: state.meta.sourcePageUrl || null,
        playbackLineUrl: absoluteOptional(state.pageUrl),
        ...(state.lastFrame ? { lastFrame: state.lastFrame, frameCapturedAt: state.frameCapturedAt, framePositionSeconds: state.framePositionSeconds } : {}),
        frameStatus: state.frameStatus, ...(state.frameAttemptedAt ? { frameAttemptedAt: state.frameAttemptedAt } : {}) },
    } });
    void deliver(state);
  }

  function resetClock(state) {
    state.lastWall = nowSeconds();
    state.lastMedia = safeNumber(state.player.currentTime);
    if (state.visible) state.lastPosition = state.lastMedia;
  }

  function accumulate(state) {
    const current = nowSeconds();
    const media = safeNumber(state.player.currentTime);
    const wallDelta = current - state.lastWall;
    const mediaDelta = media - state.lastMedia;
    const rate = Math.max(0.0625, safeNumber(state.player.playbackRate, 1));
    // A network "stalled" event may fire while buffered video keeps playing.
    if (state.buffering && state.player.readyState >= 3 && mediaDelta > 0) state.buffering = false;
    // Buffering, seeks, paused media and long background timer gaps cannot
    // manufacture viewing time. Media time must actually advance.
    if (state.playing && state.visible && !state.buffering && !state.seeking && !state.player.seeking
      && wallDelta > 0 && wallDelta <= maxWallDelta && mediaDelta > 0
      && mediaDelta <= wallDelta * rate * 1.5 + 0.25) {
      state.pendingPlayed += Math.min(wallDelta, mediaDelta / rate);
      if (current - state.frameWall >= 1) { captureFrame(state); state.frameWall = current; }
    }
    if (state.visible) state.lastPosition = media;
    state.lastWall = current; state.lastMedia = media;
  }

  function attach(player) {
    if (!(player instanceof HTMLVideoElement) || attached.has(player)) return;
    const adapter = adapterFor();
    if (!adapter) return;
    const raw = adapter.metadata(player) || {};
    const state = {
      player, source: mediaSource(player), pageUrl: location.href, pageDomain: location.hostname,
      meta: { ...raw, platform: adapter.platform, adapter: adapter.id, canonicalUrl: absoluteOptional(raw.canonicalUrl) || location.href },
      subtitle: document.querySelector('meta[property="og:description"]')?.getAttribute('content') || null,
      poster: absoluteOptional(player.getAttribute('poster')), duration: safeNumber(player.duration),
      sessionId: uid(), startedAt: new Date().toISOString(), playing: !player.paused && !player.ended,
      buffering: player.readyState < 2, seeking: !!player.seeking,
      pendingPlayed: 0, hasPlayback: false, lastWall: nowSeconds(), lastMedia: safeNumber(player.currentTime),
      lastPosition: safeNumber(player.currentTime), visible: document.visibilityState !== 'hidden',
      sentPlayed: 0, sequence: 0, frameWall: -Infinity, frameStatus: 'unavailable', lastFrame: null,
      outbox: [], sending: false, retryTimer: null,
    };
    const handlers = {};
    const onMetadata = () => {
      const latest = adapter.metadata(player) || {};
      state.meta = { ...state.meta, ...latest, platform: adapter.platform, adapter: adapter.id,
        canonicalUrl: absoluteOptional(latest.canonicalUrl) || state.pageUrl };
      state.duration = safeNumber(player.duration);
      state.poster = absoluteOptional(player.getAttribute('poster'));
      if (state.meta.contentType === 'VIDEO' && state.duration >= 75 * 60) state.meta.contentType = 'MOVIE';
    };
    state.refreshMetadata = onMetadata;
    const currentState = () => reconcile(player) === state;
    handlers.play = handlers.playing = () => {
      if (!currentState()) return;
      state.playing = true; state.buffering = false; resetClock(state); onMetadata();
    };
    handlers.timeupdate = () => { if (!currentState()) return; accumulate(state); send(state, 'progress'); };
    handlers.pause = () => { if (!currentState()) return; accumulate(state); state.playing = false; send(state, 'pause', true); };
    handlers.waiting = handlers.stalled = () => { if (!currentState()) return; accumulate(state); state.buffering = true; };
    handlers.seeking = () => { if (!currentState()) return; state.seeking = true; resetClock(state); send(state, 'seeking', true); };
    handlers.seeked = () => { if (!currentState()) return; state.seeking = false; resetClock(state); send(state, 'seeked', true); };
    handlers.ratechange = () => { if (currentState()) resetClock(state); };
    handlers.loadedmetadata = handlers.durationchange = () => { if (currentState()) onMetadata(); };
    handlers.ended = () => { if (!currentState()) return; accumulate(state); state.playing = false; send(state, 'ended', true); };
    handlers.loadstart = handlers.emptied = () => {
      state.cleanup();
      setTimeout(() => { if (player.isConnected !== false) attach(player); }, 0);
    };
    state.cleanup = () => {
      // The next film may already have replaced currentTime/src; flush the
      // previous film with its last sampled position and original metadata.
      send(state, 'pagehide', true);
      for (const [name, handler] of Object.entries(handlers)) player.removeEventListener(name, handler);
      attached.delete(player); active.delete(state);
    };
    for (const [name, handler] of Object.entries(handlers)) player.addEventListener(name, handler);
    attached.set(player, state); active.add(state);
    onMetadata();
  }

  function reconcile(player) {
    const prior = attached.get(player);
    if (prior && (prior.pageUrl !== location.href || prior.source !== mediaSource(player) || player.isConnected === false)) prior.cleanup();
    if (player.isConnected !== false) attach(player);
    return attached.get(player);
  }

  function scan(root = document) {
    const adapter = adapterFor();
    if (adapter) for (const player of adapter.findPlayers(root)) reconcile(player);
  }

  function checkpoint() {
    for (const state of [...active]) {
      if (reconcile(state.player) !== state) continue;
      accumulate(state); send(state, 'progress');
    }
    scan(document);
  }

  document.addEventListener('visibilitychange', () => {
    for (const state of [...active]) {
      if (reconcile(state.player) !== state) continue;
      // Flush the interval while it was visible, then stop accumulating until
      // the browser reports this document visible again.
      if (document.visibilityState !== 'visible') { accumulate(state); send(state, 'visibilitychange', true); state.visible = false; }
      else { state.visible = true; resetClock(state); }
    }
  });
  global.addEventListener('pagehide', () => {
    for (const state of [...active]) {
      if (reconcile(state.player) === state) { accumulate(state); send(state, 'pagehide', true); }
    }
  });
  // Patching history in the extension's isolated JS world does not observe
  // page-world pushState. Check actual URL/source changes without patching it.
  global.addEventListener('popstate', checkpoint);
  global.addEventListener('hashchange', checkpoint);
  namespace.scan = scan;
  namespace.stop = () => {
    for (const state of [...active]) {
      if (state.pageUrl === location.href && state.source === mediaSource(state.player)) accumulate(state);
      state.cleanup();
    }
  };
  new MutationObserver(() => checkpoint()).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  setInterval(checkpoint, 1000);
  scan(document);
})(globalThis);
