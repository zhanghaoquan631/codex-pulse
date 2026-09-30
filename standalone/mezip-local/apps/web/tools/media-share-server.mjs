import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const port = Number(process.env.MEZIP_SHARE_PORT || 5188);
const videoExtensions = new Set(['.avi', '.mkv', '.mov', '.mp4', '.webm']);
const imageExtensions = new Set(['.bmp', '.gif', '.jpeg', '.jpg', '.png', '.webp']);

function localAppDataRoot() {
  return resolve(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'MeZip', 'FilmStudio');
}

function metadataPath() {
  return join(localAppDataRoot(), 'metadata-v1.json');
}

function mediaRoot(kind) {
  const home = process.env.USERPROFILE || homedir();
  return kind === 'emotion'
    ? resolve(home, 'Videos', 'Desktop Recordings')
    : resolve(home, 'Pictures', 'Action Screenshots');
}

function mimeType(fileName) {
  const extension = extname(fileName).toLowerCase();
  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.webm') return 'video/webm';
  if (extension === '.mov') return 'video/quicktime';
  if (extension === '.avi') return 'video/x-msvideo';
  if (extension === '.mkv') return 'video/x-matroska';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.bmp') return 'image/bmp';
  return 'application/octet-stream';
}

function safeText(value, length) {
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim().slice(0, length) : '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function publishedAsset(token) {
  if (!/^[a-f0-9]{48}$/iu.test(token) || !existsSync(metadataPath())) return null;
  try {
    const metadata = JSON.parse(readFileSync(metadataPath(), 'utf8'));
    const items = metadata && typeof metadata === 'object' && metadata.items && typeof metadata.items === 'object' ? metadata.items : {};
    for (const [key, record] of Object.entries(items)) {
      if (!record || typeof record !== 'object' || !record.shareEnabled || record.shareToken !== token) continue;
      const colon = key.indexOf(':');
      if (colon < 1) continue;
      const kind = key.slice(0, colon);
      const fileName = key.slice(colon + 1);
      if (kind !== 'emotion' && kind !== 'action') continue;
      if (!fileName || /[\\/\0]/u.test(fileName)) continue;
      const extension = extname(fileName).toLowerCase();
      if (!(kind === 'emotion' ? videoExtensions : imageExtensions).has(extension)) continue;
      const filePath = join(mediaRoot(kind), fileName);
      if (!existsSync(filePath)) continue;
      const stats = statSync(filePath);
      if (!stats.isFile()) continue;
      return { kind, fileName, filePath, record, stats };
    }
  } catch {
    return null;
  }
  return null;
}

function sendHtml(response, statusCode, html) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'unsafe-inline'; media-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'");
  response.end(html);
}

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(body));
}

function sendMedia(request, response, asset) {
  const { filePath, fileName, stats } = asset;
  const size = stats.size;
  const rangeHeader = request.headers.range;
  let start = 0;
  let end = Math.max(0, size - 1);
  let statusCode = 200;
  if (rangeHeader && size > 0) {
    const match = /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader);
    if (!match) {
      response.statusCode = 416;
      response.setHeader('Content-Range', `bytes */${size}`);
      response.end();
      return;
    }
    if (match[1] === '') {
      const suffixLength = Number(match[2]);
      if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
        response.statusCode = 416;
        response.setHeader('Content-Range', `bytes */${size}`);
        response.end();
        return;
      }
      start = Math.max(0, size - suffixLength);
    } else {
      start = Number(match[1]);
      end = match[2] === '' ? end : Number(match[2]);
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) {
      response.statusCode = 416;
      response.setHeader('Content-Range', `bytes */${size}`);
      response.end();
      return;
    }
    end = Math.min(end, size - 1);
    statusCode = 206;
  }
  const length = size === 0 ? 0 : end - start + 1;
  response.statusCode = statusCode;
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Type', mimeType(fileName));
  response.setHeader('Content-Length', String(length));
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  if (statusCode === 206) response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  if (request.method === 'HEAD' || size === 0) {
    response.end();
    return;
  }
  const stream = createReadStream(filePath, { start, end });
  stream.on('error', () => response.end());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}

function sharedPage(token, asset) {
  const title = safeText(asset.record.title, 120) || asset.fileName;
  const purpose = safeText(asset.record.purpose, 280);
  const category = safeText(asset.record.category, 60);
  const tags = Array.isArray(asset.record.tags) ? asset.record.tags.map((tag) => safeText(tag, 32)).filter(Boolean).slice(0, 12) : [];
  const media = asset.kind === 'emotion'
    ? `<video controls playsinline preload="metadata" src="/s/${token}/media"></video>`
    : `<img src="/s/${token}/media" alt="${escapeHtml(title)}" />`;
  const meta = [category, ...tags].filter(Boolean).map((item) => `<span>${escapeHtml(item)}</span>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#eef2f7;font-family:Segoe UI,Microsoft YaHei,sans-serif}.shell{width:min(100%,960px);box-sizing:border-box;padding:24px}.card{overflow:hidden;border:1px solid #ffffff22;border-radius:18px;background:#131821;box-shadow:0 26px 70px #0008}.head{padding:18px 20px;border-bottom:1px solid #ffffff16}.head p{margin:0;color:#aeb9c7;font-size:13px}.head h1{margin:5px 0 0;font-size:22px}.media{display:grid;place-items:center;min-height:260px;background:#05070a}.media video,.media img{display:block;max-width:100%;max-height:70vh}.body{padding:16px 20px}.tags{display:flex;flex-wrap:wrap;gap:7px}.tags span{padding:4px 9px;border:1px solid #8bbcff55;border-radius:999px;background:#6aa8ff16;color:#d5e6ff;font-size:12px}.purpose{margin:12px 0 0;color:#d1d8e2;line-height:1.65;font-size:14px}.fine{margin-top:18px;color:#8492a4;font-size:12px}</style></head><body><main class="shell"><section class="card"><header class="head"><p>ME.ZIP · 受限素材分享</p><h1>${escapeHtml(title)}</h1></header><div class="media">${media}</div><div class="body"><div class="tags">${meta || '<span>已分享</span>'}</div>${purpose ? `<p class="purpose">${escapeHtml(purpose)}</p>` : ''}<p class="fine">此链接仅展示发布者明确分享的这一项素材。</p></div></section></main></body></html>`;
}

const server = createServer((request, response) => {
  const path = new URL(request.url || '/', 'http://127.0.0.1').pathname;
  if (path === '/health') {
    sendJson(response, 200, { service: 'mezip-media-share', status: 'ok' });
    return;
  }
  const match = /^\/s\/([a-f0-9]{48})(?:\/(media))?$/iu.exec(path);
  if (!match) {
    sendHtml(response, 404, '<!doctype html><title>Not found</title>');
    return;
  }
  const asset = publishedAsset(match[1]);
  if (!asset) {
    sendHtml(response, 404, '<!doctype html><title>Unavailable</title>');
    return;
  }
  if (match[2] === 'media') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET, HEAD');
      response.end();
      return;
    }
    sendMedia(request, response, asset);
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET, HEAD');
    response.end();
    return;
  }
  sendHtml(response, 200, sharedPage(match[1], asset));
});

server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') process.exit(0);
  console.error(error);
  process.exit(1);
});

server.listen(port, '127.0.0.1');
