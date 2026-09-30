const $ = (selector) => document.querySelector(selector);

const elements = {
  preview: $('#cameraPreview'),
  cameraEmpty: $('#cameraEmpty'),
  cameraStatus: $('#cameraStatus'),
  startCamera: $('#startCamera'),
  cameraFrame: $('#cameraFrame'),
  cameraResolution: $('#cameraResolution'),
  captureCanvas: $('#captureCanvas'),
  countdown: $('#countdown'),
  cameraFlash: $('#cameraFlash'),
  cameraGrid: $('#cameraGrid'),
  toggleGrid: $('#toggleGrid'),
  ratioButton: $('#ratioButton'),
  ratioLabel: $('#ratioLabel'),
  selectedEffectName: $('#selectedEffectName'),
  recordHud: $('#recordHud'),
  timerButton: $('#timerButton'),
  timerLabel: $('#timerLabel'),
  mirrorButton: $('#mirrorButton'),
  mirrorLabel: $('#mirrorLabel'),
  shutterButton: $('#shutterButton'),
  captureNote: $('#captureNote'),
  effectCategories: $('#effectCategories'),
  effectGrid: $('#effectGrid'),
  clearEffect: $('#clearEffect'),
  brightnessRange: $('#brightnessRange'),
  brightnessValue: $('#brightnessValue'),
  softnessRange: $('#softnessRange'),
  softnessValue: $('#softnessValue'),
  resetAdjustments: $('#resetAdjustments'),
  recentGroups: $('#recentGroups'),
  recentPhotoStrip: $('#recentPhotoStrip'),
  recentVideoStrip: $('#recentVideoStrip'),
  recentPhotoCount: $('#recentPhotoCount'),
  recentVideoCount: $('#recentVideoCount'),
  openGallery: $('#openGallery'),
  openGalleryInline: $('#openGalleryInline'),
  galleryDialog: $('#galleryDialog'),
  galleryGrid: $('#galleryGrid'),
  galleryHelp: $('#galleryHelp'),
  mediaViewerDialog: $('#mediaViewerDialog'),
  mediaViewerTitle: $('#mediaViewerTitle'),
  mediaViewerMedia: $('#mediaViewerMedia'),
  mediaViewerMeta: $('#mediaViewerMeta'),
  mediaViewerEdit: $('#mediaViewerEdit'),
  mediaViewerDownload: $('#mediaViewerDownload'),
  mediaViewerCopy: $('#mediaViewerCopy'),
  mediaDragOut: $('#mediaDragOut'),
  mediaDragLabel: $('#mediaDragLabel'),
  mediaEditorDialog: $('#mediaEditorDialog'),
  mediaEditorTitle: $('#mediaEditorTitle'),
  mediaEditorPreview: $('#mediaEditorPreview'),
  editorEffectGrid: $('#editorEffectGrid'),
  editorBrightnessRange: $('#editorBrightnessRange'),
  editorBrightnessValue: $('#editorBrightnessValue'),
  editorSoftnessRange: $('#editorSoftnessRange'),
  editorSoftnessValue: $('#editorSoftnessValue'),
  editorExportButton: $('#editorExportButton'),
  editorStatus: $('#editorStatus'),
  importMediaButton: $('#importMediaButton'),
  importMediaInput: $('#importMediaInput'),
  openMobileStudio: $('#openMobileStudio'),
  mobileStudioDialog: $('#mobileStudioDialog'),
  mobileStudioLink: $('#mobileStudioLink'),
  copyMobileStudioLink: $('#copyMobileStudioLink'),
  mobileStudioStatus: $('#mobileStudioStatus'),
  settingsDialog: $('#settingsDialog'),
  openSettings: $('#openSettings'),
  cameraSelect: $('#cameraSelect'),
  qualitySelect: $('#qualitySelect'),
  previewMirrorToggle: $('#previewMirrorToggle'),
  saveMirrorToggle: $('#saveMirrorToggle'),
  microphoneToggle: $('#microphoneToggle'),
  microphoneQuickToggle: $('#microphoneQuickToggle'),
  microphoneQuickLabel: $('#microphoneQuickLabel'),
  toast: $('#toast'),
};

const EFFECTS = [
  { id: 'original', name: '原片', icon: '◌', category: '基础', filter: 'none' },
  { id: 'rose', name: '柔粉', icon: '✦', category: '基础', filter: 'brightness(1.07) saturate(1.08) sepia(.08) hue-rotate(322deg)' },
  { id: 'clean', name: '清透', icon: '◇', category: '基础', filter: 'brightness(1.09) contrast(.98) saturate(.94)' },
  { id: 'warm', name: '奶油', icon: '☀', category: '胶片', filter: 'brightness(1.04) sepia(.21) saturate(.94) hue-rotate(340deg)' },
  { id: 'cold', name: '冰蓝', icon: '❄', category: '胶片', filter: 'brightness(1.02) saturate(.88) hue-rotate(169deg)' },
  { id: 'dream', name: '梦幻', icon: '☁', category: '胶片', filter: 'brightness(1.11) saturate(.91) contrast(.86) blur(.25px)' },
  { id: 'film', name: '暖胶片', icon: '◉', category: '胶片', filter: 'contrast(.94) saturate(.76) sepia(.23) brightness(1.03)' },
  { id: 'ccd', name: 'CCD 闪光', icon: '✧', category: 'CCD', filter: 'brightness(1.14) contrast(1.12) saturate(1.23) hue-rotate(349deg)' },
  { id: 'pastel', name: '马卡龙', icon: '◍', category: 'CCD', filter: 'brightness(1.08) saturate(1.18) contrast(.87) hue-rotate(338deg)' },
  { id: 'vhs', name: 'VHS', icon: '▤', category: '复古', filter: 'contrast(1.17) saturate(.74) sepia(.09) brightness(.97)' },
  { id: 'mono', name: '黑白', icon: '◐', category: '基础', filter: 'grayscale(1) contrast(1.15)' },
  { id: 'mirror', name: '镜像双生', icon: '◍', category: '趣味', filter: 'saturate(1.17) contrast(1.04)' },
];

const CATEGORY_NAMES = ['全部', '基础', '胶片', 'CCD', '复古', '趣味', '收藏'];
const RATIOS = ['4:3', '3:4', '1:1', '16:9'];
const MODES = {
  photo: { name: '拍照', note: '拍摄会先保存在当前设备的 SweetCam 本地图库；可随时下载原文件。' },
  video: { name: '录像', note: '录像结束后会先保存在当前设备的本地图库；V1 录像保留原始摄像头画面，可在图库中再次加滤镜。' },
  strip: { name: '四连拍', note: '完成一次倒计时后，SweetCam 会连续拍下 4 张并合成一张大头贴。' },
  burst: { name: '连拍', note: '一次会连续拍下 3 张真实照片，并分别保存在本地图库。' },
};

const state = {
  stream: null,
  selectedDeviceId: '',
  quality: 'auto',
  mode: 'photo',
  ratio: '4:3',
  timer: 0,
  mirrorPreview: true,
  mirrorSaved: false,
  microphone: false,
  isGridOn: false,
  selectedEffectId: 'rose',
  selectedCategory: '全部',
  effectFavorites: readLocalJson('sweetcam-v1-effect-favorites', []),
  recentEffects: readLocalJson('sweetcam-v1-recent-effects', ['rose']),
  brightness: 0,
  softness: 0,
  isRecording: false,
  mediaRecorder: null,
  recordTimer: null,
  recordStartedAt: 0,
  records: [],
  galleryFilter: 'all',
  cameraBusy: false,
  isCapturing: false,
  openRecordId: '',
  editor: {
    sourceRecordId: '',
    effectId: 'original',
    brightness: 0,
    softness: 0,
    isExporting: false,
  },
};

let databasePromise;
let toastTimer;
const recordObjectUrls = new Map();
const recordDragUrls = new Map();
const recordDragUrlPromises = new Map();
const MOBILE_BRIDGE_PORT = '4330';
let desktopBridgeSessionReady = false;
let bridgeImportInFlight = false;
let bridgePollTimer;

function isMobileBridgeStudio() {
  return window.location.port === MOBILE_BRIDGE_PORT;
}

function isDesktopSweetCamStudio() {
  return window.location.hostname === '127.0.0.1' && window.location.port === '5174';
}

function mobileBridgeBaseUrl() {
  return isMobileBridgeStudio() ? window.location.origin : `http://127.0.0.1:${MOBILE_BRIDGE_PORT}`;
}

async function bridgeJson(path, options = {}) {
  const response = await fetch(`${mobileBridgeBaseUrl()}${path}`, {
    credentials: 'include',
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || 'SweetCam 手机连接暂不可用。');
  return body;
}

async function ensureDesktopBridgeSession() {
  if (!isDesktopSweetCamStudio()) return false;
  if (desktopBridgeSessionReady) return true;
  await bridgeJson('/v1/sweetcam/mobile/desktop-session');
  desktopBridgeSessionReady = true;
  return true;
}

async function syncRecordToMobileBridge(record) {
  if (!isMobileBridgeStudio() || record.remoteId || !record.blob) return;
  try {
    const response = await fetch(`${mobileBridgeBaseUrl()}/v1/sweetcam/mobile/uploads`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': recordMimeType(record),
        'X-SweetCam-Filename': encodeURIComponent(record.sourceName || exportName(record)),
      },
      body: record.blob,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.media?.id) throw new Error(body?.error?.message || '上传到电脑失败');
    record.remoteId = body.media.id;
    await saveRecord(record);
  } catch (error) {
    showToast(error?.message || '手机文件尚未同步到电脑，请检查同一 Wi-Fi 连接。');
  }
}

async function importMobileBridgeMedia({ quiet = true } = {}) {
  if (!isDesktopSweetCamStudio() || bridgeImportInFlight) return;
  bridgeImportInFlight = true;
  try {
    await ensureDesktopBridgeSession();
    const listed = await bridgeJson('/v1/sweetcam/media');
    const existingRemoteIds = new Set(state.records.map((record) => record.remoteId).filter(Boolean));
    const pending = (listed.media || []).filter((record) => record?.id && !existingRemoteIds.has(record.id));
    for (const remote of pending) {
      const response = await fetch(`${mobileBridgeBaseUrl()}${remote.mediaUrl}`, { credentials: 'include' });
      if (!response.ok) continue;
      const blob = await response.blob();
      let dimensions = {};
      let previewUnavailable = false;
      try { dimensions = await sourceDimensions(blob, remote.kind); } catch { previewUnavailable = true; }
      await addMediaRecord({
        blob,
        kind: remote.kind === 'video' ? 'video' : 'photo',
        effect: '原片',
        effectId: 'original',
        recipe: { effectId: 'original', brightness: 0, softness: 0, mirror: false },
        width: dimensions.width,
        height: dimensions.height,
        createdAt: Number(new Date(remote.createdAt)) || Date.now(),
        source: 'phone-upload',
        sourceName: remote.fileName || '',
        sourceMimeType: remote.mimeType || blob.type,
        remoteId: remote.id,
        renderBasis: 'external-file-v1',
        previewUnavailable,
      });
    }
    if (pending.length && !quiet) showToast(`已从手机导入 ${pending.length} 个原始文件。`);
  } catch {
    desktopBridgeSessionReady = false;
  } finally {
    bridgeImportInFlight = false;
  }
}

async function openMobileStudioDialog() {
  if (isMobileBridgeStudio()) {
    showToast('你已在手机 SweetCam 页面，可直接上传并编辑照片或录像。');
    return;
  }
  elements.mobileStudioLink.value = '正在生成手机链接…';
  elements.mobileStudioStatus.textContent = '正在检查本机手机上传服务…';
  openDialog(elements.mobileStudioDialog);
  try {
    await ensureDesktopBridgeSession();
    const invite = await bridgeJson('/v1/sweetcam/mobile/invite', { method: 'POST' });
    elements.mobileStudioLink.value = invite.mobileUrl || '';
    const expiry = invite.expiresAt ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(invite.expiresAt)) : '';
    elements.mobileStudioStatus.textContent = `链接仅在同一 Wi‑Fi 内可用${expiry ? `，本次配对有效到 ${expiry}` : ''}。手机首次打开后会安全地保存配对。`;
  } catch (error) {
    elements.mobileStudioLink.value = '';
    elements.mobileStudioStatus.textContent = error?.message || '手机上传服务尚未启动。';
  }
}

async function copyMobileStudioLink() {
  const link = elements.mobileStudioLink.value;
  if (!link) {
    showToast('请先等待手机链接生成。');
    return;
  }
  try {
    await navigator.clipboard.writeText(link);
    showToast('手机链接已复制。');
  } catch {
    elements.mobileStudioLink.select();
    showToast('已选中手机链接，请按 Ctrl+C 复制。');
  }
}

function readLocalJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function persistEffectPreferences() {
  try {
    localStorage.setItem('sweetcam-v1-effect-favorites', JSON.stringify(state.effectFavorites));
    localStorage.setItem('sweetcam-v1-recent-effects', JSON.stringify(state.recentEffects.slice(0, 10)));
  } catch {
    // 浏览器的本地偏好不可用时，当前会话仍正常工作。
  }
}

function getEffect(id = state.selectedEffectId) {
  return EFFECTS.find((effect) => effect.id === id) || EFFECTS[0];
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 3600);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isCameraReady() {
  return Boolean(state.stream && elements.preview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && elements.preview.videoWidth);
}

function normalizeDeviceLabel(device, index) {
  return device.label || `摄像头 ${index + 1}`;
}

function videoConstraints() {
  const quality = state.quality;
  const resolution = quality === '720'
    ? { width: { ideal: 1280 }, height: { ideal: 720 } }
    : quality === '1080'
      ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
      : { width: { ideal: 1280 }, height: { ideal: 960 } };

  return {
    ...resolution,
    frameRate: { ideal: 30, max: 60 },
    ...(state.selectedDeviceId ? { deviceId: { exact: state.selectedDeviceId } } : {}),
  };
}

function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

function hasLiveAudioTrack(stream = state.stream) {
  return Boolean(stream?.getAudioTracks().some((track) => track.readyState === 'live'));
}

function releaseAudioTracks(stream = state.stream) {
  if (!stream) return;
  stream.getAudioTracks().forEach((track) => {
    stream.removeTrack(track);
    track.stop();
  });
}

async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === 'videoinput');
    const current = state.selectedDeviceId;
    elements.cameraSelect.replaceChildren();

    if (!cameras.length) {
      const option = new Option('未检测到摄像头', '');
      elements.cameraSelect.add(option);
      return;
    }

    cameras.forEach((camera, index) => {
      const option = new Option(normalizeDeviceLabel(camera, index), camera.deviceId);
      option.selected = camera.deviceId === current || (!current && index === 0);
      elements.cameraSelect.add(option);
    });

    if (!state.selectedDeviceId && cameras[0]) state.selectedDeviceId = cameras[0].deviceId;
  } catch {
    elements.cameraSelect.replaceChildren(new Option('暂时无法读取设备', ''));
  }
}

function updateCameraFacts() {
  const track = state.stream?.getVideoTracks()[0];
  const settings = track?.getSettings?.() || {};
  const width = settings.width || elements.preview.videoWidth;
  const height = settings.height || elements.preview.videoHeight;
  elements.cameraResolution.textContent = width && height ? `${width} × ${height}` : '已连接';
}

async function startCamera({ includeAudio = false, force = false } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    elements.cameraStatus.textContent = '这个浏览器不支持本地摄像头访问。请用新版 Chrome 或 Edge 打开。';
    return false;
  }
  if (state.cameraBusy) return false;

  const hasAudio = hasLiveAudioTrack(state.stream);
  if (state.stream && !force && hasAudio === Boolean(includeAudio)) return true;

  state.cameraBusy = true;
  elements.startCamera.disabled = true;
  elements.cameraStatus.textContent = includeAudio ? '正在请求摄像头和麦克风权限…' : '正在请求摄像头权限…';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints(),
      audio: includeAudio ? { echoCancellation: true, noiseSuppression: true } : false,
    });
    const oldStream = state.stream;
    state.stream = stream;
    elements.preview.srcObject = stream;
    await elements.preview.play().catch(() => undefined);
    if (oldStream && oldStream !== stream) stopStream(oldStream);

    elements.cameraEmpty.classList.add('is-hidden');
    elements.cameraStatus.textContent = '摄像头已连接。';
    await refreshDevices();
    updateCameraFacts();
    syncEffectPreviewStreams();
    applyPreviewStyle();
    return true;
  } catch (error) {
    const name = error?.name || '';
    const message = name === 'NotAllowedError'
      ? '尚未获得设备权限。请在浏览器地址栏允许 SweetCam 使用摄像头。'
      : name === 'NotFoundError'
        ? '没有找到可用摄像头。请连接设备后重试。'
        : '无法启用摄像头，请检查系统设备权限后重试。';
    elements.cameraStatus.textContent = message;
    elements.cameraEmpty.classList.remove('is-hidden');
    showToast(message);
    return false;
  } finally {
    state.cameraBusy = false;
    elements.startCamera.disabled = false;
  }
}

function filterFor({ effectId = 'original', brightness = 0, softness = 0 } = {}) {
  const effect = getEffect(effectId);
  const effectFilter = effect.filter === 'none' ? '' : effect.filter;
  const brightnessFilter = brightness ? `brightness(${100 + brightness}%)` : '';
  const softnessFilter = softness ? `blur(${(softness / 14).toFixed(2)}px)` : '';
  return [effectFilter, brightnessFilter, softnessFilter].filter(Boolean).join(' ') || 'none';
}

function activeFilter() {
  return filterFor({
    effectId: state.selectedEffectId,
    brightness: state.brightness,
    softness: state.softness,
  });
}

function applyPreviewStyle() {
  elements.preview.style.setProperty('--camera-filter', activeFilter());
  elements.preview.classList.toggle('is-mirrored', state.mirrorPreview);
  elements.mirrorButton.setAttribute('aria-pressed', String(state.mirrorPreview));
  elements.mirrorLabel.textContent = state.mirrorPreview ? '镜像开' : '镜像关';
  elements.previewMirrorToggle.checked = state.mirrorPreview;
  elements.saveMirrorToggle.checked = state.mirrorSaved;
  elements.microphoneToggle.checked = state.microphone;
  elements.microphoneQuickToggle.setAttribute('aria-pressed', String(state.microphone));
  elements.microphoneQuickToggle.disabled = state.isRecording;
  elements.microphoneToggle.disabled = state.isRecording;
  elements.microphoneQuickLabel.textContent = state.microphone ? '麦克风开' : '麦克风关';
  elements.selectedEffectName.textContent = getEffect().name;
}

function syncEffectPreviewStreams() {
  document.querySelectorAll('.effect-preview video').forEach((video) => {
    if (state.stream && video.srcObject !== state.stream) {
      video.srcObject = state.stream;
      video.play().then(() => video.classList.add('is-live')).catch(() => video.classList.remove('is-live'));
    } else if (!state.stream) {
      video.classList.remove('is-live');
    }
  });
}

function renderCategories() {
  elements.effectCategories.innerHTML = CATEGORY_NAMES.map((category) => `
    <button class="category-chip${category === state.selectedCategory ? ' is-active' : ''}" data-category="${category}" type="button">${category}</button>
  `).join('');
}

function currentEffectList() {
  if (state.selectedCategory === '全部') return EFFECTS;
  if (state.selectedCategory === '收藏') return EFFECTS.filter((effect) => state.effectFavorites.includes(effect.id));
  return EFFECTS.filter((effect) => effect.category === state.selectedCategory);
}

function renderEffects() {
  const effects = currentEffectList();
  if (!effects.length) {
    elements.effectGrid.innerHTML = '<div class="recent-empty" style="grid-column:1/-1;min-height:112px">还没有收藏特效</div>';
    return;
  }

  elements.effectGrid.innerHTML = effects.map((effect) => {
    const favorite = state.effectFavorites.includes(effect.id);
    return `
      <div class="effect-card${effect.id === state.selectedEffectId ? ' is-active' : ''}" data-effect="${effect.id}">
        <button class="effect-select" type="button" aria-label="选择${effect.name}" aria-pressed="${effect.id === state.selectedEffectId}">
        <span class="effect-preview" style="--effect-filter:${effect.filter}">
          <span class="effect-fallback" aria-hidden="true"><span class="effect-fallback-icon">${effect.icon}</span><span class="effect-fallback-label">${effect.name}</span></span>
          <video autoplay muted playsinline aria-hidden="true"></video>
        </span>
        <span class="effect-card-name">${effect.name}</span>
        </button>
        <button class="favorite-effect${favorite ? ' is-favorite' : ''}" data-favorite-effect="${effect.id}" type="button" aria-label="${favorite ? '取消收藏' : '收藏'} ${effect.name}">${favorite ? '♥' : '♡'}</button>
      </div>
    `;
  }).join('');
  syncEffectPreviewStreams();
}

function selectEffect(id) {
  if (!getEffect(id)) return;
  state.selectedEffectId = id;
  state.recentEffects = [id, ...state.recentEffects.filter((recentId) => recentId !== id)].slice(0, 10);
  persistEffectPreferences();
  applyPreviewStyle();
  renderEffects();
}

function toggleEffectFavorite(id) {
  if (state.effectFavorites.includes(id)) {
    state.effectFavorites = state.effectFavorites.filter((favoriteId) => favoriteId !== id);
  } else {
    state.effectFavorites = [...state.effectFavorites, id];
  }
  persistEffectPreferences();
  renderEffects();
}

function updateAdjustmentLabels() {
  elements.brightnessValue.value = state.brightness;
  elements.softnessValue.value = state.softness;
}

function setRatio(nextRatio) {
  state.ratio = nextRatio;
  elements.cameraFrame.className = `camera-frame ratio-${nextRatio.replace(':', '-')}`;
  elements.ratioLabel.textContent = nextRatio;
}

function cycleRatio() {
  const currentIndex = RATIOS.indexOf(state.ratio);
  setRatio(RATIOS[(currentIndex + 1) % RATIOS.length]);
  showToast(`拍摄比例已切换为 ${state.ratio}`);
}

function setMode(mode) {
  if (!MODES[mode] || state.isRecording || state.isCapturing) return;
  state.mode = mode;
  document.querySelectorAll('.mode-tab').forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  elements.shutterButton.classList.remove('is-recording');
  elements.shutterButton.setAttribute('aria-label', MODES[mode].name);
  elements.captureNote.textContent = MODES[mode].note;
  elements.timerButton.hidden = mode === 'video';
  elements.microphoneQuickToggle.hidden = mode !== 'video';
  // Do not leave a live microphone reserved while the user is taking photos.
  // The preference remains on, and a new audio track is requested only when a
  // later video recording actually starts.
  if (mode !== 'video') releaseAudioTracks();
  applyPreviewStyle();
}

function setMicrophone(enabled) {
  if (state.isRecording) {
    showToast('正在录像，本段声音设置已锁定；结束后可为下一段切换。');
    applyPreviewStyle();
    return;
  }
  state.microphone = Boolean(enabled);
  if (!state.microphone) releaseAudioTracks();
  applyPreviewStyle();
  showToast(state.microphone ? '下一段录像会录入麦克风声音。' : '下一段录像不会录入麦克风声音。');
}

function setTimer() {
  const order = [0, 3, 5, 10];
  state.timer = order[(order.indexOf(state.timer) + 1) % order.length];
  elements.timerLabel.textContent = state.timer ? `${state.timer} 秒` : '关闭';
  showToast(state.timer ? `已设置 ${state.timer} 秒倒计时` : '已关闭倒计时');
}

async function runCountdown(seconds) {
  if (!seconds) return true;
  for (let remaining = seconds; remaining > 0; remaining -= 1) {
    elements.countdown.textContent = remaining;
    elements.countdown.classList.remove('is-active');
    void elements.countdown.offsetWidth;
    elements.countdown.classList.add('is-active');
    await sleep(1000);
  }
  elements.countdown.textContent = '';
  elements.countdown.classList.remove('is-active');
  return true;
}

function flash() {
  elements.cameraFlash.classList.remove('is-flashing');
  void elements.cameraFlash.offsetWidth;
  elements.cameraFlash.classList.add('is-flashing');
}

function captureDimensions() {
  const sourceWidth = elements.preview.videoWidth;
  const sourceHeight = elements.preview.videoHeight;
  const [ratioWidth, ratioHeight] = state.ratio.split(':').map(Number);
  const targetRatio = ratioWidth / ratioHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  if (sourceRatio > targetRatio) {
    const cropWidth = Math.round(sourceHeight * targetRatio);
    return { sx: Math.round((sourceWidth - cropWidth) / 2), sy: 0, sw: cropWidth, sh: sourceHeight };
  }
  const cropHeight = Math.round(sourceWidth / targetRatio);
  return { sx: 0, sy: Math.round((sourceHeight - cropHeight) / 2), sw: sourceWidth, sh: cropHeight };
}

function drawEffectOverlay(context, width, height, effectId) {
  if (effectId === 'rose' || effectId === 'dream') {
    const pinkGlow = context.createRadialGradient(width * .17, height * .12, 0, width * .17, height * .12, width * .7);
    pinkGlow.addColorStop(0, 'rgba(255, 199, 223, .25)');
    pinkGlow.addColorStop(1, 'rgba(255, 199, 223, 0)');
    context.fillStyle = pinkGlow;
    context.fillRect(0, 0, width, height);
  }
  if (effectId === 'film' || effectId === 'ccd' || effectId === 'vhs') {
    context.save();
    context.globalAlpha = effectId === 'ccd' ? .12 : .10;
    const dots = Math.max(300, Math.round(width * height / 1500));
    for (let index = 0; index < dots; index += 1) {
      context.fillStyle = Math.random() > .5 ? '#fff' : '#1f1520';
      context.fillRect(Math.random() * width, Math.random() * height, 1, 1);
    }
    context.restore();
  }
  if (effectId === 'vhs') {
    context.save();
    context.globalAlpha = .16;
    context.fillStyle = '#ffffff';
    for (let y = 1; y < height; y += 5) context.fillRect(0, y, width, 1);
    context.restore();
  }
  if (effectId === 'film' || effectId === 'dream') {
    const vignette = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .25, width / 2, height / 2, Math.max(width, height) * .77);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(54,27,24,.23)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
  }
}

function captureRecipe() {
  return {
    effectId: state.selectedEffectId,
    brightness: Number(state.brightness || 0),
    softness: Number(state.softness || 0),
    mirror: Boolean(state.mirrorSaved),
  };
}

function recipeIsUnchanged(recipe) {
  return recipe?.effectId === 'original'
    && !Number(recipe?.brightness || 0)
    && !Number(recipe?.softness || 0)
    && !recipe?.mirror;
}

function renderPhotoRecipe(source, recipe) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.save();
  context.filter = filterFor(recipe);
  if (recipe.mirror) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  context.restore();
  drawEffectOverlay(context, canvas.width, canvas.height, recipe.effectId);
  return canvas;
}

function createCaptureCanvas({ bake = true, recipe = captureRecipe() } = {}) {
  if (!isCameraReady()) return null;
  const { sx, sy, sw, sh } = captureDimensions();
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.save();
  context.filter = bake ? filterFor(recipe) : 'none';
  if (bake && recipe.mirror) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(elements.preview, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  } else {
    context.drawImage(elements.preview, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  }
  context.restore();
  if (bake) drawEffectOverlay(context, canvas.width, canvas.height, recipe.effectId);
  return canvas;
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = .93) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

function recordId() {
  return globalThis.crypto?.randomUUID?.() || `sweetcam-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

const MEDIA_EXTENSIONS = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
});

function extensionFromMediaType(mimeType) {
  return MEDIA_EXTENSIONS[String(mimeType || '').split(';', 1)[0].trim().toLowerCase()] || '';
}

function extensionFromSourceName(sourceName) {
  const match = /\.([a-z0-9]{1,8})$/iu.exec(String(sourceName || ''));
  const extension = match?.[1]?.toLowerCase() || '';
  return /^(?:jpe?g|png|webp|gif|heic|heif|mp4|webm|mov)$/u.test(extension) ? extension.replace(/^jpeg$/u, 'jpg') : '';
}

function exportName(record) {
  const stamp = new Date(record.createdAt).toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  // Imported media retains its real file type when downloaded or dragged out.
  const extension = extensionFromMediaType(record.sourceMimeType)
    || extensionFromMediaType(recordMimeType(record))
    || extensionFromSourceName(record.sourceName)
    || (record.kind === 'video' ? 'webm' : 'jpg');
  const tag = record.kind === 'strip' ? '四连拍' : record.kind === 'video' ? '录像' : '照片';
  return `SweetCam_${tag}_${stamp}.${extension}`;
}

function db() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('sweetcam-desktop-v1', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('media', { keyPath: 'id' });
      store.createIndex('createdAt', 'createdAt');
      store.createIndex('deleted', 'deleted');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
}

async function saveRecord(record) {
  const database = await db();
  const { _url, ...persistentRecord } = record;
  await new Promise((resolve, reject) => {
    const transaction = database.transaction('media', 'readwrite');
    transaction.objectStore('media').put(persistentRecord);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteStoredRecord(id) {
  const database = await db();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction('media', 'readwrite');
    transaction.objectStore('media').delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function loadRecords() {
  try {
    const database = await db();
    const records = await new Promise((resolve, reject) => {
      const request = database.transaction('media', 'readonly').objectStore('media').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    state.records = records.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    state.records = [];
    showToast('浏览器本地图库暂不可用；仍可直接下载拍摄文件。');
  }
}

function recordUrl(record) {
  let url = recordObjectUrls.get(record.id);
  if (!url) {
    url = URL.createObjectURL(record.blob);
    recordObjectUrls.set(record.id, url);
  }
  return url;
}

function recordMimeType(record) {
  return record.blob?.type || (record.kind === 'video' ? 'video/webm' : 'image/jpeg');
}

function mediaKindForFile(file) {
  const mimeType = String(file?.type || '').toLowerCase();
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'photo';
  const extension = extensionFromSourceName(file?.name);
  return /^(?:mp4|webm|mov)$/u.test(extension) ? 'video'
    : /^(?:jpg|png|webp|gif|heic|heif)$/u.test(extension) ? 'photo'
      : '';
}

function canPreviewRecord(record) {
  if (record?.previewUnavailable) return false;
  const mimeType = String(recordMimeType(record)).split(';', 1)[0].trim().toLowerCase();
  return /^(?:image\/(?:jpeg|png|webp|gif)|video\/(?:mp4|webm|quicktime))$/u.test(mimeType);
}

function prepareRecordDragUrl(record) {
  if (recordDragUrls.has(record.id)) return Promise.resolve(recordDragUrls.get(record.id));
  if (recordDragUrlPromises.has(record.id)) return recordDragUrlPromises.get(record.id);

  // 大文件和录像保留 Blob URL，避免把长录像完整复制进内存。
  if (record.kind === 'video' || record.blob.size > 12 * 1024 * 1024) {
    const url = recordUrl(record);
    recordDragUrls.set(record.id, url);
    return Promise.resolve(url);
  }

  const promise = new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('无法准备拖拽文件'));
    reader.readAsDataURL(record.blob);
  }).then((url) => {
    recordDragUrls.set(record.id, url);
    return url;
  }).finally(() => recordDragUrlPromises.delete(record.id));
  recordDragUrlPromises.set(record.id, promise);
  return promise;
}

async function addMediaRecord({
  blob,
  kind = 'photo',
  effect = getEffect().name,
  effectId = state.selectedEffectId,
  width,
  height,
  rootId = '',
  variantOf = '',
  isOriginal = !variantOf,
  recipe,
  source = 'camera',
  sourceName = '',
  sourceMimeType = blob?.type || '',
  remoteId = '',
  renderBasis = '',
  previewUnavailable = false,
  createdAt = Date.now(),
} = {}) {
  if (!blob) throw new Error('未能生成拍摄文件');
  const id = recordId();
  const record = {
    id,
    blob,
    kind,
    effect,
    effectId,
    width,
    height,
    createdAt,
    favorite: false,
    deleted: false,
    rootId: rootId || id,
    variantOf: variantOf || null,
    isOriginal: Boolean(isOriginal),
    recipe: recipe || { effectId, brightness: 0, softness: 0, mirror: false },
    source,
    sourceName,
    sourceMimeType,
    remoteId: remoteId || null,
    previewUnavailable: Boolean(previewUnavailable),
    ...(renderBasis ? { renderBasis } : {}),
  };
  let stored = false;
  try {
    await saveRecord(record);
    state.records.unshift(record);
    stored = true;
  } catch {
    showToast('当前浏览器无法保存到本地图库，请立即下载保留文件。');
  }
  renderRecent();
  void prepareRecordDragUrl(record).catch(() => undefined);
  if (isMobileBridgeStudio()) void syncRecordToMobileBridge(record);
  if (elements.galleryDialog.open) renderGallery();
  return { record, stored };
}

function downloadRecord(record) {
  const anchor = document.createElement('a');
  anchor.href = recordUrl(record);
  anchor.download = exportName(record);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  showToast('已交给浏览器下载。下载位置由浏览器设置决定。');
}

async function capturePhoto({ quiet = false } = {}) {
  if (!isCameraReady()) {
    const ready = await startCamera();
    if (!ready || !isCameraReady()) return null;
  }
  const rawCanvas = createCaptureCanvas({ bake: false });
  if (!rawCanvas) {
    showToast('摄像头画面尚未准备好，请稍等一秒后重试。');
    return null;
  }
  flash();
  const rawBlob = await canvasToBlob(rawCanvas);
  if (!rawBlob) {
    showToast('未能生成照片文件，请重试。');
    return null;
  }

  // The root is deliberately unfiltered and unmirrored. Every visible effect
  // is a sibling version, so later edits always start from the same pixels.
  const rootSaved = await addMediaRecord({
    blob: rawBlob,
    kind: 'photo',
    effect: '原片',
    effectId: 'original',
    recipe: { effectId: 'original', brightness: 0, softness: 0, mirror: false },
    width: rawCanvas.width,
    height: rawCanvas.height,
    renderBasis: 'camera-unfiltered-v2',
    source: 'camera',
  });
  const recipe = captureRecipe();
  let visibleSaved = rootSaved;
  let canvas = rawCanvas;
  if (!recipeIsUnchanged(recipe)) {
    canvas = renderPhotoRecipe(rawCanvas, recipe);
    const blob = await canvasToBlob(canvas);
    if (blob) {
      visibleSaved = await addMediaRecord({
        blob,
        kind: 'photo',
        effect: getEffect(recipe.effectId).name,
        effectId: recipe.effectId,
        recipe,
        width: canvas.width,
        height: canvas.height,
        rootId: rootSaved.record.rootId || rootSaved.record.id,
        variantOf: rootSaved.record.id,
        isOriginal: false,
        source: 'camera',
        sourceMimeType: blob.type,
        renderBasis: 'sweetcam-variant-v2',
      });
    }
  }
  if (!quiet) {
    showToast(visibleSaved.stored
      ? (visibleSaved.record.variantOf ? '照片和未滤镜原片已保存；可随时重新编辑。' : '原片已保存到 SweetCam 本地图库。')
      : '照片未能写入本地图库，请使用下载按钮保留文件。');
  }
  return { ...visibleSaved, canvas };
}

async function captureBurst() {
  const frames = [];
  elements.captureNote.textContent = '正在连拍 3 张…';
  for (let index = 0; index < 3; index += 1) {
    const result = await capturePhoto({ quiet: true });
    if (!result) break;
    frames.push(result);
    if (index < 2) await sleep(420);
  }
  elements.captureNote.textContent = MODES.burst.note;
  showToast(frames.length ? `已连拍并保存 ${frames.length} 张照片。` : '连拍未完成，请确认摄像头已经连接。');
}

async function captureStrip() {
  if (!isCameraReady()) {
    const ready = await startCamera();
    if (!ready || !isCameraReady()) return;
  }
  const frames = [];
  elements.captureNote.textContent = '四连拍开始：请保持姿势，每一张之间间隔约 1 秒。';
  for (let index = 0; index < 4; index += 1) {
    elements.countdown.textContent = `${index + 1}/4`;
    elements.countdown.classList.remove('is-active');
    void elements.countdown.offsetWidth;
    elements.countdown.classList.add('is-active');
    await sleep(900);
    const canvas = createCaptureCanvas();
    if (!canvas) break;
    flash();
    frames.push(canvas);
  }
  elements.countdown.textContent = '';
  elements.countdown.classList.remove('is-active');
  elements.captureNote.textContent = MODES.strip.note;
  if (frames.length < 2) {
    showToast('四连拍没有收集到足够画面，请确认摄像头已连接。');
    return;
  }

  const outer = 38;
  const stripWidth = 820;
  const photoWidth = stripWidth - outer * 2;
  const photoHeight = Math.round(photoWidth * (frames[0].height / frames[0].width));
  const footer = 125;
  const stripCanvas = document.createElement('canvas');
  stripCanvas.width = stripWidth;
  stripCanvas.height = outer + frames.length * (photoHeight + 16) + footer;
  const context = stripCanvas.getContext('2d');
  context.fillStyle = '#fffafa';
  context.fillRect(0, 0, stripCanvas.width, stripCanvas.height);
  frames.forEach((frame, index) => context.drawImage(frame, outer, outer + index * (photoHeight + 16), photoWidth, photoHeight));
  context.fillStyle = '#e66184';
  context.font = 'bold 29px "Microsoft YaHei UI", sans-serif';
  context.textAlign = 'center';
  context.fillText('SweetCam  ·  四连拍', stripWidth / 2, stripCanvas.height - 63);
  context.fillStyle = '#9f7a84';
  context.font = '20px "Microsoft YaHei UI", sans-serif';
  context.fillText(new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date()), stripWidth / 2, stripCanvas.height - 28);
  const blob = await canvasToBlob(stripCanvas);
  const saved = await addMediaRecord({
    blob,
    kind: 'strip',
    effect: getEffect().name,
    effectId: state.selectedEffectId,
    recipe: { effectId: 'original', brightness: 0, softness: 0, mirror: false },
    width: stripCanvas.width,
    height: stripCanvas.height,
    renderBasis: 'baked-composite-v1',
  });
  showToast(saved.stored ? '四连拍已合成并保存到 SweetCam 本地图库。' : '四连拍已合成，但未能写入本地图库；请使用下载按钮保留文件。');
}

function usableMimeType() {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
}

function updateRecordClock() {
  const seconds = Math.floor((Date.now() - state.recordStartedAt) / 1000);
  const minutesText = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secondsText = String(seconds % 60).padStart(2, '0');
  elements.recordHud.textContent = `● ${minutesText}:${secondsText}`;
}

async function startRecording() {
  if (!window.MediaRecorder) {
    showToast('这个浏览器不支持本地录像。请用新版 Chrome 或 Edge 打开。');
    return;
  }
  const hasAudio = hasLiveAudioTrack(state.stream);
  const ready = await startCamera({ includeAudio: state.microphone, force: Boolean(state.stream) && hasAudio !== state.microphone });
  if (!ready) return;
  const mimeType = usableMimeType();
  const chunks = [];
  const recorder = new MediaRecorder(state.stream, mimeType ? { mimeType } : undefined);
  state.mediaRecorder = recorder;
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    state.isRecording = false;
    state.mediaRecorder = null;
    clearInterval(state.recordTimer);
    elements.recordHud.hidden = true;
    elements.shutterButton.classList.remove('is-recording');
    elements.captureNote.textContent = MODES.video.note;
    applyPreviewStyle();
    const width = elements.preview.videoWidth;
    const height = elements.preview.videoHeight;
    const saved = await addMediaRecord({
      blob,
      kind: 'video',
      effect: '原片',
      effectId: 'original',
      recipe: { effectId: 'original', brightness: 0, softness: 0, mirror: false },
      width,
      height,
      renderBasis: 'camera-raw-v1',
    });
    showToast(saved.stored ? '录像已保存到 SweetCam 本地图库。可在图库中下载 WebM 文件。' : '录像未能写入本地图库，请重新录像后下载保留文件。');
  };
  recorder.start(500);
  state.isRecording = true;
  state.recordStartedAt = Date.now();
  updateRecordClock();
  state.recordTimer = setInterval(updateRecordClock, 500);
  elements.recordHud.hidden = false;
  elements.shutterButton.classList.add('is-recording');
  elements.captureNote.textContent = '正在录像。再次点击中央按钮即可结束并保存。';
  applyPreviewStyle();
  showToast(state.microphone ? '正在录像，已启用麦克风。' : '正在录像，麦克风未启用。');
}

function stopRecording() {
  if (state.mediaRecorder?.state === 'recording') state.mediaRecorder.stop();
}

async function handleShutter() {
  if (state.isCapturing) return;
  if (state.isRecording) {
    stopRecording();
    return;
  }
  if (state.mode === 'video') {
    await startRecording();
    return;
  }
  state.isCapturing = true;
  elements.shutterButton.disabled = true;
  try {
    if (!isCameraReady()) {
      const ready = await startCamera();
      if (!ready) return;
    }
    await runCountdown(state.timer);
    if (state.mode === 'strip') await captureStrip();
    else if (state.mode === 'burst') await captureBurst();
    else await capturePhoto();
  } finally {
    state.isCapturing = false;
    elements.shutterButton.disabled = false;
  }
}

function mediaKindLabel(kind) {
  if (kind === 'video') return '录像';
  if (kind === 'strip') return '四连拍';
  return '照片';
}

function createMediaMarkup(record, className) {
  if (!canPreviewRecord(record)) {
    return `<div class="${className} unsupported-media" role="img" aria-label="${mediaKindLabel(record.kind)}原文件已保留，但当前浏览器无法预览"><span>格式无法预览</span><small>原文件已保留，可下载或拖出</small></div>`;
  }
  const url = recordUrl(record);
  if (record.kind !== 'video') return `<img class="${className}" src="${url}" alt="${mediaKindLabel(record.kind)} ${formatDate(record.createdAt)}" />`;
  const isRecent = className === 'recent-media';
  const shouldShowControls = className === 'gallery-media' || className === 'viewer-media' || className === 'editor-media';
  return `<video class="${className}" src="${url}" muted playsinline preload="${isRecent ? 'auto' : 'metadata'}"${isRecent ? ' autoplay loop' : ''}${shouldShowControls ? ' controls' : ''}></video>`;
}

function renderRecentGroup(container, records, emptyText) {
  if (!records.length) {
    container.innerHTML = `<div class="recent-empty">${emptyText}</div>`;
    return;
  }
  container.innerHTML = records.slice(0, 6).map((record) => `
    <button class="recent-item" type="button" draggable="true" data-open-record="${record.id}" title="${mediaKindLabel(record.kind)} · ${formatDate(record.createdAt)}">
      ${createMediaMarkup(record, 'recent-media')}
      <span class="media-kind">${record.kind === 'video' ? '▸' : record.kind === 'strip' ? '▤' : '●'}</span>
    </button>
  `).join('');
  records.slice(0, 6).forEach((record) => void prepareRecordDragUrl(record).catch(() => undefined));
}

function renderRecent() {
  const visible = visibleActiveRecords();
  const photos = visible.filter((record) => record.kind !== 'video');
  const videos = visible.filter((record) => record.kind === 'video');
  elements.recentPhotoCount.textContent = String(photos.length);
  elements.recentVideoCount.textContent = String(videos.length);
  renderRecentGroup(elements.recentPhotoStrip, photos, '还没有照片');
  renderRecentGroup(elements.recentVideoStrip, videos, '还没有录像');
}

function filteredRecords() {
  const visible = visibleActiveRecords();
  if (state.galleryFilter === 'favorite') return visible.filter((record) => record.favorite);
  if (state.galleryFilter === 'deleted') return state.records.filter((record) => record.deleted);
  if (state.galleryFilter === 'photo') return visible.filter((record) => record.kind !== 'video');
  if (state.galleryFilter === 'video') return visible.filter((record) => record.kind === 'video');
  return visible;
}

function renderGallery() {
  const records = filteredRecords();
  document.querySelectorAll('.gallery-tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.galleryFilter === state.galleryFilter));
  elements.galleryHelp.textContent = state.galleryFilter === 'deleted'
    ? '最近删除中的内容仍保存在此浏览器，可以恢复或彻底删除。'
    : state.galleryFilter === 'photo'
      ? '这里仅显示照片和四连拍；点击实际画面即可打开、重新编辑、下载或拖到支持文件拖放的应用。'
      : state.galleryFilter === 'video'
        ? '这里仅显示录像；点击实际画面即可播放、重新编辑、下载或尝试拖到支持文件拖放的应用。'
        : '照片和录像先保存在当前设备的本地图库；通过手机入口上传的原件会仅在同一 Wi‑Fi 内保存到这台电脑。';
  if (!records.length) {
    const empty = state.galleryFilter === 'favorite'
      ? '还没有收藏内容'
      : state.galleryFilter === 'deleted'
        ? '最近删除为空'
        : state.galleryFilter === 'photo'
          ? '还没有照片'
          : state.galleryFilter === 'video'
            ? '还没有录像'
            : '还没有拍摄内容';
    elements.galleryGrid.innerHTML = `<div class="gallery-empty">${empty}</div>`;
    return;
  }
  elements.galleryGrid.innerHTML = records.map((record) => `
    <article class="gallery-item" data-gallery-record="${record.id}">
      <span class="gallery-kind">${mediaKindLabel(record.kind)}</span>
      <div class="gallery-open-media" data-open-record="${record.id}" role="button" tabindex="0" aria-label="打开${mediaKindLabel(record.kind)}">${createMediaMarkup(record, 'gallery-media')}</div>
      <div class="gallery-meta"><strong>${record.effect || '原片'}</strong><span>${formatDate(record.createdAt)}${record.width && record.height ? ` · ${record.width}×${record.height}` : ''}</span></div>
      <div class="gallery-actions">
        ${record.deleted
          ? `<button class="gallery-action" type="button" data-gallery-action="restore" data-record-id="${record.id}">恢复</button><button class="gallery-action danger" type="button" data-gallery-action="erase" data-record-id="${record.id}">彻底删除</button>`
          : `<button class="gallery-action" type="button" data-gallery-action="download" data-record-id="${record.id}">下载</button><button class="gallery-action" type="button" data-gallery-action="favorite" data-record-id="${record.id}">${record.favorite ? '取消收藏' : '收藏'}</button><button class="gallery-action danger" type="button" data-gallery-action="delete" data-record-id="${record.id}">删除</button>`}
      </div>
    </article>
  `).join('');
}

function getRecord(id) {
  return state.records.find((record) => record.id === id);
}

function getOpenRecord() {
  return getRecord(state.openRecordId);
}

async function copyPhotoToClipboard(record) {
  if (!record || record.kind === 'video') return;
  if (!navigator.clipboard?.write || !window.ClipboardItem) {
    showToast('当前浏览器不能直接复制图片；请用下载按钮保存后发送。');
    return;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ [recordMimeType(record)]: record.blob })]);
    showToast('图片已复制；到微信聊天框中按 Ctrl+V 即可发送。');
  } catch {
    showToast('复制图片未成功；请用下载按钮保存后发送。');
  }
}

function setViewerDragPending() {
  elements.mediaViewerMedia.setAttribute('draggable', 'false');
  elements.mediaDragOut.setAttribute('draggable', 'false');
  elements.mediaDragOut.setAttribute('aria-disabled', 'true');
  elements.mediaDragOut.classList.add('is-preparing');
  elements.mediaDragLabel.textContent = '准备拖拽文件…';
}

async function prepareViewerDrag(record) {
  setViewerDragPending();
  try {
    await prepareRecordDragUrl(record);
    if (state.openRecordId !== record.id) return;
    elements.mediaViewerMedia.setAttribute('draggable', 'true');
    elements.mediaDragOut.setAttribute('draggable', 'true');
    elements.mediaDragOut.setAttribute('aria-disabled', 'false');
    elements.mediaDragOut.classList.remove('is-preparing');
    elements.mediaDragLabel.textContent = '拖到微信／其他应用';
  } catch {
    if (state.openRecordId !== record.id) return;
    elements.mediaDragLabel.textContent = '拖拽文件未准备好，请下载';
  }
}

function openMediaViewer(record) {
  if (!record || record.deleted) return;
  state.openRecordId = record.id;
  elements.mediaViewerTitle.textContent = mediaKindLabel(record.kind);
  elements.mediaViewerMedia.innerHTML = createMediaMarkup(record, 'viewer-media');
  elements.mediaViewerMeta.textContent = `${formatDate(record.createdAt)}${record.width && record.height ? ` · ${record.width}×${record.height}` : ''}${record.effect ? ` · ${record.effect}` : ''}`;
  elements.mediaViewerCopy.hidden = record.kind === 'video';
  setViewerDragPending();
  openDialog(elements.mediaViewerDialog);
  void prepareViewerDrag(record);
}

function startExternalDrag(event, record) {
  if (!record || record.deleted || !event.dataTransfer) return;
  const url = recordDragUrls.get(record.id);
  if (!url) {
    showToast('文件仍在准备中，请等提示变为“拖到微信／其他应用”后再试。');
    return;
  }
  const filename = exportName(record);
  const mimeType = recordMimeType(record);
  event.dataTransfer.effectAllowed = 'copy';
  try { event.dataTransfer.setData('DownloadURL', `${mimeType}:${filename}:${url}`); } catch { /* Chromium 不支持时仍保留默认拖拽数据。 */ }
  try { event.dataTransfer.setData('text/uri-list', url); } catch { /* Optional drag data. */ }
  try { event.dataTransfer.setData('text/plain', filename); } catch { /* Optional drag data. */ }
}

function rootRecordFor(record) {
  if (!record) return null;
  return getRecord(record.rootId) || record;
}

function isRootRecord(record) {
  return Boolean(record) && (record.rootId || record.id) === record.id && !record.variantOf;
}

function visibleActiveRecords() {
  // A filter/re-edit may have several visible versions. Hide only the raw root
  // when a live derivative exists, preventing duplicate thumbnails while the
  // untouched root remains safely available to the editor.
  return state.records.filter((record) => !record.deleted && (!isRootRecord(record) || !hasActiveDerivedVersions(record)));
}

function isTrustedEditorBase(record) {
  if (!record) return false;
  if (record.renderBasis === 'baked-composite-v1') return false;
  if (record.renderBasis === 'camera-unfiltered-v2' || record.renderBasis === 'external-file-v1' || record.renderBasis === 'camera-raw-v1') return true;
  const recipe = record.recipe || {};
  // Older imported files and raw videos have a provably neutral recipe even
  // though they predate the explicit render-basis marker.
  return record.kind === 'video' || record.source === 'desktop-upload' || record.source === 'phone-upload'
    || (recipe.effectId === 'original' && !Number(recipe.brightness || 0) && !Number(recipe.softness || 0) && !recipe.mirror);
}

function recipeFor(record) {
  const source = rootRecordFor(record);
  if (!isTrustedEditorBase(source)) {
    // Early SweetCam photos may already have this recipe baked into their
    // pixels. Start neutral so opening the editor never silently applies it a
    // second time. The original record stays exactly as it was.
    return { effectId: 'original', brightness: 0, softness: 0 };
  }
  const fallbackEffectId = record?.effectId || EFFECTS.find((effect) => effect.name === record?.effect)?.id || 'original';
  return {
    effectId: record?.recipe?.effectId || fallbackEffectId,
    brightness: Number(record?.recipe?.brightness || 0),
    softness: Number(record?.recipe?.softness || 0),
  };
}

function editorSourceRecord() {
  return getRecord(state.editor.sourceRecordId);
}

function editorFilter() {
  return filterFor({
    effectId: state.editor.effectId,
    brightness: state.editor.brightness,
    softness: state.editor.softness,
  });
}

function updateEditorControls() {
  elements.editorBrightnessRange.value = String(state.editor.brightness);
  elements.editorBrightnessValue.value = state.editor.brightness;
  elements.editorSoftnessRange.value = String(state.editor.softness);
  elements.editorSoftnessValue.value = state.editor.softness;
  const previewUnavailable = Boolean(editorSourceRecord()?.previewUnavailable);
  elements.editorExportButton.disabled = state.editor.isExporting || previewUnavailable;
  elements.editorExportButton.textContent = previewUnavailable
    ? '当前浏览器无法编辑此格式'
    : state.editor.isExporting ? '正在生成编辑版…' : '生成新的编辑版';
}

function applyEditorPreviewStyle() {
  const media = elements.mediaEditorPreview.querySelector('.editor-media');
  if (media) media.style.filter = editorFilter();
  updateEditorControls();
}

function renderEditorEffects() {
  elements.editorEffectGrid.innerHTML = EFFECTS.map((effect) => `
    <button class="effect-card editor-effect${effect.id === state.editor.effectId ? ' is-active' : ''}" data-editor-effect="${effect.id}" data-effect="${effect.id}" type="button" aria-label="使用${effect.name}" aria-pressed="${effect.id === state.editor.effectId}">
      <span class="effect-preview"><span class="effect-fallback" aria-hidden="true"><span class="effect-fallback-icon">${effect.icon}</span><span class="effect-fallback-label">${effect.name}</span></span></span>
      <span class="effect-card-name">${effect.name}</span>
    </button>
  `).join('');
}

function setEditorEffect(id) {
  if (!getEffect(id)) return;
  state.editor.effectId = id;
  renderEditorEffects();
  applyEditorPreviewStyle();
}

function waitForMediaMetadata(media) {
  if (media.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => {
      media.removeEventListener('loadedmetadata', handleLoaded);
      media.removeEventListener('error', handleError);
    };
    const handleLoaded = () => { finish(); resolve(); };
    const handleError = () => { finish(); reject(new Error('媒体文件无法读取')); };
    media.addEventListener('loadedmetadata', handleLoaded, { once: true });
    media.addEventListener('error', handleError, { once: true });
  });
}

function waitForImageLoad(image) {
  if (image.complete && image.naturalWidth) return Promise.resolve();
  return new Promise((resolve, reject) => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', () => reject(new Error('图片文件无法读取')), { once: true });
  });
}

async function sourceDimensions(blob, kind) {
  const url = URL.createObjectURL(blob);
  const media = document.createElement(kind === 'video' ? 'video' : 'img');
  try {
    if (kind === 'video') {
      media.preload = 'metadata';
      media.muted = true;
      media.playsInline = true;
    }
    media.src = url;
    if (kind === 'video') await waitForMediaMetadata(media);
    else await waitForImageLoad(media);
    return kind === 'video'
      ? { width: media.videoWidth, height: media.videoHeight }
      : { width: media.naturalWidth, height: media.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function importMediaFiles(files, source = isMobileBridgeStudio() ? 'phone-upload' : 'desktop-upload') {
  const imported = [];
  for (const file of Array.from(files || [])) {
    const kind = mediaKindForFile(file);
    if (!kind) {
      showToast(`“${file.name}”不是可用的照片或录像文件。`);
      continue;
    }
    try {
      let dimensions = {};
      let previewUnavailable = false;
      try {
        dimensions = await sourceDimensions(file, kind);
      } catch {
        // Keep iPhone HEIC/HEIF and other valid originals even when this
        // particular browser cannot decode them for editing.
        previewUnavailable = true;
      }
      const saved = await addMediaRecord({
        blob: file,
        kind,
        effect: '原片',
        effectId: 'original',
        recipe: { effectId: 'original', brightness: 0, softness: 0, mirror: false },
        width: dimensions.width,
        height: dimensions.height,
        source,
        sourceName: file.name,
        sourceMimeType: file.type,
        renderBasis: 'external-file-v1',
        previewUnavailable,
      });
      imported.push(saved.record);
    } catch (error) {
      showToast(error?.message || `“${file.name}”无法导入，请换一个文件再试。`);
    }
  }
  if (!imported.length) return;
  const editable = imported.find((record) => !record.previewUnavailable);
  showToast(editable
    ? `已导入 ${imported.length} 个文件；原文件已保留，可立即重新编辑。`
    : `已保留 ${imported.length} 个原文件；当前浏览器暂不能预览此格式，可下载到兼容设备打开。`);
  if (editable) openMediaEditor(editable);
}

function openMediaEditor(record) {
  if (!record || record.deleted) return;
  const source = rootRecordFor(record);
  const trustedBase = isTrustedEditorBase(source);
  const recipe = recipeFor(record);
  state.editor = {
    sourceRecordId: source.id,
    effectId: recipe.effectId,
    brightness: recipe.brightness,
    softness: recipe.softness,
    isExporting: false,
  };
  elements.mediaEditorTitle.textContent = `重新编辑${mediaKindLabel(record.kind)}`;
  elements.mediaEditorPreview.innerHTML = createMediaMarkup(source, 'editor-media');
  renderEditorEffects();
  applyEditorPreviewStyle();
  elements.editorStatus.textContent = source.previewUnavailable
    ? '原文件已保留，但当前浏览器无法解码此格式；可下载到兼容设备打开。'
    : trustedBase
      ? '原文件会保留；新效果将作为另一份内容保存。'
      : '这是一张早期已烘焙效果的成片；为避免重复套滤镜，编辑器从当前画面开始。原片不会被改动。';
  openDialog(elements.mediaEditorDialog);
}

async function saveEditedMedia({ blob, width, height, audioCopied = true }) {
  const source = editorSourceRecord();
  if (!source) throw new Error('找不到需要编辑的原文件');
  const recipe = {
    effectId: state.editor.effectId,
    brightness: state.editor.brightness,
    softness: state.editor.softness,
    mirror: false,
  };
  const saved = await addMediaRecord({
    blob,
    kind: source.kind,
    effect: getEffect(recipe.effectId).name,
    effectId: recipe.effectId,
    recipe,
    width,
    height,
    rootId: source.rootId || source.id,
    variantOf: source.id,
    isOriginal: false,
    source: source.source || 'camera',
    sourceName: source.sourceName || '',
    sourceMimeType: blob.type,
    renderBasis: 'sweetcam-variant-v2',
  });
  closeDialog(elements.mediaEditorDialog);
  elements.editorStatus.textContent = '';
  openMediaViewer(saved.record);
  showToast(audioCopied || source.kind !== 'video' ? '新的编辑版已保存，原文件未改动。' : '新的编辑版已保存，但浏览器未能复制原录像声音。');
}

async function exportEditedPhoto() {
  const source = editorSourceRecord();
  const image = elements.mediaEditorPreview.querySelector('img.editor-media');
  if (!source || !image) throw new Error('图片尚未准备好');
  await waitForImageLoad(image);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { alpha: false });
  context.filter = editorFilter();
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.filter = 'none';
  drawEffectOverlay(context, canvas.width, canvas.height, state.editor.effectId);
  const blob = await canvasToBlob(canvas);
  if (!blob) throw new Error('无法生成编辑后的图片');
  await saveEditedMedia({ blob, width: canvas.width, height: canvas.height });
}

function formatEditorClock(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

async function exportEditedVideo() {
  const source = editorSourceRecord();
  if (!source || source.kind !== 'video') throw new Error('录像尚未准备好');
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) throw new Error('当前浏览器不能生成带滤镜的录像，请使用新版 Chrome 或 Edge。');

  const sourceVideo = document.createElement('video');
  sourceVideo.src = recordUrl(source);
  sourceVideo.preload = 'auto';
  sourceVideo.playsInline = true;
  sourceVideo.muted = false;
  sourceVideo.volume = 0;
  sourceVideo.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.append(sourceVideo);

  let audioContext;
  let canvasStream;
  let animationFrame;
  let audioCopied = false;
  try {
    await waitForMediaMetadata(sourceVideo);
    if (!Number.isFinite(sourceVideo.duration) || sourceVideo.duration <= 0) throw new Error('这段录像没有可编辑的时长');
    const canvas = document.createElement('canvas');
    canvas.width = sourceVideo.videoWidth;
    canvas.height = sourceVideo.videoHeight;
    const context = canvas.getContext('2d', { alpha: false });
    canvasStream = canvas.captureStream(30);
    const outputStream = new MediaStream(canvasStream.getVideoTracks());

    try {
      audioContext = new AudioContext();
      const audioSource = audioContext.createMediaElementSource(sourceVideo);
      const audioDestination = audioContext.createMediaStreamDestination();
      audioSource.connect(audioDestination);
      await audioContext.resume();
      audioDestination.stream.getAudioTracks().forEach((track) => outputStream.addTrack(track));
      audioCopied = Boolean(audioDestination.stream.getAudioTracks().length);
    } catch {
      audioCopied = false;
    }

    const mimeType = usableMimeType();
    const recorder = new MediaRecorder(outputStream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    const videoDuration = sourceVideo.duration;
    const blob = await new Promise((resolve, reject) => {
      const stopRendering = () => {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        sourceVideo.pause();
      };
      const renderFrame = () => {
        if (sourceVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          context.filter = editorFilter();
          context.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
          context.filter = 'none';
          drawEffectOverlay(context, canvas.width, canvas.height, state.editor.effectId);
          elements.editorStatus.textContent = `正在生成滤镜录像 ${formatEditorClock(sourceVideo.currentTime)} / ${formatEditorClock(videoDuration)}…`;
        }
        if (!sourceVideo.ended) animationFrame = requestAnimationFrame(renderFrame);
      };
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { stopRendering(); reject(new Error('录像生成失败')); };
      recorder.onstop = () => {
        stopRendering();
        resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
      };
      sourceVideo.addEventListener('ended', () => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, { once: true });
      recorder.start(500);
      renderFrame();
      sourceVideo.play().catch((error) => {
        if (recorder.state !== 'inactive') recorder.stop();
        reject(error || new Error('录像无法开始播放'));
      });
    });
    if (!blob.size) throw new Error('没有生成可用的录像文件');
    await saveEditedMedia({ blob, width: canvas.width, height: canvas.height, audioCopied });
  } finally {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    canvasStream?.getTracks().forEach((track) => track.stop());
    if (audioContext && audioContext.state !== 'closed') await audioContext.close().catch(() => undefined);
    sourceVideo.pause();
    sourceVideo.remove();
  }
}

async function exportEditedMedia() {
  if (state.editor.isExporting) return;
  const source = editorSourceRecord();
  if (!source) return;
  state.editor.isExporting = true;
  updateEditorControls();
  try {
    if (source.kind === 'video') await exportEditedVideo();
    else await exportEditedPhoto();
  } catch (error) {
    elements.editorStatus.textContent = error?.message || '生成编辑版失败，请稍后重试。';
    showToast(elements.editorStatus.textContent);
  } finally {
    state.editor.isExporting = false;
    updateEditorControls();
  }
}

async function updateRecord(record) {
  try {
    await saveRecord(record);
  } catch {
    showToast('无法更新本地图库，请稍后重试。');
  }
  renderRecent();
  renderGallery();
}

function hasActiveDerivedVersions(record) {
  if (!isRootRecord(record)) return false;
  const rootId = record.rootId || record.id;
  return state.records.some((item) => !item.deleted && item.id !== record.id && item.variantOf && item.rootId === rootId);
}

async function handleGalleryAction(action, id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  if (action === 'download') return downloadRecord(record);
  if (action === 'favorite') {
    record.favorite = !record.favorite;
    await updateRecord(record);
    showToast(record.favorite ? '已加入收藏。' : '已取消收藏。');
    return;
  }
  if (action === 'delete') {
    if ((record.rootId || record.id) === record.id && hasActiveDerivedVersions(record)) {
      showToast('这份原文件还有编辑版；请先保留它，避免编辑版失去可再次编辑的来源。');
      return;
    }
    record.deleted = true;
    await updateRecord(record);
    showToast('已移到最近删除；你可以随时恢复。');
    return;
  }
  if (action === 'restore') {
    record.deleted = false;
    await updateRecord(record);
    showToast('已从最近删除恢复。');
    return;
  }
  if (action === 'erase') {
    if ((record.rootId || record.id) === record.id && hasActiveDerivedVersions(record)) {
      showToast('这份原文件还有编辑版，暂时不能彻底删除。');
      return;
    }
    const approved = window.confirm('确定彻底删除这个本地文件吗？此操作无法恢复。');
    if (!approved) return;
    try {
      await deleteStoredRecord(record.id);
      const url = recordObjectUrls.get(record.id);
      if (url) URL.revokeObjectURL(url);
      recordObjectUrls.delete(record.id);
      recordDragUrls.delete(record.id);
      recordDragUrlPromises.delete(record.id);
      state.records = state.records.filter((item) => item.id !== record.id);
      renderRecent();
      renderGallery();
      showToast('已彻底删除本地文件。');
    } catch {
      showToast('暂时无法彻底删除该文件。');
    }
  }
}

function openDialog(dialog) {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function attachEvents() {
  elements.startCamera.addEventListener('click', () => startCamera());
  elements.preview.addEventListener('loadedmetadata', updateCameraFacts);
  navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);

  document.querySelectorAll('.mode-tab').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
  elements.shutterButton.addEventListener('click', handleShutter);
  elements.timerButton.addEventListener('click', setTimer);
  elements.mirrorButton.addEventListener('click', () => {
    state.mirrorPreview = !state.mirrorPreview;
    applyPreviewStyle();
  });
  elements.toggleGrid.addEventListener('click', () => {
    state.isGridOn = !state.isGridOn;
    elements.cameraGrid.classList.toggle('is-visible', state.isGridOn);
    elements.toggleGrid.setAttribute('aria-pressed', String(state.isGridOn));
    showToast(state.isGridOn ? '已打开九宫格构图线。' : '已关闭构图线。');
  });
  elements.ratioButton.addEventListener('click', cycleRatio);

  elements.effectCategories.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    state.selectedCategory = button.dataset.category;
    renderCategories();
    renderEffects();
  });
  elements.effectGrid.addEventListener('click', (event) => {
    const favorite = event.target.closest('[data-favorite-effect]');
    if (favorite) {
      event.stopPropagation();
      toggleEffectFavorite(favorite.dataset.favoriteEffect);
      return;
    }
    const card = event.target.closest('[data-effect]');
    if (card) selectEffect(card.dataset.effect);
  });
  elements.clearEffect.addEventListener('click', () => selectEffect('original'));
  elements.brightnessRange.addEventListener('input', () => {
    state.brightness = Number(elements.brightnessRange.value);
    updateAdjustmentLabels();
    applyPreviewStyle();
  });
  elements.softnessRange.addEventListener('input', () => {
    state.softness = Number(elements.softnessRange.value);
    updateAdjustmentLabels();
    applyPreviewStyle();
  });
  elements.resetAdjustments.addEventListener('click', () => {
    state.brightness = 0;
    state.softness = 0;
    elements.brightnessRange.value = '0';
    elements.softnessRange.value = '0';
    updateAdjustmentLabels();
    applyPreviewStyle();
  });

  const openGallery = () => { state.galleryFilter = 'all'; renderGallery(); openDialog(elements.galleryDialog); };
  elements.openGallery.addEventListener('click', openGallery);
  elements.openGalleryInline.addEventListener('click', openGallery);
  elements.recentGroups.addEventListener('click', (event) => {
    const target = event.target.closest('[data-open-record]');
    if (target) openMediaViewer(getRecord(target.dataset.openRecord));
  });
  elements.recentGroups.addEventListener('dragstart', (event) => {
    const target = event.target.closest('[data-open-record]');
    if (target) startExternalDrag(event, getRecord(target.dataset.openRecord));
  });
  elements.galleryDialog.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-gallery-filter]');
    if (tab) {
      state.galleryFilter = tab.dataset.galleryFilter;
      renderGallery();
      return;
    }
    const action = event.target.closest('[data-gallery-action]');
    if (action) {
      handleGalleryAction(action.dataset.galleryAction, action.dataset.recordId);
      return;
    }
    const target = event.target.closest('[data-open-record]');
    if (target) openMediaViewer(getRecord(target.dataset.openRecord));
  });
  elements.galleryGrid.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target.closest('[data-open-record]');
    if (!target) return;
    event.preventDefault();
    openMediaViewer(getRecord(target.dataset.openRecord));
  });

  elements.mediaViewerDownload.addEventListener('click', () => {
    const record = getOpenRecord();
    if (record) downloadRecord(record);
  });
  elements.mediaViewerEdit.addEventListener('click', () => {
    const record = getOpenRecord();
    if (record) openMediaEditor(record);
  });
  elements.mediaViewerCopy.addEventListener('click', () => copyPhotoToClipboard(getOpenRecord()));
  elements.mediaViewerMedia.addEventListener('dragstart', (event) => startExternalDrag(event, getOpenRecord()));
  elements.mediaDragOut.addEventListener('dragstart', (event) => startExternalDrag(event, getOpenRecord()));
  elements.mediaDragOut.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const record = getOpenRecord();
    if (record) downloadRecord(record);
  });

  elements.importMediaButton.addEventListener('click', () => elements.importMediaInput.click());
  elements.importMediaInput.addEventListener('change', async () => {
    await importMediaFiles(elements.importMediaInput.files);
    elements.importMediaInput.value = '';
  });
  elements.editorEffectGrid.addEventListener('click', (event) => {
    const target = event.target.closest('[data-editor-effect]');
    if (target) setEditorEffect(target.dataset.editorEffect);
  });
  elements.editorBrightnessRange.addEventListener('input', () => {
    state.editor.brightness = Number(elements.editorBrightnessRange.value);
    applyEditorPreviewStyle();
  });
  elements.editorSoftnessRange.addEventListener('input', () => {
    state.editor.softness = Number(elements.editorSoftnessRange.value);
    applyEditorPreviewStyle();
  });
  elements.editorExportButton.addEventListener('click', exportEditedMedia);
  elements.openMobileStudio.addEventListener('click', openMobileStudioDialog);
  elements.copyMobileStudioLink.addEventListener('click', copyMobileStudioLink);

  elements.openSettings.addEventListener('click', async () => {
    await refreshDevices();
    openDialog(elements.settingsDialog);
  });
  elements.cameraSelect.addEventListener('change', async () => {
    state.selectedDeviceId = elements.cameraSelect.value;
    await startCamera({ force: true, includeAudio: state.microphone && state.mode === 'video' });
  });
  elements.qualitySelect.addEventListener('change', async () => {
    state.quality = elements.qualitySelect.value;
    await startCamera({ force: true, includeAudio: state.microphone && state.mode === 'video' });
  });
  elements.previewMirrorToggle.addEventListener('change', () => {
    state.mirrorPreview = elements.previewMirrorToggle.checked;
    applyPreviewStyle();
  });
  elements.saveMirrorToggle.addEventListener('change', () => {
    state.mirrorSaved = elements.saveMirrorToggle.checked;
    applyPreviewStyle();
  });
  elements.microphoneToggle.addEventListener('change', () => setMicrophone(elements.microphoneToggle.checked));
  elements.microphoneQuickToggle.addEventListener('click', () => setMicrophone(!state.microphone));

  document.addEventListener('click', (event) => {
    const closeButton = event.target.closest('[data-close-dialog]');
    if (!closeButton) return;
    const dialog = $(`#${closeButton.dataset.closeDialog}`);
    if (dialog === elements.mediaEditorDialog && state.editor.isExporting) {
      showToast('正在生成编辑版，请等待当前任务完成。');
      return;
    }
    closeDialog(dialog);
  });
  document.addEventListener('keydown', (event) => {
    if ((event.code === 'Space' || event.code === 'Enter') && !event.target.matches('input, select, button, textarea')) {
      event.preventDefault();
      handleShutter();
    }
    if (event.key.toLowerCase() === 'm' && !event.target.matches('input, select, textarea')) {
      state.mirrorPreview = !state.mirrorPreview;
      applyPreviewStyle();
    }
    if (event.key.toLowerCase() === 'f' && !event.target.matches('input, select, textarea')) {
      document.querySelector('.effects-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
  window.addEventListener('beforeunload', () => {
    stopStream(state.stream);
    if (bridgePollTimer) clearInterval(bridgePollTimer);
    recordObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  });
}

async function initialize() {
  setRatio(state.ratio);
  updateAdjustmentLabels();
  applyPreviewStyle();
  renderCategories();
  renderEffects();
  attachEvents();
  await loadRecords();
  renderRecent();
  if (isDesktopSweetCamStudio()) {
    void importMobileBridgeMedia();
    bridgePollTimer = setInterval(() => void importMobileBridgeMedia(), 7000);
  }
  startCamera();
}

initialize();
