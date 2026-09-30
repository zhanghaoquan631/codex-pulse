// Shared by the owner-only cloud proxy and the authenticated loopback gateway.
// No caller may choose a host, port, arbitrary file, or upstream request header.
import { billingProfile } from './billing-profiles.mjs';
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hasControls = value => /[\x00-\x20\x7f\\#]/.test(value);

function parsed(raw) {
  if (typeof raw !== 'string' || raw.length > 6000 || hasControls(raw) || !raw.startsWith('/') || raw.startsWith('//')) return null;
  const [pathname, search = '', extra] = raw.split('?');
  if (extra !== undefined || pathname.includes('//')) return null;
  try {
    const url = new URL(raw, 'http://relay.invalid');
    if (url.pathname !== pathname || url.origin !== 'http://relay.invalid') return null;
    // Double decoding is never required by any of these applications.
    if (decodeURIComponent(pathname).includes('%')) return null;
    return { pathname, query: new URLSearchParams(search) };
  } catch { return null; }
}

function queryAllowed(query, rules = {}) {
  const seen = new Set();
  for (const [key, value] of query) {
    if (seen.has(key) || !rules[key] || /[\x00-\x1f\x7f]/.test(value) || !rules[key](value)) return false;
    seen.add(key);
  }
  return true;
}
const integer = max => value => /^\d{1,5}$/.test(value) && Number(value) >= 1 && Number(value) <= max;
const oneOf = (...values) => value => values.includes(value);
const text = max => value => value.length <= max;
const repoPart = value => /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(value) && !value.includes('..');
const identifier = raw => {
  try { const value = decodeURIComponent(raw); return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value) && !value.includes('..'); }
  catch { return false; }
};
export function safeMediaName(raw) {
  try { const value = decodeURIComponent(raw); return value.length > 0 && value.length <= 255 && !/[\x00-\x1f\x7f/\\%<>:"|?*]/.test(value) && !/[. ]$/.test(value) && value !== '.' && value !== '..'; }
  catch { return false; }
}
export function validMediaType(kind, contentType) {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  return kind === 'emotion' ? ['video/webm', 'video/mp4'].includes(mime)
    : kind === 'action' && ['image/png', 'image/jpeg', 'image/webp'].includes(mime);
}

export function resolveRelayRoute(method, raw) {
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null;
  const input = parsed(raw); if (!input) return null;
  const { pathname, query } = input;
  if (pathname === '/relay/identity/open-billing' && method === 'POST' && queryAllowed(query, { email: value => !!billingProfile(value) }) && query.has('email'))
    return { app: 'identity', method, path: pathname, write: true, maxBodyBytes: 4096, timeoutMs: 60000 };
  if (pathname === '/health' && method === 'GET' && !query.size) return { app: 'health', method, path: pathname, write: false };
  if (pathname === '/relay/booking/book' && method === 'POST' && !query.size) return { app: 'booking', port: 5241, method, path: '/api/book', write: true, json: true, binary: false, maxBodyBytes: 12000, timeoutMs: 30000 };
  if (/^\/relay\/identity\/(status|gmail-codes|gmail-connection|quota-refresh)$/.test(pathname)) {
    if(!queryAllowed(query,{email:value=>/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(gmail\.com|googlemail\.com)$/i.test(value)})||!query.has('email'))return null;
    const write=pathname.endsWith('/gmail-connection')||pathname.endsWith('/quota-refresh');
    if(method!==(write?'POST':'GET'))return null;
    return {app:'identity',method,path:pathname,write,maxBodyBytes:4096,timeoutMs:60000};
  }
  const operation = /^\/operations\/([^/]+)$/.exec(pathname);
  if (operation && UUID.test(operation[1]) && method === 'GET' && !query.size) return { app: 'operations', method, path: pathname, id: operation[1].toLowerCase(), write: false };
  if (pathname.startsWith('/uploads')) {
    if (query.size) return null;
    const match = /^\/uploads(?:\/([0-9a-f-]+)(?:\/(commit|chunks\/\d{1,3}))?)?$/i.exec(pathname);
    if (!match || (match[1] && !UUID.test(match[1]))) return null;
    const action = !match[1] ? 'create' : match[2]?.startsWith('chunks/') ? 'chunk' : match[2] || 'status';
    const allowed = { create: ['POST'], chunk: ['PUT'], commit: ['POST'], status: ['GET', 'DELETE'] };
    if (!allowed[action]?.includes(method)) return null;
    return { app: 'uploads', method, path: pathname, write: !['GET', 'HEAD'].includes(method), action,
      id: match[1]?.toLowerCase(), chunkIndex: action === 'chunk' ? Number(match[2].slice(7)) : null,
      maxBodyBytes: action === 'chunk' ? UPLOAD_CHUNK_BYTES : 4096, timeoutMs: 240000 };
  }
  if (pathname === '/relay/finance/storage/finance' && ['GET', 'PUT'].includes(method) && !query.size)
    return { app: 'storage', method, path: '/storage/finance', write: method === 'PUT', maxBodyBytes: 16 * 1024 * 1024 };
  const match = /^\/relay\/(github|finance|media)(\/.*)$/.exec(pathname);
  if (!match) return null;
  const app = match[1], localPath = match[2];
  const base = { app, port: { github: 4317, finance: 4325, media: 5174 }[app], method,
    path: localPath + (query.size ? `?${query.toString()}` : ''), write: !['GET', 'HEAD'].includes(method),
    json: true, binary: false, maxBodyBytes: app === 'finance' ? 5 * 1024 * 1024 : 1000000, timeoutMs: 30000 };
  if (app === 'github') {
    const root = '/v1/github-workspace';
    if (!localPath.startsWith(`${root}/`)) return null;
    const suffix = localPath.slice(root.length);
    let rules = {}, allowed = false;
    if (method === 'GET') {
      if (['/connection', '/overview', '/tasks', '/snippets', '/issues', '/pull-requests', '/activity', '/repositories', '/search'].includes(suffix)) {
        allowed = true;
        if (suffix === '/repositories') rules = { limit: integer(100), page: integer(10000), q: text(160), visibility: oneOf('ALL','PUBLIC','PRIVATE','ARCHIVED','FORKED'), language: text(60), sort: oneOf('UPDATED','NAME','STARS') };
        if (suffix === '/issues') rules = { state: oneOf('ALL','OPEN','CLOSED'), repository: text(220), q: text(160) };
        if (suffix === '/pull-requests') rules = { state: oneOf('ALL','OPEN','CLOSED','MERGED'), repository: text(220), q: text(160), reviewState: oneOf('ALL','REVIEW_REQUIRED','CHANGES_REQUESTED','APPROVED','UNKNOWN') };
        if (suffix === '/snippets') rules = { q: text(160), language: text(60), source: oneOf('MEZIP','GITHUB_GIST','REPOSITORY_FILE','MANUAL'), favorite: oneOf('true','false') };
        if (suffix === '/activity') rules = { kind: oneOf('PUSH','COMMIT','ISSUE','PULL_REQUEST','ISSUE_COMMENT','PR_REVIEW','STAR','FORK','ALL') };
        if (suffix === '/search') rules = { q: text(160) };
      }
      const repo = /^\/repositories\/([^/]+)\/([^/]+)(?:\/(contents|commits|branches))?$/.exec(suffix);
      if (repo && repoPart(repo[1]) && repoPart(repo[2])) {
        allowed = true;
        if (repo[3] === 'contents') rules = { path: value => value.length <= 1000 && !value.includes('..') && !/[\\\x00-\x1f]/.test(value) };
        if (repo[3] === 'commits') rules = { page: integer(1000) };
      }
      const detail = /^\/(issues|pull-requests)\/([^/]+)\/([^/]+)\/(\d+)$/.exec(suffix);
      if (detail && repoPart(detail[2]) && repoPart(detail[3])) allowed = true;
    } else if (method === 'POST' && ['/sync', '/snippets'].includes(suffix)) {
      allowed = true; base.timeoutMs = suffix === '/sync' ? 200000 : 30000;
    } else if (method === 'DELETE' && suffix === '/connection') allowed = true;
    else {
      const task = /^\/tasks\/([^/]+)$/.exec(suffix);
      const snippet = /^\/snippets\/([^/]+)(\/favorite)?$/.exec(suffix);
      allowed = method === 'PATCH' && task && identifier(task[1]) || snippet && identifier(snippet[1]) && (method === 'PATCH' && snippet[2] || method === 'DELETE' && !snippet[2]);
    }
    return allowed && queryAllowed(query, rules) ? base : null;
  }
  if (app === 'finance') {
    const root = '/v1/finance/mobile';
    if (!localPath.startsWith(`${root}/`)) return null;
    const suffix = localPath.slice(root.length);
    if (method === 'GET' && ['/health', '/desktop-session', '/receipts'].includes(suffix) && !query.size) return base;
    if (method === 'POST' && suffix === '/invite' && queryAllowed(query, { version: oneOf('v2'), permanent: oneOf('1') })) return { ...base, method: 'GET', write: true };
    if (method === 'POST' && suffix === '/desktop-import' && !query.size) return { ...base, timeoutMs: 120000 };
    const receipt = /^\/receipts\/([A-Za-z0-9_-]{1,200})(?:\/(image|confirm|reject|reopen))?$/.exec(suffix);
    if (!receipt) return null;
    if (method === 'GET' && receipt[2] === 'image' && queryAllowed(query, { download: oneOf('1') })) return { ...base, json: false, binary: true };
    if (query.size) return null;
    if (method === 'PATCH' && !receipt[2] || method === 'POST' && ['confirm','reject','reopen'].includes(receipt[2])) return base;
    return null;
  }
  if (query.size) return null;
  if (method === 'GET' && localPath === '/api/film-studio/v1/libraries') return base;
  const media = /^\/api\/film-studio\/v1\/(media|delete)\/(emotion|action)\/([^/]+)$/.exec(localPath);
  if (!media || !safeMediaName(media[3])) return null;
  if (media[1] === 'media' && ['GET','HEAD'].includes(method)) return { ...base, json: false, binary: true, timeoutMs: 120000 };
  if (media[1] === 'delete' && method === 'DELETE') return { ...base, confirm: 'recycle-bin' };
  return null;
}
