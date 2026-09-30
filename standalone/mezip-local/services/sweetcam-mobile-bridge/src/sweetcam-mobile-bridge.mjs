import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, linkSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESKTOP_ORIGIN = 'http://127.0.0.1:5174';
const DESKTOP_COOKIE = 'sweetcam_desktop_session';
const MOBILE_COOKIE = 'sweetcam_mobile_session';
const DESKTOP_SESSION_SECONDS = 30 * 24 * 60 * 60;
const MOBILE_SESSION_SECONDS = 30 * 24 * 60 * 60;
const PAIR_TOKEN_LIFETIME_MS = 10 * 60 * 1000;
const SERVICE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STUDIO_DIRECTORY = join(SERVICE_DIRECTORY, '..', '..', '..', 'apps', 'web', 'public', 'sweetcam-desktop-v1');
const STUDIO_FILES = Object.freeze({
  '/studio/index.html': { fileName: 'index.html', contentType: 'text/html; charset=utf-8' },
  '/studio/sweetcam.css': { fileName: 'sweetcam.css', contentType: 'text/css; charset=utf-8' },
  '/studio/sweetcam.js': { fileName: 'sweetcam.js', contentType: 'text/javascript; charset=utf-8' },
});

const MEDIA_TYPES = Object.freeze({
  'image/jpeg': { extension: '.jpg', kind: 'photo', maximumBytes: 25 * 1024 * 1024 },
  'image/png': { extension: '.png', kind: 'photo', maximumBytes: 25 * 1024 * 1024 },
  'image/webp': { extension: '.webp', kind: 'photo', maximumBytes: 25 * 1024 * 1024 },
  'image/gif': { extension: '.gif', kind: 'photo', maximumBytes: 25 * 1024 * 1024 },
  // iPhone commonly offers these originals rather than JPEG. They remain
  // unmodified on disk even if an individual desktop browser cannot preview
  // them natively yet.
  'image/heic': { extension: '.heic', kind: 'photo', maximumBytes: 25 * 1024 * 1024 },
  'image/heif': { extension: '.heif', kind: 'photo', maximumBytes: 25 * 1024 * 1024 },
  'video/mp4': { extension: '.mp4', kind: 'video', maximumBytes: 250 * 1024 * 1024 },
  'video/webm': { extension: '.webm', kind: 'video', maximumBytes: 250 * 1024 * 1024 },
  'video/quicktime': { extension: '.mov', kind: 'video', maximumBytes: 250 * 1024 * 1024 },
});

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function base64(value) {
  return Buffer.from(value).toString('base64url');
}

function hmac(value, key) {
  return base64(createHmac('sha256', key).update(value).digest());
}

function safeEqual(left, right) {
  return typeof left === 'string'
    && typeof right === 'string'
    && left.length === right.length
    && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function createCookie(name, payload, key, maxAgeSeconds) {
  const encoded = base64(JSON.stringify(payload));
  const signed = `${encoded}.${hmac(encoded, key)}`;
  return `${name}=${encodeURIComponent(signed)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').flatMap((piece) => {
    const index = piece.indexOf('=');
    if (index < 0) return [];
    try {
      return [[piece.slice(0, index).trim(), decodeURIComponent(piece.slice(index + 1).trim())]];
    } catch {
      return [];
    }
  }));
}

function readCookie(request, name, key) {
  const raw = parseCookies(request.headers.cookie)[name];
  if (!raw) return null;
  const [encoded, signature] = raw.split('.');
  if (!encoded || !signature || !safeEqual(hmac(encoded, key), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' && Number(payload.expiresAt) > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function defaultDataDirectory() {
  return join(process.env.LOCALAPPDATA?.trim() || tmpdir(), 'SweetCam', 'mobile-bridge');
}

function atomicWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, value, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporaryPath, path);
}

function loadDocument(path) {
  const fallback = { version: 1, pairing: null, media: [] };
  if (!existsSync(path)) return fallback;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    return {
      version: 1,
      pairing: parsed.pairing && typeof parsed.pairing === 'object' ? parsed.pairing : null,
      media: Array.isArray(parsed.media) ? parsed.media.filter((item) => item && typeof item === 'object') : [],
    };
  } catch {
    return fallback;
  }
}

function lanAddress() {
  const addresses = Object.entries(networkInterfaces())
    .flatMap(([name, entries]) => (entries ?? []).map((entry) => ({ name, ...entry })))
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal);
  const isPrivateAddress = (entry) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/u.test(entry.address);
  const isWifiAddress = (entry) => /(wi-?fi|wlan|wireless)/iu.test(entry.name);
  return (
    addresses.find((entry) => isWifiAddress(entry) && isPrivateAddress(entry))
    ?? addresses.find(isPrivateAddress)
    ?? addresses.find(isWifiAddress)
    ?? addresses[0]
  )?.address ?? null;
}

function loopbackRequest(request) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '');
}

function requestedDesktopOrigin(request) {
  return request.headers.origin === DESKTOP_ORIGIN ? DESKTOP_ORIGIN : '';
}

function hasUnexpectedDesktopOrigin(request) {
  const origin = request.headers.origin;
  return typeof origin === 'string' && origin.length > 0 && origin !== DESKTOP_ORIGIN;
}

function sendJson(response, status, value, origin = '', cookies = []) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (origin === DESKTOP_ORIGIN) {
    response.setHeader('Access-Control-Allow-Origin', DESKTOP_ORIGIN);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Vary', 'Origin');
  }
  if (cookies.length) response.setHeader('Set-Cookie', cookies);
  response.end(JSON.stringify(value));
}

function fail(response, status, code, message, origin = '') {
  sendJson(response, status, { error: { code, message } }, origin);
}

function normalMimeType(value) {
  return String(value ?? '').split(';', 1)[0].trim().toLowerCase();
}

function safeFileName(value) {
  let decoded = String(value ?? '');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // A raw header value is still safe after the character filter below.
  }
  const cleaned = decoded
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'mobile-upload';
}

function hasExpectedMagic(bytes, mimeType) {
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mimeType === 'image/gif') return bytes.length >= 6 && /^GIF8[79]a$/u.test(bytes.subarray(0, 6).toString('ascii'));
  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    if (bytes.length < 12 || bytes.subarray(4, 8).toString('ascii') !== 'ftyp') return false;
    const brand = bytes.subarray(8, 12).toString('ascii').toLowerCase();
    return mimeType === 'image/heic'
      ? ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)
      : ['heif', 'heic', 'heix', 'mif1', 'msf1'].includes(brand);
  }
  if (mimeType === 'video/webm') return bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime') return bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp';
  return false;
}

function writableDrain(stream) {
  return new Promise((resolve, reject) => {
    stream.once('drain', resolve);
    stream.once('error', reject);
  });
}

function finishWritable(stream) {
  return new Promise((resolve, reject) => {
    // Wait for the handle to close, not merely for `finish`, before linking
    // and deleting the temporary name. That keeps the Windows finalization
    // path reliable as well as atomic.
    stream.once('error', reject);
    stream.once('close', resolve);
    stream.end();
  });
}

async function persistOriginalUpload(request, mediaDirectory, mimeType) {
  const type = MEDIA_TYPES[mimeType];
  if (!type) throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', '仅支持 JPEG、PNG、WebP、GIF、HEIC、HEIF、MP4、WebM 和 MOV 原始文件。');

  const declaredLength = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > type.maximumBytes) {
    throw new HttpError(413, 'FILE_TOO_LARGE', `该文件超过 ${(type.maximumBytes / 1024 / 1024).toFixed(0)} MB 上限。`);
  }

  let id = randomUUID();
  let temporaryPath = join(mediaDirectory, `${id}.partial`);
  while (existsSync(temporaryPath) || existsSync(join(mediaDirectory, `${id}${type.extension}`))) {
    id = randomUUID();
    temporaryPath = join(mediaDirectory, `${id}.partial`);
  }
  const finalPath = join(mediaDirectory, `${id}${type.extension}`);
  const output = createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 });
  let byteLength = 0;
  let header = Buffer.alloc(0);
  try {
    for await (const chunk of request) {
      const bytes = Buffer.from(chunk);
      byteLength += bytes.byteLength;
      if (byteLength > type.maximumBytes) {
        throw new HttpError(413, 'FILE_TOO_LARGE', `该文件超过 ${(type.maximumBytes / 1024 / 1024).toFixed(0)} MB 上限。`);
      }
      if (header.byteLength < 64) {
        header = Buffer.concat([header, bytes.subarray(0, Math.max(0, 64 - header.byteLength))]);
      }
      if (!output.write(bytes)) await writableDrain(output);
    }
    await finishWritable(output);
    if (!byteLength || !hasExpectedMagic(header, mimeType)) {
      throw new HttpError(415, 'INVALID_MEDIA_CONTENT', '文件内容与声明的图片或视频格式不一致。');
    }
    // A UUID collision is extremely unlikely, but `rename` can overwrite an
    // existing destination on some platforms. Linking creates the final name
    // only when it does not already exist, so an original can never replace a
    // previous upload even under a race.
    try {
      linkSync(temporaryPath, finalPath);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'EEXIST') {
        throw new HttpError(409, 'MEDIA_ID_COLLISION', '保存时遇到文件名冲突，请重新上传。');
      }
      throw error;
    }
    unlinkSync(temporaryPath);
    return {
      id,
      storedFileName: `${id}${type.extension}`,
      mimeType,
      kind: type.kind,
      byteLength,
    };
  } catch (error) {
    output.destroy();
    if (existsSync(temporaryPath)) {
      try { unlinkSync(temporaryPath); } catch { /* best-effort cleanup */ }
    }
    throw error;
  }
}

function mediaPayload(record) {
  return {
    id: record.id,
    fileName: record.fileName,
    mimeType: record.mimeType,
    kind: record.kind,
    byteLength: record.byteLength,
    createdAt: record.createdAt,
    source: 'mobile',
    mediaUrl: `/v1/sweetcam/media/${encodeURIComponent(record.id)}`,
  };
}

function storedMediaPath(mediaDirectory, record) {
  const storedFileName = String(record?.storedFileName ?? '');
  // Keep this allow-list aligned with MEDIA_TYPES. The UUID prefix still
  // prevents callers from reaching arbitrary paths outside the media folder.
  if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp|gif|heic|heif|mp4|webm|mov)$/iu.test(storedFileName)) return null;
  return join(mediaDirectory, storedFileName);
}

const MOBILE_CSS = `:root{color-scheme:light;font-family:"Microsoft YaHei UI",system-ui,sans-serif;background:#fff8f8;color:#31252a}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top,#ffdce6 0,#fff8f8 48%,#f9edf0 100%)}main{max-width:620px;margin:auto;padding:28px 18px 44px}.eyebrow{font-size:12px;font-weight:800;letter-spacing:.12em;color:#c75278}.card{margin-top:18px;padding:22px;border:1px solid #f0cbd6;border-radius:24px;background:#ffffffdc;box-shadow:0 16px 42px #ad5b751c}h1{margin:7px 0 8px;font-size:28px}p{line-height:1.65;color:#705d63}.upload{display:grid;place-items:center;min-height:170px;padding:20px;border:1.5px dashed #df86a2;border-radius:18px;background:#fff5f7;text-align:center;cursor:pointer}.upload input{position:absolute;width:1px;height:1px;opacity:0}.upload strong{font-size:17px;color:#9f3359}.upload span{display:block;margin-top:7px;font-size:13px;color:#806b72}#image-preview,#video-preview{display:block;width:100%;max-height:360px;margin-top:16px;border-radius:16px;background:#1d1518;object-fit:contain}button{width:100%;margin-top:16px;padding:13px 16px;border:0;border-radius:14px;background:#df5d85;color:white;font-weight:800;font-size:16px;cursor:pointer}button:disabled{opacity:.55;cursor:wait}#status{min-height:24px;margin:13px 2px 0;color:#715d64;font-size:14px}.limits{margin:14px 2px 0;font-size:12px;color:#947a83}.error{color:#ad244d!important}`;

const MOBILE_JS = `const picker=document.querySelector('#picker');const label=document.querySelector('#label');const imagePreview=document.querySelector('#image-preview');const videoPreview=document.querySelector('#video-preview');const form=document.querySelector('#upload-form');const submit=document.querySelector('#submit');const status=document.querySelector('#status');let file=null;let previewUrl='';function note(text,bad=false){status.textContent=text;status.className=bad?'error':''}function clearPreview(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';imagePreview.removeAttribute('src');imagePreview.hidden=true;videoPreview.pause();videoPreview.removeAttribute('src');videoPreview.hidden=true}picker.addEventListener('change',()=>{clearPreview();file=picker.files&&picker.files[0];if(!file){label.textContent='选择一张照片或一段录像';return}label.textContent=file.name+' · '+Math.ceil(file.size/1024/1024)+' MB';previewUrl=URL.createObjectURL(file);const preview=file.type.startsWith('video/')?videoPreview:imagePreview;preview.src=previewUrl;preview.hidden=false;note('已选择原始文件，发送后会保存到这台电脑。')});form.addEventListener('submit',async event=>{event.preventDefault();if(!file){note('请先选择照片或录像。',true);return}submit.disabled=true;note('正在上传原始文件…');try{const response=await fetch('/v1/sweetcam/mobile/uploads',{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type,'X-SweetCam-Filename':encodeURIComponent(file.name)},body:file});const body=await response.json();if(!response.ok)throw new Error(body.error&&body.error.message||'上传失败');note('已保存到电脑 SweetCam。回到电脑端即可看到它。');form.reset();file=null;label.textContent='选择一张照片或一段录像';clearPreview()}catch(error){note(error.message||'上传失败，请确认手机与电脑在同一网络。',true)}finally{submit.disabled=false}});history.replaceState({},'', '/mobile');`;

function mobileHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" /><title>SweetCam · 手机上传</title><link rel="stylesheet" href="/assets/mobile.css" /></head><body><main><div class="eyebrow">SWEETCAM · LOCAL MOBILE LINK</div><h1>上传到电脑 SweetCam</h1><p>照片和录像会作为原始文件保存在这台电脑；此页面暂不做滤镜或裁剪。</p><section class="card"><form id="upload-form"><label class="upload" for="picker"><strong id="label">选择一张照片或一段录像</strong><span>可从相册选择，或直接调用手机相机</span><input id="picker" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" capture="environment" /></label><img id="image-preview" hidden alt="选中的图片预览" /><video id="video-preview" hidden muted playsinline controls></video><button id="submit" type="submit">上传原始文件到电脑</button><p id="status" aria-live="polite"></p><p class="limits">图片单个最多 25 MB；录像单个最多 250 MB。请保持手机和电脑连接同一 Wi‑Fi。</p></form></section></main><script src="/assets/mobile.js"></script></body></html>`;
}

/**
 * A small, private LAN bridge for SweetCam V1. It intentionally does not
 * know about browser IndexedDB; the desktop page must import media through
 * the authenticated list and media endpoints.
 */
export function createSweetCamMobileBridge(options = {}) {
  const host = options.host ?? process.env.MEZIP_SWEETCAM_MOBILE_HOST ?? '0.0.0.0';
  const port = Number(options.port ?? process.env.MEZIP_SWEETCAM_MOBILE_PORT ?? 4330);
  const dataDirectory = options.dataDirectory ?? process.env.MEZIP_SWEETCAM_MOBILE_DATA_PATH ?? defaultDataDirectory();
  const mediaDirectory = join(dataDirectory, 'media');
  const studioDirectory = options.studioDirectory ?? DEFAULT_STUDIO_DIRECTORY;
  const documentPath = join(dataDirectory, 'bridge.json');
  const keyPath = join(dataDirectory, 'session.key');

  mkdirSync(mediaDirectory, { recursive: true });
  const key = existsSync(keyPath) ? readFileSync(keyPath) : randomBytes(32);
  if (!existsSync(keyPath)) writeFileSync(keyPath, key, { mode: 0o600 });
  let document = loadDocument(documentPath);
  const saveDocument = () => atomicWrite(documentPath, `${JSON.stringify(document, null, 2)}\n`);
  let server;
  const activePort = () => {
    const address = server?.address?.();
    return address && typeof address === 'object' ? address.port : port;
  };
  const desktopSession = (request) => readCookie(request, DESKTOP_COOKIE, key);
  const mobileSession = (request) => readCookie(request, MOBILE_COOKIE, key);
  const currentPairing = () => document.pairing && typeof document.pairing === 'object' ? document.pairing : null;
  const mobileSessionIsValid = (request) => {
    const session = mobileSession(request);
    const pairing = currentPairing();
    return session?.role === 'mobile' && pairing?.version === session.pairingVersion ? session : null;
  };
  const desktopSessionIsValid = (request) => {
    const session = desktopSession(request);
    return loopbackRequest(request) && session?.role === 'desktop' ? session : null;
  };
  const issueDesktopCookie = () => createCookie(DESKTOP_COOKIE, {
    role: 'desktop', expiresAt: Date.now() + DESKTOP_SESSION_SECONDS * 1000,
  }, key, DESKTOP_SESSION_SECONDS);
  const issueMobileCookie = (pairing) => createCookie(MOBILE_COOKIE, {
    role: 'mobile', pairingVersion: pairing.version, deviceId: randomUUID(), expiresAt: Date.now() + MOBILE_SESSION_SECONDS * 1000,
  }, key, MOBILE_SESSION_SECONDS);
  const listMedia = () => document.media
    .filter((record) => record?.id && storedMediaPath(mediaDirectory, record) && existsSync(storedMediaPath(mediaDirectory, record)))
    .map(mediaPayload);

  function requireDesktop(request, response, origin) {
    if (!loopbackRequest(request)) {
      fail(response, 403, 'LOCAL_DESKTOP_REQUIRED', '只有本机桌面端可以访问此接口。', origin);
      return null;
    }
    if (hasUnexpectedDesktopOrigin(request)) {
      fail(response, 403, 'UNTRUSTED_ORIGIN', '桌面端来源不受信任。', '');
      return null;
    }
    if (!desktopSessionIsValid(request)) {
      fail(response, 401, 'DESKTOP_SESSION_REQUIRED', '请先由 SweetCam 桌面端建立本机会话。', origin);
      return null;
    }
    return desktopSession(request);
  }

  function requireMobile(request, response) {
    const session = mobileSessionIsValid(request);
    if (!session) {
      fail(response, 401, 'PAIRING_REQUIRED', '此手机链接尚未配对或已失效，请回到电脑重新生成手机链接。');
      return null;
    }
    return session;
  }

  function serveMedia(request, response, record, origin) {
    const path = storedMediaPath(mediaDirectory, record);
    if (!path || !existsSync(path)) {
      fail(response, 404, 'MEDIA_NOT_FOUND', '这个媒体文件已不可用。', origin);
      return;
    }
    let stats;
    try {
      stats = statSync(path);
      if (!stats.isFile()) throw new Error('not a file');
    } catch {
      fail(response, 404, 'MEDIA_NOT_FOUND', '这个媒体文件已不可用。', origin);
      return;
    }
    response.statusCode = 200;
    response.setHeader('Content-Type', record.mimeType);
    response.setHeader('Content-Length', String(stats.size));
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(record.fileName || record.storedFileName)}`);
    if (origin === DESKTOP_ORIGIN) {
      response.setHeader('Access-Control-Allow-Origin', DESKTOP_ORIGIN);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Vary', 'Origin');
    }
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(path);
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  }

  function serveStudioAsset(request, response, descriptor) {
    const assetPath = join(studioDirectory, descriptor.fileName);
    let asset;
    try {
      asset = readFileSync(assetPath);
    } catch {
      throw new HttpError(503, 'STUDIO_ASSET_UNAVAILABLE', 'SweetCam 手机工作台文件暂时不可用。');
    }
    response.statusCode = 200;
    response.setHeader('Content-Type', descriptor.contentType);
    response.setHeader('Content-Length', String(asset.byteLength));
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (descriptor.fileName === 'index.html') {
      response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
      response.setHeader('Permissions-Policy', 'camera=(self), microphone=(self)');
    }
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    response.end(asset);
  }

  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}:${activePort()}`);
    const path = url.pathname;
    const origin = requestedDesktopOrigin(request);
    try {
      if (request.method === 'OPTIONS') {
        if (request.headers.origin !== DESKTOP_ORIGIN) {
          fail(response, 403, 'UNTRUSTED_ORIGIN', '不允许此跨域来源。');
          return;
        }
        response.statusCode = 204;
        response.setHeader('Access-Control-Allow-Origin', DESKTOP_ORIGIN);
        response.setHeader('Access-Control-Allow-Credentials', 'true');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-SweetCam-Filename');
        response.setHeader('Access-Control-Max-Age', '600');
        response.setHeader('Vary', 'Origin');
        response.end();
        return;
      }

      if (request.method === 'GET' && path === '/mobile') {
        const pairing = currentPairing();
        const existingSession = mobileSessionIsValid(request);
        const suppliedPair = url.searchParams.get('pair') ?? '';
        const validPair = pairing
          && Number(pairing.expiresAt) > Date.now()
          && !pairing.consumedAt
          && suppliedPair
          && safeEqual(hmac(suppliedPair, key), pairing.tokenHash);
        if (!existingSession && !validPair) {
          response.statusCode = 401;
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.end('<main style="font-family:system-ui;padding:32px"><h1>需要手机配对</h1><p>请回到电脑 SweetCam 重新生成手机链接后，再用手机打开。</p></main>');
          return;
        }
        if (!existingSession) {
          // Exchange the short-lived URL token once, then remove it from both
          // the address bar and persisted pairing state before serving HTML.
          document = {
            ...document,
            pairing: { ...pairing, tokenHash: null, consumedAt: new Date().toISOString() },
          };
          saveDocument();
          response.statusCode = 303;
          response.setHeader('Location', '/studio/index.html');
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('Referrer-Policy', 'no-referrer');
          response.setHeader('Set-Cookie', issueMobileCookie(pairing));
          response.end();
          return;
        }
        // `/mobile` exists only as a one-time pairing handoff. The actual
        // phone UI is the protected V1 studio below, never the LAN-exposed
        // Vite server on port 5174.
        response.statusCode = 303;
        response.setHeader('Location', '/studio/index.html');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.end();
        return;
      }

      if (request.method === 'GET' && (path === '/studio' || path === '/studio/')) {
        if (!requireMobile(request, response)) return;
        response.statusCode = 303;
        response.setHeader('Location', '/studio/index.html');
        response.setHeader('Cache-Control', 'no-store');
        response.end();
        return;
      }

      const studioFile = STUDIO_FILES[path];
      if (studioFile && (request.method === 'GET' || request.method === 'HEAD')) {
        if (!requireMobile(request, response)) return;
        serveStudioAsset(request, response, studioFile);
        return;
      }

      if (request.method === 'GET' && path === '/v1/sweetcam/mobile/health') {
        if (!loopbackRequest(request) || hasUnexpectedDesktopOrigin(request)) {
          fail(response, 403, 'LOCAL_DESKTOP_REQUIRED', '健康检查仅限本机桌面端。', origin);
          return;
        }
        sendJson(response, 200, { status: 'READY', storage: 'LOCAL_PRIVATE', lanAddress: lanAddress(), port: activePort() }, origin);
        return;
      }

      if (request.method === 'GET' && path === '/v1/sweetcam/mobile/desktop-session') {
        if (!loopbackRequest(request) || hasUnexpectedDesktopOrigin(request)) {
          fail(response, 403, 'LOCAL_DESKTOP_REQUIRED', '桌面会话只能由这台电脑建立。', origin);
          return;
        }
        sendJson(response, 200, { status: 'READY', storage: 'LOCAL_PRIVATE' }, origin, [issueDesktopCookie()]);
        return;
      }

      if (request.method === 'POST' && path === '/v1/sweetcam/mobile/invite') {
        if (!requireDesktop(request, response, origin)) return;
        const address = host === '0.0.0.0' ? lanAddress() : host;
        if (!address) {
          fail(response, 503, 'LAN_ADDRESS_UNAVAILABLE', '没有找到可用的局域网地址，暂时无法生成手机链接。', origin);
          return;
        }
        const token = randomBytes(32).toString('base64url');
        const pairing = {
          version: randomUUID(),
          tokenHash: hmac(token, key),
          createdAt: new Date().toISOString(),
          expiresAt: Date.now() + PAIR_TOKEN_LIFETIME_MS,
        };
        document = { ...document, pairing };
        saveDocument();
        const mobileUrl = `http://${address}:${activePort()}/mobile?pair=${encodeURIComponent(token)}`;
        sendJson(response, 200, {
          status: 'READY',
          mobileUrl,
          expiresAt: new Date(pairing.expiresAt).toISOString(),
          network: 'TRUSTED_LAN_ONLY',
        }, origin);
        return;
      }

      if (request.method === 'POST' && path === '/v1/sweetcam/mobile/uploads') {
        if (!requireMobile(request, response)) return;
        const mimeType = normalMimeType(request.headers['content-type']);
        const persisted = await persistOriginalUpload(request, mediaDirectory, mimeType);
        const record = {
          ...persisted,
          fileName: safeFileName(request.headers['x-sweetcam-filename']),
          createdAt: new Date().toISOString(),
        };
        document.media.unshift(record);
        saveDocument();
        sendJson(response, 201, { status: 'SAVED_LOCAL', media: mediaPayload(record) });
        return;
      }

      if (request.method === 'GET' && path === '/v1/sweetcam/media') {
        if (!requireDesktop(request, response, origin)) return;
        sendJson(response, 200, { media: listMedia() }, origin);
        return;
      }

      if (request.method === 'GET' && path === '/v1/sweetcam/mobile/media') {
        if (!requireMobile(request, response)) return;
        sendJson(response, 200, { media: listMedia() });
        return;
      }

      const mediaMatch = /^\/v1\/sweetcam\/media\/([0-9a-f-]{36})$/iu.exec(path);
      if (mediaMatch && (request.method === 'GET' || request.method === 'HEAD')) {
        const record = document.media.find((candidate) => candidate.id === mediaMatch[1]);
        if (!record) {
          fail(response, 404, 'MEDIA_NOT_FOUND', '没有找到这个媒体文件。', origin);
          return;
        }
        const desktop = desktopSessionIsValid(request);
        const mobile = mobileSessionIsValid(request);
        if (!desktop && !mobile) {
          fail(response, 401, 'AUTHORIZED_SESSION_REQUIRED', '请从已配对手机或本机 SweetCam 打开媒体。', origin);
          return;
        }
        if (desktop && hasUnexpectedDesktopOrigin(request)) {
          fail(response, 403, 'UNTRUSTED_ORIGIN', '桌面端来源不受信任。');
          return;
        }
        serveMedia(request, response, record, desktop ? origin : '');
        return;
      }

      fail(response, 404, 'NOT_FOUND', '未找到 SweetCam 手机桥接口。', origin);
    } catch (error) {
      if (error instanceof HttpError) {
        fail(response, error.status, error.code, error.message, origin);
        return;
      }
      fail(response, 500, 'INTERNAL', error instanceof Error ? error.message : 'SweetCam 手机桥发生未知错误。', origin);
    }
  });

  return { server, host, port, dataDirectory, mediaDirectory, lanAddress: lanAddress() };
}

export function startSweetCamMobileBridge(options = {}) {
  const bridge = createSweetCamMobileBridge(options);
  bridge.server.listen(bridge.port, bridge.host, () => {
    process.stdout.write(`SweetCam Mobile Bridge listening on http://${bridge.host}:${bridge.port}\n`);
  });
  return bridge;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  startSweetCamMobileBridge();
}
