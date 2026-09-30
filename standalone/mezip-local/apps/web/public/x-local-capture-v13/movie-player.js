(function startMoviePlayer(global) {
  'use strict';

  const video = document.getElementById('movie-video');
  const lines = document.getElementById('playback-line');
  const playButton = document.getElementById('play-button');
  const stopButton = document.getElementById('stop-button');
  const status = document.getElementById('player-status');
  const title = document.getElementById('movie-title');
  const platform = document.getElementById('movie-platform');
  const original = document.getElementById('original-source');
  let data = null;
  let verifyOnly = false;
  let hls = null;
  let generation = 0;
  let selectedIndex = 0;
  let resumePosition = 0;
  let mediaActive = false;
  let metadataReady = false;
  let requestedPlay = false;
  let metadataListener = null;
  let resumeListener = null;
  let resumeTimer = null;
  let unloading = false;

  function httpsUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
      url.hash = '';
      return url.href;
    } catch { return null; }
  }

  function movieSource(value) {
    const normalized = httpsUrl(value);
    if (!normalized) return null;
    const url = new URL(normalized);
    if (['2nyy.com', 'www.2nyy.com'].includes(url.hostname) && /^\/dianying\/\d+\.html$/u.test(url.pathname)) return normalized;
    if (['oddym.com', 'www.oddym.com'].includes(url.hostname) && /^\/detail\/\d+\/?$/u.test(url.pathname)) return normalized;
    return null;
  }

  function message(value, error = false) {
    status.textContent = value;
    status.classList.toggle('is-error', error);
  }

  function dispatch(name, detail = {}) {
    global.dispatchEvent(new CustomEvent(name, { detail: { video, data, verifyOnly, ...detail } }));
  }

  function clearResumeListeners() {
    if (resumeListener) video.removeEventListener('seeked', resumeListener);
    if (resumeTimer !== null) clearTimeout(resumeTimer);
    resumeListener = null;
    resumeTimer = null;
  }

  function teardown(reason, announce = true) {
    if (metadataReady && Number.isFinite(video.currentTime)) resumePosition = Math.max(0, video.currentTime);
    generation += 1;
    requestedPlay = false;
    mediaActive = false;
    metadataReady = false;
    video.pause();
    if (announce) dispatch('mezip-movie-stopped', { reason });
    if (metadataListener) video.removeEventListener('loadedmetadata', metadataListener);
    metadataListener = null;
    clearResumeListeners();
    if (hls) { hls.destroy(); hls = null; }
    video.removeAttribute('src');
    video.load();
  }

  function play() {
    if (!data || unloading) return;
    if (!mediaActive) prepare(selectedIndex);
    if (!mediaActive) return;
    requestedPlay = true;
    const result = video.play();
    if (result && typeof result.catch === 'function') result.catch(error => {
      if (unloading || error?.name === 'AbortError') return;
      message('浏览器尚未开始播放。请点击视频中的播放按钮，或切换其他线路。', true);
    });
  }

  function completeMetadata(expectedGeneration, wantedPosition) {
    if (expectedGeneration !== generation || !mediaActive || unloading || metadataReady) return;
    clearResumeListeners();
    metadataReady = true;
    dispatch('mezip-movie-ready');
    message(wantedPosition > 0 ? `已恢复到 ${Math.floor(video.currentTime)} 秒。点击播放即可继续观看。` : '线路已准备好。点击播放开始观看。');
    if (requestedPlay) play();
  }

  function onMetadata(expectedGeneration) {
    if (expectedGeneration !== generation || !mediaActive || unloading) return;
    const duration = Number(video.duration);
    const position = Number.isFinite(resumePosition) ? Math.max(0, resumePosition) : 0;
    const wanted = Number.isFinite(duration) && duration > 0 ? Math.min(position, Math.max(0, duration - .1)) : position;
    video.pause();
    if (wanted > 0 && Math.abs(video.currentTime - wanted) > .05) {
      message(`正在恢复到 ${Math.floor(wanted)} 秒，请等待视频加载。`);
      resumeListener = () => completeMetadata(expectedGeneration, wanted);
      video.addEventListener('seeked', resumeListener, { once: true });
      try { video.currentTime = wanted; } catch { clearResumeListeners(); completeMetadata(expectedGeneration, 0); return; }
      // Some native players seek immediately without delivering seeked. Only
      // announce readiness if the requested position has actually been applied.
      resumeTimer = setTimeout(() => {
        if (Math.abs(video.currentTime - wanted) < .5) completeMetadata(expectedGeneration, wanted);
        else { clearResumeListeners(); message('播放位置尚未恢复，请等待视频加载或切换线路。', true); }
      }, 5000);
    } else completeMetadata(expectedGeneration, wanted);
  }

  function prepare(index) {
    if (!data?.sources[index] || unloading) return;
    teardown('line-change', mediaActive);
    selectedIndex = index;
    lines.value = String(index);
    const source = data.sources[index];
    const expectedGeneration = generation;
    mediaActive = true;
    metadataListener = () => onMetadata(expectedGeneration);
    video.addEventListener('loadedmetadata', metadataListener, { once: true });
    message(`正在加载${source.label}。加载失败时可以切换其他线路。`);
    const mediaUrl = new URL(source.url);
    const hlsSource = /mpegurl/iu.test(source.mimeType || '') || /\.m3u8$/iu.test(mediaUrl.pathname);
    if (hlsSource) {
      if (typeof global.Hls === 'function' && global.Hls.isSupported()) {
        const instance = new global.Hls();
        hls = instance;
        instance.on(global.Hls.Events.ERROR, (_event, error) => {
          if (expectedGeneration !== generation || !error?.fatal || unloading) return;
          const httpStatus = Number(error.response?.code);
          const extra = Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus < 600 ? `（HTTP ${httpStatus}）` : '';
          teardown('playback-error');
          message(`本线路视频加载失败${extra}。请切换其他线路，或到原站播放。`, true);
        });
        try { instance.loadSource(source.url); instance.attachMedia(video); }
        catch { teardown('playback-error'); message('本线路无法启动，请切换其他线路，或到原站播放。', true); }
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = source.url;
        video.load();
      } else {
        teardown('unsupported-format');
        message('当前浏览器不支持此线路的视频格式。请切换其他线路，或到原站播放。', true);
      }
    } else {
      video.src = source.url;
      video.load();
    }
  }

  lines.addEventListener('change', () => {
    const index = Number(lines.value);
    if (Number.isInteger(index) && index >= 0 && index < (data?.sources.length || 0)) prepare(index);
  });
  playButton.addEventListener('click', play);
  stopButton.addEventListener('click', () => { teardown('stop'); message('已停止播放。点击“播放 / 继续观看”即可重新载入线路。'); });
  video.addEventListener('play', () => {
    if (!mediaActive || unloading) return;
    requestedPlay = true;
    if (metadataReady) message('正在开始播放，等待视频缓冲。');
  });
  video.addEventListener('playing', () => {
    if (mediaActive && metadataReady && !video.paused && !unloading) message('正在播放。');
  });
  video.addEventListener('pause', () => {
    if (!mediaActive || !metadataReady || !video.paused || unloading) return;
    requestedPlay = false;
    message(video.ended ? '视频已播放结束。' : '已暂停。点击播放即可继续观看。');
  });
  video.addEventListener('waiting', () => {
    if (mediaActive && metadataReady && !video.paused && !unloading) message('正在缓冲，请稍候。');
  });
  video.addEventListener('seeking', () => {
    if (mediaActive && metadataReady && !unloading) message('正在跳转播放位置，请稍候。');
  });
  video.addEventListener('seeked', () => {
    if (!mediaActive || !metadataReady || unloading) return;
    message(video.paused ? '已暂停。点击播放即可继续观看。' : '播放位置已更新，正在准备继续播放。');
  });
  video.addEventListener('ended', () => {
    if (mediaActive && metadataReady && !unloading) message('视频已播放结束。');
  });
  video.addEventListener('error', () => {
    if (!mediaActive || unloading) return;
    teardown('playback-error');
    message('本线路视频加载失败。请切换其他线路，或到原站播放。', true);
  });
  global.addEventListener('pagehide', () => { unloading = true; teardown('pagehide'); });

  global.MEZIP_MOVIE_PLAYER = Object.freeze({ video, get data() { return data; }, get verifyOnly() { return verifyOnly; } });

  async function initialize() {
    let source;
    try {
      const query = new URLSearchParams(global.location.search);
      verifyOnly = query.get('verify') === '1';
      document.getElementById('verify-note').hidden = !verifyOnly;
      if (query.getAll('source').length !== 1 || query.getAll('verify').length > 1 || [...query.keys()].some(key => !['source', 'verify'].includes(key))) throw new Error('Invalid source query');
      source = movieSource(query.get('source'));
      if (!source) throw new Error('Invalid movie source');
    } catch {
      title.textContent = '无法打开电影播放器';
      message('请从灵感库打开受支持的电影详情页。此播放器只接受 2nyy 或 oddym 的 HTTPS 电影详情链接。', true);
      return;
    }
    original.href = source;
    original.hidden = false;
    const endpoint = new URL('http://127.0.0.1:4319/v1/resources/movie-playback');
    endpoint.searchParams.set('url', source);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch(endpoint.href, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' }, signal: controller.signal, redirect: 'error' });
      if (!response.ok) throw new Error('Movie playback API failed');
      const body = await response.json();
      const value = body?.data ?? body;
      if (!value || typeof value !== 'object' || movieSource(value.sourceUrl) !== source || !Array.isArray(value.sources)) throw new Error('Movie playback API returned mismatched data');
      const sources = value.sources.slice(0, 30).flatMap((candidate, index) => {
        const url = httpsUrl(candidate?.url);
        if (!url) return [];
        return [{ id: typeof candidate.id === 'string' ? candidate.id.slice(0, 200) : String(index),
          label: typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label.trim().slice(0, 120) : `线路 ${index + 1}`,
          url, mimeType: typeof candidate.mimeType === 'string' ? candidate.mimeType.trim().slice(0, 100) : '' }];
      });
      if (!sources.length) {
        const warnings = Array.isArray(value.warnings) ? value.warnings.filter(item => typeof item === 'string' && item.trim()).slice(0, 3).map(item => item.trim().slice(0, 400)) : [];
        title.textContent = '暂时没有可用的播放线路';
        message(warnings.length ? warnings.join(' ') : '此站暂需到原站播放。本机服务尚未取得可用线路。', true);
        return;
      }
      data = { sourceUrl: source, title: typeof value.title === 'string' && value.title.trim() ? value.title.trim().slice(0, 500) : '电影播放',
        platform: typeof value.platform === 'string' ? value.platform.slice(0, 100) : new URL(source).hostname,
        sources, record: value.record && typeof value.record === 'object' && !Array.isArray(value.record) ? value.record : null };
      title.textContent = data.title;
      platform.textContent = data.platform;
      resumePosition = Number.isFinite(Number(data.record?.currentTimeSeconds)) ? Math.max(0, Number(data.record.currentTimeSeconds)) : 0;
      for (let index = 0; index < sources.length; index += 1) {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = sources[index].label;
        lines.append(option);
      }
      lines.disabled = false;
      playButton.disabled = false;
      stopButton.disabled = false;
      prepare(0);
    } catch {
      title.textContent = '暂时无法读取播放线路';
      message('本机播放服务未返回可用线路。可以稍后重试，或点击“到原站播放”。', true);
    } finally { clearTimeout(timer); }
  }

  void initialize();
})(window);
