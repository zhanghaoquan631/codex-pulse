import { defineConfig, type Plugin } from 'vite';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

const webConfigDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)));

const emotionVideoExtensions = new Set(['.avi', '.mkv', '.mov', '.mp4', '.webm']);

function emotionRecordingsRoot(): string {
  return resolve(process.env.USERPROFILE || homedir(), 'Videos', 'Desktop Recordings');
}

function emotionMimeType(fileName: string): string {
  const extension = extname(fileName).toLowerCase();
  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.webm') return 'video/webm';
  if (extension === '.mov') return 'video/quicktime';
  if (extension === '.avi') return 'video/x-msvideo';
  if (extension === '.mkv') return 'video/x-matroska';
  return 'application/octet-stream';
}

function emotionJson(response: ServerResponse, statusCode: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(body);
}

function isEmotionVideo(fileName: string): boolean {
  return emotionVideoExtensions.has(extname(fileName).toLowerCase()) && !fileName.toLowerCase().endsWith('.partial');
}

function emotionLibraryRoute(): Plugin {
  const recordingsRoot = emotionRecordingsRoot();
  const listRecordings = () => {
    if (!existsSync(recordingsRoot)) return [];
    return readdirSync(recordingsRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isEmotionVideo(entry.name))
      .map((entry) => {
        try {
          const filePath = join(recordingsRoot, entry.name);
          const stats = statSync(filePath);
          return {
            id: entry.name,
            name: entry.name,
            size: stats.size,
            modifiedAt: stats.mtime.toISOString(),
            mimeType: emotionMimeType(entry.name),
            url: `/api/emotion/library/media/${encodeURIComponent(entry.name)}`,
          };
        } catch {
          return null;
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) => Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt));
  };

  const serveMedia = (request: IncomingMessage, response: ServerResponse, encodedName: string) => {
    let fileName = '';
    try {
      fileName = decodeURIComponent(encodedName);
    } catch {
      emotionJson(response, 400, { error: 'INVALID_MEDIA_NAME' });
      return;
    }
    if (!fileName || fileName === '.' || fileName === '..' || /[\\/\0]/u.test(fileName) || !isEmotionVideo(fileName)) {
      emotionJson(response, 404, { error: 'MEDIA_NOT_FOUND' });
      return;
    }
    const filePath = join(recordingsRoot, fileName);
    if (!existsSync(filePath)) {
      emotionJson(response, 404, { error: 'MEDIA_NOT_FOUND' });
      return;
    }
    let stats;
    try {
      stats = statSync(filePath);
      if (!stats.isFile()) throw new Error('not a file');
    } catch {
      emotionJson(response, 404, { error: 'MEDIA_NOT_FOUND' });
      return;
    }

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

    const contentLength = size === 0 ? 0 : end - start + 1;
    response.statusCode = statusCode;
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Type', emotionMimeType(fileName));
    response.setHeader('Content-Length', String(contentLength));
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    if (statusCode === 206) response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    if (request.method === 'HEAD' || size === 0) {
      response.end();
      return;
    }
    const stream = createReadStream(filePath, { start, end });
    stream.on('error', () => {
      if (!response.headersSent) response.statusCode = 500;
      response.end();
    });
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  };

  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = request.url?.split('?')[0] ?? '';
    if (path === '/api/emotion/library') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        emotionJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      emotionJson(response, 200, {
        libraryName: 'Emotion.',
        recordingsPath: '视频\\Desktop Recordings',
        items: listRecordings(),
      });
      return;
    }
    const mediaPrefix = '/api/emotion/library/media/';
    if (path.startsWith(mediaPrefix)) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        emotionJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      serveMedia(request, response, path.slice(mediaPrefix.length));
      return;
    }
    next();
  };

  return {
    name: 'mezip-emotion-local-video-library',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

type FilmStudioLibraryKind = 'emotion' | 'action';

const filmStudioExtensions: Record<FilmStudioLibraryKind, Set<string>> = {
  emotion: emotionVideoExtensions,
  action: new Set(['.bmp', '.gif', '.jpeg', '.jpg', '.png', '.webp']),
};

function actionScreenshotsRoot(): string {
  return resolve(process.env.USERPROFILE || homedir(), 'Pictures', 'Action Screenshots');
}

function filmStudioRoot(kind: FilmStudioLibraryKind): string {
  return kind === 'emotion' ? emotionRecordingsRoot() : actionScreenshotsRoot();
}

function filmStudioMimeType(fileName: string): string {
  const extension = extname(fileName).toLowerCase();
  if (emotionVideoExtensions.has(extension)) return emotionMimeType(fileName);
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.bmp') return 'image/bmp';
  return 'application/octet-stream';
}

function getFilmStudioKind(value: string | undefined): FilmStudioLibraryKind | null {
  if (value === 'emotion' || value === 'action') return value;
  return null;
}

function isFilmStudioFile(kind: FilmStudioLibraryKind, fileName: string): boolean {
  return filmStudioExtensions[kind].has(extname(fileName).toLowerCase()) && !fileName.toLowerCase().endsWith('.partial');
}

function safeFilmStudioFileName(encodedName: string): string | null {
  try {
    const fileName = decodeURIComponent(encodedName);
    if (!fileName || fileName === '.' || fileName === '..' || /[\\/\0]/u.test(fileName)) return null;
    return fileName;
  } catch {
    return null;
  }
}

type FilmStudioMetadataRecord = {
  title?: string;
  tags?: string[];
  purpose?: string;
  category?: string;
  shareToken?: string;
  shareEnabled?: boolean;
  publishedAt?: string;
  updatedAt?: string;
};

type FilmStudioMetadataDocument = {
  version: 1;
  items: Record<string, FilmStudioMetadataRecord>;
};

const filmStudioSharePort = 5188;

function filmStudioDataRoot(): string {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  return resolve(localAppData, 'MeZip', 'FilmStudio');
}

function filmStudioMetadataPath(): string {
  return join(filmStudioDataRoot(), 'metadata-v1.json');
}

function filmStudioMetadataKey(kind: FilmStudioLibraryKind, fileName: string): string {
  return `${kind}:${fileName}`;
}

function readFilmStudioMetadata(): FilmStudioMetadataDocument {
  const fallback: FilmStudioMetadataDocument = { version: 1, items: {} };
  const filePath = filmStudioMetadataPath();
  if (!existsSync(filePath)) return fallback;
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    const items = (parsed as { items?: unknown }).items;
    if (!items || typeof items !== 'object' || Array.isArray(items)) return fallback;
    return { version: 1, items: items as Record<string, FilmStudioMetadataRecord> };
  } catch {
    return fallback;
  }
}

function writeFilmStudioMetadata(document: FilmStudioMetadataDocument): void {
  const root = filmStudioDataRoot();
  mkdirSync(root, { recursive: true });
  writeFileSync(filmStudioMetadataPath(), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

function cleanFilmStudioText(value: unknown, maximumLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/gu, ' ').trim().slice(0, maximumLength);
}

function cleanFilmStudioTags(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n\r,;#\uFF0C\uFF1B]+/gu)
      : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const candidate of source) {
    const tag = cleanFilmStudioText(candidate, 32).replace(/^#+/u, '');
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 12) break;
  }
  return tags;
}

function inferFilmStudioDetails(kind: FilmStudioLibraryKind, values: string[]): { category: string; tags: string[] } {
  const source = values.join(' ').toLocaleLowerCase();
  const contains = (...words: string[]) => words.some((word) => source.includes(word));
  const tags = kind === 'emotion' ? ['视频', '录制'] : ['图片', '截图'];
  let category = kind === 'emotion' ? '视频记录' : '图片资料';
  if (contains('电影', 'movie', 'film', '影片', '剧集', '观影')) {
    category = '电影与视频';
    tags.push('电影');
  } else if (contains('音乐', '歌曲', 'music', 'song', 'mv', '演出')) {
    category = '音乐与演出';
    tags.push('音乐');
  } else if (contains('代码', 'codex', 'vscode', '开发', '编程', 'project')) {
    category = '开发记录';
    tags.push('开发');
  } else if (contains('学习', '教程', '课程', 'lesson', 'tutorial')) {
    category = '学习资料';
    tags.push('学习');
  } else if (contains('微信', 'weixin', '聊天', 'chat', '消息')) {
    category = '交流记录';
    tags.push('交流');
  } else if (contains('灵感', '参考', '设计', 'idea', 'inspiration')) {
    category = '灵感参考';
    tags.push('灵感');
  }
  return { category, tags: cleanFilmStudioTags(tags) };
}

function mergeFilmStudioTags(...groups: string[][]): string[] {
  return cleanFilmStudioTags(groups.flat());
}

function makeFilmStudioItem(kind: FilmStudioLibraryKind, fileName: string, stats: ReturnType<typeof statSync>, metadata: FilmStudioMetadataDocument) {
  const record = metadata.items[filmStudioMetadataKey(kind, fileName)] || {};
  const title = cleanFilmStudioText(record.title, 120);
  const purpose = cleanFilmStudioText(record.purpose, 280);
  const userTags = cleanFilmStudioTags(record.tags);
  const inferred = inferFilmStudioDetails(kind, [fileName, title, purpose, ...userTags]);
  const category = cleanFilmStudioText(record.category, 60) || inferred.category;
  return {
    id: fileName,
    name: fileName,
    displayName: title || fileName,
    title,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    mimeType: filmStudioMimeType(fileName),
    url: `/api/film-studio/v1/media/${kind}/${encodeURIComponent(fileName)}`,
    tags: mergeFilmStudioTags(inferred.tags, userTags),
    autoTags: inferred.tags,
    userTags,
    purpose,
    category,
    share: { published: Boolean(record.shareEnabled && record.shareToken) },
  };
}

function listFilmStudioFiles(kind: FilmStudioLibraryKind) {
  const root = filmStudioRoot(kind);
  mkdirSync(root, { recursive: true });
  const metadata = readFilmStudioMetadata();
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isFilmStudioFile(kind, entry.name))
    .map((entry) => {
      try {
        return makeFilmStudioItem(kind, entry.name, statSync(join(root, entry.name)), metadata);
      } catch {
        return null;
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt));
}

function sendFilmStudioMedia(request: IncomingMessage, response: ServerResponse, kind: FilmStudioLibraryKind, encodedName: string): void {
  const fileName = safeFilmStudioFileName(encodedName);
  if (!fileName || !isFilmStudioFile(kind, fileName)) {
    emotionJson(response, 404, { error: 'MEDIA_NOT_FOUND' });
    return;
  }
  const root = filmStudioRoot(kind);
  const filePath = join(root, fileName);
  if (!existsSync(filePath)) {
    emotionJson(response, 404, { error: 'MEDIA_NOT_FOUND' });
    return;
  }
  let stats;
  try {
    stats = statSync(filePath);
    if (!stats.isFile()) throw new Error('not a file');
  } catch {
    emotionJson(response, 404, { error: 'MEDIA_NOT_FOUND' });
    return;
  }

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

  const contentLength = size === 0 ? 0 : end - start + 1;
  response.statusCode = statusCode;
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Type', filmStudioMimeType(fileName));
  response.setHeader('Content-Length', String(contentLength));
  response.setHeader('Cache-Control', 'no-store');
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

function makeFilmStudioFilePath(kind: FilmStudioLibraryKind, extension: string): string {
  const root = filmStudioRoot(kind);
  mkdirSync(root, { recursive: true });
  const prefix = kind === 'emotion' ? 'Movie' : 'Action';
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
  let candidate = join(root, `${prefix}_${timestamp}${extension}`);
  let index = 2;
  while (existsSync(candidate)) {
    candidate = join(root, `${prefix}_${timestamp}_${index}${extension}`);
    index += 1;
  }
  return candidate;
}

function receiveFilmStudioUpload(request: IncomingMessage, filePath: string, maximumBytes: number): Promise<number> {
  return new Promise((resolveUpload, rejectUpload) => {
    const declaredLength = Number(request.headers['content-length'] || 0);
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
      rejectUpload(new Error('FILE_TOO_LARGE'));
      return;
    }
    let total = 0;
    let settled = false;
    const output = createWriteStream(filePath, { flags: 'wx' });
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      output.destroy();
      try { if (existsSync(filePath)) unlinkSync(filePath); } catch { }
      rejectUpload(error);
    };
    request.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maximumBytes) {
        request.pause();
        fail(new Error('FILE_TOO_LARGE'));
      }
    });
    request.on('aborted', () => fail(new Error('UPLOAD_ABORTED')));
    request.on('error', (error) => fail(error instanceof Error ? error : new Error('UPLOAD_FAILED')));
    output.on('error', (error) => fail(error));
    output.on('finish', () => {
      if (settled) return;
      settled = true;
      resolveUpload(total);
    });
    request.pipe(output);
  });
}

function readFilmStudioJsonRequest(request: IncomingMessage, maximumBytes = 64 * 1024): Promise<Record<string, unknown>> {
  return new Promise((resolveRequest, rejectRequest) => {
    const chunks: Buffer[] = [];
    let total = 0;
    request.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maximumBytes) {
        rejectRequest(new Error('REQUEST_TOO_LARGE'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('aborted', () => rejectRequest(new Error('REQUEST_ABORTED')));
    request.on('error', () => rejectRequest(new Error('REQUEST_FAILED')));
    request.on('end', () => {
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_JSON');
        resolveRequest(value as Record<string, unknown>);
      } catch {
        rejectRequest(new Error('INVALID_JSON'));
      }
    });
  });
}

function filmStudioRequestIsLocal(request: IncomingMessage): boolean {
  const origin = String(request.headers.origin || '');
  return origin === 'http://127.0.0.1:5174' || origin === 'http://localhost:5174';
}

function findFilmStudioItem(kind: FilmStudioLibraryKind, fileName: string) {
  if (!isFilmStudioFile(kind, fileName)) return null;
  const filePath = join(filmStudioRoot(kind), fileName);
  if (!existsSync(filePath)) return null;
  try {
    const stats = statSync(filePath);
    return stats.isFile() ? makeFilmStudioItem(kind, fileName, stats, readFilmStudioMetadata()) : null;
  } catch {
    return null;
  }
}

function updateFilmStudioMetadata(kind: FilmStudioLibraryKind, fileName: string, patch: Record<string, unknown>) {
  const document = readFilmStudioMetadata();
  const key = filmStudioMetadataKey(kind, fileName);
  const current = document.items[key] || {};
  const next: FilmStudioMetadataRecord = { ...current, updatedAt: new Date().toISOString() };
  const title = cleanFilmStudioText(patch.title, 120);
  const purpose = cleanFilmStudioText(patch.purpose, 280);
  const category = cleanFilmStudioText(patch.category, 60);
  const tags = cleanFilmStudioTags(patch.tags);
  if (title) next.title = title; else delete next.title;
  if (purpose) next.purpose = purpose; else delete next.purpose;
  if (category) next.category = category; else delete next.category;
  if (tags.length) next.tags = tags; else delete next.tags;
  document.items[key] = next;
  writeFilmStudioMetadata(document);
  return findFilmStudioItem(kind, fileName);
}

type FilmStudioShareTunnel = { origin: string; child: ReturnType<typeof spawn> };

let activeFilmStudioShareTunnel: FilmStudioShareTunnel | null = null;
let startingFilmStudioShareTunnel: Promise<FilmStudioShareTunnel> | null = null;

function cloudflaredExecutable(): string | null {
  const wingetAlias = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe');
  if (existsSync(wingetAlias)) return wingetAlias;
  const result = spawnSync('where.exe', ['cloudflared.exe'], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return null;
  const path = result.stdout.trim().split(/\r?\n/u)[0];
  return path || null;
}

function cloudflaredIsAvailable(): boolean {
  return Boolean(cloudflaredExecutable());
}

function ensureFilmStudioShareService(): void {
  const servicePath = resolve(webConfigDirectory, 'tools', 'media-share-server.mjs');
  if (!existsSync(servicePath)) throw new Error('SHARE_SERVICE_MISSING');
  const child = spawn(process.execPath, [servicePath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, MEZIP_SHARE_PORT: String(filmStudioSharePort) },
  });
  child.unref();
}

function startFilmStudioShareTunnel(): Promise<FilmStudioShareTunnel> {
  if (activeFilmStudioShareTunnel && !activeFilmStudioShareTunnel.child.killed) return Promise.resolve(activeFilmStudioShareTunnel);
  if (startingFilmStudioShareTunnel) return startingFilmStudioShareTunnel;
  const cloudflared = cloudflaredExecutable();
  if (!cloudflared) return Promise.reject(new Error('PUBLIC_SHARE_CONNECTOR_MISSING'));
  ensureFilmStudioShareService();
  startingFilmStudioShareTunnel = new Promise((resolveTunnel, rejectTunnel) => {
    const child = spawn(cloudflared, ['tunnel', '--url', `http://127.0.0.1:${filmStudioSharePort}`, '--no-autoupdate'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = (error?: Error, origin?: string) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      startingFilmStudioShareTunnel = null;
      if (error || !origin) {
        try { child.kill(); } catch { }
        rejectTunnel(error || new Error('PUBLIC_SHARE_TUNNEL_FAILED'));
        return;
      }
      const tunnel = { origin, child };
      activeFilmStudioShareTunnel = tunnel;
      child.once('exit', () => {
        if (activeFilmStudioShareTunnel?.child === child) activeFilmStudioShareTunnel = null;
      });
      resolveTunnel(tunnel);
    };
    const inspectOutput = (chunk: Buffer | string) => {
      const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/iu.exec(String(chunk));
      if (match) finish(undefined, match[0]);
    };
    timeout = setTimeout(() => finish(new Error('PUBLIC_SHARE_TUNNEL_TIMEOUT')), 20000);
    child.stdout?.on('data', inspectOutput);
    child.stderr?.on('data', inspectOutput);
    child.on('error', () => finish(new Error('PUBLIC_SHARE_TUNNEL_FAILED')));
    child.on('exit', () => finish(new Error('PUBLIC_SHARE_TUNNEL_FAILED')));
  });
  return startingFilmStudioShareTunnel;
}

function publishFilmStudioItem(kind: FilmStudioLibraryKind, fileName: string): Promise<{ publicUrl: string; localUrl: string }> {
  return startFilmStudioShareTunnel().then((tunnel) => {
    const document = readFilmStudioMetadata();
    const key = filmStudioMetadataKey(kind, fileName);
    const current = document.items[key] || {};
    const token = current.shareToken || randomBytes(24).toString('hex');
    document.items[key] = {
      ...current,
      shareToken: token,
      shareEnabled: true,
      publishedAt: current.publishedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    writeFilmStudioMetadata(document);
    return {
      publicUrl: `${tunnel.origin}/s/${token}`,
      localUrl: `http://127.0.0.1:${filmStudioSharePort}/s/${token}`,
    };
  });
}

function unpublishFilmStudioItem(kind: FilmStudioLibraryKind, fileName: string): void {
  const document = readFilmStudioMetadata();
  const key = filmStudioMetadataKey(kind, fileName);
  const current = document.items[key];
  if (!current) return;
  current.shareEnabled = false;
  delete current.shareToken;
  delete current.publishedAt;
  current.updatedAt = new Date().toISOString();
  document.items[key] = current;
  writeFilmStudioMetadata(document);
}

function uploadExtension(kind: FilmStudioLibraryKind, contentType: string): string | null {
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  if (kind === 'emotion') {
    if (normalized === 'video/webm') return '.webm';
    if (normalized === 'video/mp4') return '.mp4';
    return null;
  }
  if (normalized === 'image/png') return '.png';
  if (normalized === 'image/jpeg') return '.jpg';
  if (normalized === 'image/webp') return '.webp';
  return null;
}

function moveFilmStudioFileToRecycleBin(filePath: string): void {
  const command = 'Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:FILM_STUDIO_DELETE_PATH, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)';
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    encoding: 'utf8',
    env: { ...process.env, FILM_STUDIO_DELETE_PATH: filePath },
    timeout: 15000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error('RECYCLE_BIN_MOVE_FAILED');
}

function filmStudioLibraryRoute(): Plugin {
  const maximumUploadBytes = 1024 * 1024 * 1024;
  const sendLibrary = (response: ServerResponse, kind: FilmStudioLibraryKind) => {
    emotionJson(response, 200, {
      libraryName: kind === 'emotion' ? 'Emotion.' : 'Action.',
      kind,
      recordingsPath: kind === 'emotion' ? '视频\\Desktop Recordings' : '图片\\Action Screenshots',
      items: listFilmStudioFiles(kind),
    });
  };
  const handleUpload = async (request: IncomingMessage, response: ServerResponse, kind: FilmStudioLibraryKind) => {
    const extension = uploadExtension(kind, String(request.headers['content-type'] || ''));
    if (!extension) {
      emotionJson(response, 415, { error: 'UNSUPPORTED_MEDIA_TYPE' });
      return;
    }
    const filePath = makeFilmStudioFilePath(kind, extension);
    try {
      const size = await receiveFilmStudioUpload(request, filePath, maximumUploadBytes);
      const fileName = filePath.slice(filePath.lastIndexOf('\\') + 1);
      emotionJson(response, 201, {
        saved: true,
        item: findFilmStudioItem(kind, fileName) || {
          id: fileName,
          name: fileName,
          size,
          modifiedAt: statSync(filePath).mtime.toISOString(),
          mimeType: filmStudioMimeType(fileName),
          url: `/api/film-studio/v1/media/${kind}/${encodeURIComponent(fileName)}`,
        },
      });
    } catch (error) {
      emotionJson(response, error instanceof Error && error.message === 'FILE_TOO_LARGE' ? 413 : 500, { error: error instanceof Error ? error.message : 'UPLOAD_FAILED' });
    }
  };
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = request.url?.split('?')[0] ?? '';
    const libraryMatch = /^\/api\/film-studio\/v1\/library\/(emotion|action)$/u.exec(path);
    if (libraryMatch) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        emotionJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      sendLibrary(response, libraryMatch[1] as FilmStudioLibraryKind);
      return;
    }
    if (path === '/api/film-studio/v1/libraries') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        emotionJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      emotionJson(response, 200, { emotion: listFilmStudioFiles('emotion'), action: listFilmStudioFiles('action') });
      return;
    }
    if (path === '/api/film-studio/v1/share/status') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        emotionJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      emotionJson(response, 200, {
        connectorAvailable: cloudflaredIsAvailable(),
        publicOrigin: activeFilmStudioShareTunnel?.origin || null,
        localShareService: `http://127.0.0.1:${filmStudioSharePort}`,
      });
      return;
    }
    const metadataMatch = /^\/api\/film-studio\/v1\/metadata\/(emotion|action)\/(.+)$/u.exec(path);
    if (metadataMatch) {
      if (request.method !== 'PUT') {
        response.setHeader('Allow', 'PUT');
        emotionJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      if (!filmStudioRequestIsLocal(request)) {
        emotionJson(response, 403, { error: 'LOCAL_ORIGIN_REQUIRED' });
        return;
      }
      const kind = metadataMatch[1] as FilmStudioLibraryKind;
      const fileName = safeFilmStudioFileName(metadataMatch[2]);
      if (!fileName || !findFilmStudioItem(kind, fileName)) {
        emotionJson(response, 404, { error: 'MEDIA_NOT_FOUND' });
        return;
      }
      void readFilmStudioJsonRequest(request).then((patch) => {
        const item = updateFilmStudioMetadata(kind, fileName, patch);
        if (!item) {
          emotionJson(response, 404, { error: 'MEDIA_NOT_FOUND' });
          return;
        }
        emotionJson(response, 200, { saved: true, item });
      }).catch((error) => {
        emotionJson(response, 400, { error: error instanceof Error ? error.message : 'INVALID_METADATA_REQUEST' });
      });
      return;
    }
    const publishMatch = /^\/api\/film-studio\/v1\/share\/publish\/(emotion|action)\/(.+)$/u.exec(path);
    if (publishMatch) {
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        emotionJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      if (!filmStudioRequestIsLocal(request)) {
        emotionJson(response, 403, { error: 'LOCAL_ORIGIN_REQUIRED' });
        return;
      }
      const kind = publishMatch[1] as FilmStudioLibraryKind;
      const fileName = safeFilmStudioFileName(publishMatch[2]);
      if (!fileName || !findFilmStudioItem(kind, fileName)) {
        emotionJson(response, 404, { error: 'MEDIA_NOT_FOUND' });
        return;
      }
      void publishFilmStudioItem(kind, fileName).then((share) => {
        emotionJson(response, 200, { published: true, item: findFilmStudioItem(kind, fileName), ...share });
      }).catch((error) => {
        const code = error instanceof Error ? error.message : 'PUBLIC_SHARE_FAILED';
        emotionJson(response, code === 'PUBLIC_SHARE_CONNECTOR_MISSING' ? 503 : 500, { error: code });
      });
      return;
    }
    const unpublishMatch = /^\/api\/film-studio\/v1\/share\/unpublish\/(emotion|action)\/(.+)$/u.exec(path);
    if (unpublishMatch) {
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        emotionJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      if (!filmStudioRequestIsLocal(request)) {
        emotionJson(response, 403, { error: 'LOCAL_ORIGIN_REQUIRED' });
        return;
      }
      const kind = unpublishMatch[1] as FilmStudioLibraryKind;
      const fileName = safeFilmStudioFileName(unpublishMatch[2]);
      if (!fileName || !findFilmStudioItem(kind, fileName)) {
        emotionJson(response, 404, { error: 'MEDIA_NOT_FOUND' });
        return;
      }
      unpublishFilmStudioItem(kind, fileName);
      emotionJson(response, 200, { unpublished: true, item: findFilmStudioItem(kind, fileName) });
      return;
    }
    const mediaMatch = /^\/api\/film-studio\/v1\/media\/(emotion|action)\/(.+)$/u.exec(path);
    if (mediaMatch) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        emotionJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      sendFilmStudioMedia(request, response, mediaMatch[1] as FilmStudioLibraryKind, mediaMatch[2]);
      return;
    }
    const uploadMatch = /^\/api\/film-studio\/v1\/upload\/(emotion|action)$/u.exec(path);
    if (uploadMatch) {
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        emotionJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      void handleUpload(request, response, uploadMatch[1] as FilmStudioLibraryKind);
      return;
    }
    const deleteMatch = /^\/api\/film-studio\/v1\/delete\/(emotion|action)\/(.+)$/u.exec(path);
    if (deleteMatch) {
      if (request.method !== 'DELETE') {
        response.setHeader('Allow', 'DELETE');
        emotionJson(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      if (request.headers['x-film-studio-confirm'] !== 'recycle-bin') {
        emotionJson(response, 400, { error: 'DELETE_CONFIRMATION_REQUIRED' });
        return;
      }
      const origin = String(request.headers.origin || '');
      if (origin && origin !== 'http://127.0.0.1:5174') {
        emotionJson(response, 403, { error: 'LOCAL_ORIGIN_REQUIRED' });
        return;
      }
      const kind = deleteMatch[1] as FilmStudioLibraryKind;
      const fileName = safeFilmStudioFileName(deleteMatch[2]);
      if (!fileName || !isFilmStudioFile(kind, fileName)) {
        emotionJson(response, 404, { error: 'MEDIA_NOT_FOUND' });
        return;
      }
      const filePath = join(filmStudioRoot(kind), fileName);
      if (!existsSync(filePath)) {
        emotionJson(response, 404, { error: 'MEDIA_NOT_FOUND' });
        return;
      }
      try {
        moveFilmStudioFileToRecycleBin(filePath);
        emotionJson(response, 200, { recycled: true, name: fileName });
      } catch {
        emotionJson(response, 500, { error: 'RECYCLE_BIN_MOVE_FAILED' });
      }
      return;
    }
    next();
  };

  return {
    name: 'mezip-film-studio-local-libraries',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

function xLocalCaptureTimelineRoute(): Plugin {
  const redirect = (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse, next: () => void) => {
    const path = request.url?.split('?')[0];
    if (path !== '/x/timeline') {
      next();
      return;
    }
    response.statusCode = 302;
    response.setHeader('Location', '/x-local-capture-v1/index.html#timeline');
    response.end();
  };
  return {
    name: 'mezip-x-local-capture-timeline-route',
    configureServer(server) { server.middlewares.use(redirect); },
    configurePreviewServer(server) { server.middlewares.use(redirect); },
  };
}

function identitySecurityCenterRoutes(): Plugin {
  const fragments: Record<string, string> = {
    '/identity': 'overview',
    '/identity/accounts': 'accounts',
    '/identity/mail': 'mail',
    '/identity/otp': 'otp',
    '/identity/chatgpt': 'chatgpt',
    '/identity/browser-profiles': 'profiles',
    '/identity/2fa': 'twofa',
    '/identity/devices': 'devices',
    '/identity/security': 'security',
    '/identity/recovery': 'recovery',
    '/identity/logs': 'logs',
    '/identity/settings': 'settings',
  };
  const redirect = (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse, next: () => void) => {
    // Keep the root application route intact. The previous fallback treated
    // "/" as an empty path and then as "/identity", which hijacked the
    // original step-by-step login page. Identity routes remain explicit and
    // continue to redirect to the independent security-center website.
    const rawPath = request.url?.split('?')[0] ?? '/';
    const path = rawPath === '/' ? '/' : rawPath.replace(/\/$/u, '') || '/';
    const workspaceMatch = /^\/identity\/accounts\/([a-z0-9_-]+)$/iu.exec(path);
    const fragment = workspaceMatch ? `account/${workspaceMatch[1]}` : fragments[path];
    if (!fragment) {
      next();
      return;
    }
    response.statusCode = 302;
    response.setHeader('Location', `/identity-browser-security-center-v1/index.html#${fragment}`);
    response.end();
  };
  return {
    name: 'mezip-identity-security-center-routes',
    configureServer(server) { server.middlewares.use(redirect); },
    configurePreviewServer(server) { server.middlewares.use(redirect); },
  };
}

export default defineConfig({
  plugins: [react(), emotionLibraryRoute(), filmStudioLibraryRoute(), xLocalCaptureTimelineRoute(), identitySecurityCenterRoutes()],
  server: {
    proxy: {
      '/api/integrations/github': {
        target: 'http://127.0.0.1:4317',
        changeOrigin: false,
      },
      '/v1/github-workspace': {
        target: 'http://127.0.0.1:4317',
        changeOrigin: false,
      },
      '/v1/social': {
        target: 'http://127.0.0.1:4318',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
  },
});
