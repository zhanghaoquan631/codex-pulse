import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAX_BODY_BYTES = 256 * 1024;
const LOCAL_ORIGINS = new Set(['http://127.0.0.1:5174', 'http://localhost:5174']);
const WORKSPACE_STATUSES = new Set(['ACTIVE', 'ATTENTION_REQUIRED', 'LOCKED', 'ARCHIVED', 'DISABLED']);
const TWO_FACTOR_STATUSES = new Set(['NOT_CONFIGURED', 'CONFIGURED', 'REAUTH_REQUIRED', 'ERROR']);
const BROWSERS = new Set(['EDGE', 'CHROME']);
const VAULT_COOKIE = 'mezip_identity_vault';
const vaultSessions = new Map();
const launchedProfiles = new Map();
const gmailAuthorizationRequests = new Map();
const GMAIL_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.readonly'];

function parseEnvironmentFile(contents) {
  const values = {};
  for (const line of contents.split(/\r?\n/gu)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    values[key] = raw.length >= 2 && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
      ? raw.slice(1, -1)
      : raw;
  }
  return values;
}

/**
 * The helper service is deliberately started outside Vite, so it needs the
 * same local-only environment loading convention as the existing connectors.
 * Values are never printed or returned by any API response.
 */
function withLocalEnvironment(environment = process.env) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env.development.local'),
    resolve(repositoryRoot, '.env.local'),
    resolve(repositoryRoot, '.env.development.local'),
  ];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) return environment;
  const fileValues = parseEnvironmentFile(readFileSync(file, 'utf8'));
  return { ...fileValues, ...environment };
}

function now() {
  return new Date().toISOString();
}

function localDataRoot() {
  const configured = process.env.MEZIP_IDENTITY_SECURITY_DATA_PATH?.trim();
  if (configured) return resolve(configured);
  return join(process.env.LOCALAPPDATA?.trim() || tmpdir(), 'ME.zip', 'identity-browser-security');
}

function paths(root = localDataRoot()) {
  return {
    root,
    state: join(root, 'state.json'),
    vault: join(root, 'vault.enc.json'),
    profiles: join(root, 'browser-profiles'),
    archives: join(root, 'profile-archives'),
  };
}

function atomicWrite(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, filePath);
}

function emptyState() {
  return {
    version: 1,
    workspaces: [],
    profiles: [],
    devices: [],
    events: [],
  };
}

function readState(root) {
  const file = paths(root).state;
  if (!existsSync(file)) return emptyState();
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (
      value?.version === 1 &&
      Array.isArray(value.workspaces) &&
      Array.isArray(value.profiles) &&
      Array.isArray(value.devices) &&
      Array.isArray(value.events)
    ) return value;
  } catch {
    // Fail closed: a corrupt local state must never be interpreted as another account's data.
  }
  return emptyState();
}

function writeState(root, state) {
  atomicWrite(paths(root).state, state);
}

function safeId(value, label = 'ID') {
  const normalized = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9_-]{7,80}$/iu.test(normalized)) {
    throw apiError(400, 'VALIDATION', `${label} is invalid.`);
  }
  return normalized;
}

function cleanText(value, label, max = 240, required = false) {
  const normalized = String(value ?? '').trim();
  if (required && normalized.length === 0) throw apiError(400, 'VALIDATION', `${label} is required.`);
  if (normalized.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(normalized)) {
    throw apiError(400, 'VALIDATION', `${label} is invalid.`);
  }
  return normalized;
}

function email(value) {
  const normalized = cleanText(value, 'Email address', 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    throw apiError(400, 'VALIDATION', 'Email address is invalid.');
  }
  return normalized;
}

function apiError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function errorBody(error) {
  return {
    error: {
      code: error?.code || 'INTERNAL',
      message: error?.message || 'The local security center request failed.',
    },
  };
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.from(chunk);
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) throw apiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    chunks.push(value);
  }
  if (size === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw apiError(400, 'VALIDATION', 'Request body must be a JSON object.');
  }
}

function isLoopback(request) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress || '');
}

function allowedOrigin(request) {
  const origin = request.headers.origin;
  return origin === undefined || LOCAL_ORIGINS.has(origin);
}

function send(response, status, body, request) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  const origin = request?.headers?.origin;
  if (origin && LOCAL_ORIGINS.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Vary', 'Origin');
  }
  response.end(JSON.stringify(body));
}

function redirect(response, location) {
  response.statusCode = 302;
  response.setHeader('Location', location);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.end();
}

function readCookie(request, name) {
  const items = String(request.headers.cookie || '').split(';');
  for (const item of items) {
    const split = item.trim().indexOf('=');
    if (split < 0) continue;
    if (item.trim().slice(0, split) === name) return decodeURIComponent(item.trim().slice(split + 1));
  }
  return null;
}

function profilePath(root, profileId) {
  const result = resolve(paths(root).profiles, profileId);
  const parent = `${resolve(paths(root).profiles)}${sep}`;
  if (!result.startsWith(parent)) throw apiError(400, 'VALIDATION', 'Profile path is invalid.');
  return result;
}

function ensureProfileOwner(state, workspaceId, profileId) {
  const profile = state.profiles.find((item) => item.id === profileId);
  if (!profile) throw apiError(404, 'NOT_FOUND', 'Browser profile was not found.');
  if (profile.workspaceId !== workspaceId) {
    throw apiError(403, 'PROFILE_WORKSPACE_MISMATCH', 'A browser profile can only be used by its own account workspace.');
  }
  return profile;
}

function workspace(state, workspaceId) {
  const result = state.workspaces.find((item) => item.id === workspaceId);
  if (!result) throw apiError(404, 'NOT_FOUND', 'Account workspace was not found.');
  return result;
}

function addEvent(state, workspaceId, type, message, severity = 'INFO') {
  state.events.unshift({
    id: `evt_${randomUUID()}`,
    workspaceId,
    type,
    severity,
    message: cleanText(message, 'Event message', 320, true),
    occurredAt: now(),
  });
  state.events = state.events.slice(0, 600);
}

function redactedEvents(events, maximum = 80) {
  return events.slice(0, maximum).map(redactEvent);
}

function workspaceAlerts(state, row) {
  const profile = state.profiles.find((item) => item.id === row.profileId);
  const alerts = [];
  if (row.twoFactor.status !== 'CONFIGURED') alerts.push({ level: 'HIGH', code: 'TWO_FACTOR', message: '2FA 尚未确认配置。' });
  if (!row.recoveryConfigured) alerts.push({ level: 'MEDIUM', code: 'RECOVERY', message: '恢复方式尚未确认。' });
  if (!['CONNECTED', 'CONNECTED_IDLE', 'SYNCING'].includes(row.gmail.status)) alerts.push({ level: 'LOW', code: 'GMAIL', message: 'Gmail 尚未完成官方授权。' });
  if (!profile || profile.status === 'DELETED') alerts.push({ level: 'HIGH', code: 'PROFILE', message: '独立浏览器 Profile 不可用。' });
  if (row.status !== 'ACTIVE') alerts.push({ level: 'MEDIUM', code: 'STATUS', message: '账号工作区未处于活跃状态。' });
  return alerts;
}

function scoreWorkspace(state, row) {
  const profile = state.profiles.find((item) => item.id === row.profileId);
  const items = [
    { label: '2FA 已配置', value: row.twoFactor.status === 'CONFIGURED', points: 35 },
    { label: '恢复方式已确认', value: row.recoveryConfigured === true, points: 20 },
    { label: '独立 Browser Profile 可用', value: Boolean(profile && profile.status !== 'DELETED'), points: 25 },
    { label: '账号工作区处于活跃状态', value: row.status === 'ACTIVE', points: 10 },
    { label: 'Gmail 已完成官方授权', value: ['CONNECTED', 'CONNECTED_IDLE', 'SYNCING'].includes(row.gmail.status), points: 10 },
  ];
  return {
    score: items.filter((item) => item.value).reduce((total, item) => total + item.points, 0),
    factors: items,
  };
}

function publicWorkspace(state, row) {
  const profile = state.profiles.find((item) => item.id === row.profileId);
  return {
    ...row,
    security: scoreWorkspace(state, row),
    alerts: workspaceAlerts(state, row),
    profile: profile ? publicProfile(profile) : null,
  };
}

function publicProfile(profile) {
  return {
    id: profile.id,
    workspaceId: profile.workspaceId,
    name: profile.name,
    browser: profile.browser,
    operatingSystem: 'Windows',
    isolation: 'DEDICATED_USER_DATA_DIRECTORY',
    storage: 'Browser-managed Cookie, LocalStorage, SessionStorage and cache are isolated in this directory.',
    status: profile.status,
    createdAt: profile.createdAt,
    lastOpenedAt: profile.lastOpenedAt || null,
    lastClearedAt: profile.lastClearedAt || null,
    launchedBySecurityCenter: launchedProfiles.has(profile.id),
  };
}

function dashboard(root, state, environment = {}) {
  const rows = state.workspaces.map((row) => publicWorkspace(state, row));
  const alerts = rows.flatMap((row) => row.alerts.map((alert) => ({ ...alert, workspaceId: row.id, email: row.email })));
  let gmailOAuth = 'NOT_CONFIGURED';
  try { gmailOAuth = gmailConfiguration(environment) ? 'CONFIGURED_NOT_CONNECTED' : 'NOT_CONFIGURED'; } catch { gmailOAuth = 'CONFIGURATION_INVALID'; }
  return {
    mode: 'LOCAL_PRIVATE_DESKTOP',
    policy: {
      passwordsStored: false,
      fingerprintSpoofing: false,
      crossProfileCookieCopy: false,
      gmailData: 'UNAUTHORIZED_UNLESS_OFFICIAL_OAUTH_CONNECTED',
      gmailOAuth,
      chatgptData: 'NO_CHATGPT_DATA_ACCESS',
    },
    bridge: { status: 'RUNNING', host: '127.0.0.1', storageRoot: 'LOCALAPPDATA/ME.zip/identity-browser-security' },
    totals: {
      accounts: rows.length,
      twoFactorConfigured: rows.filter((row) => row.twoFactor.status === 'CONFIGURED').length,
      gmailConnected: rows.filter((row) => ['CONNECTED', 'CONNECTED_IDLE', 'SYNCING'].includes(row.gmail.status)).length,
      profiles: state.profiles.filter((row) => row.status !== 'DELETED').length,
      alerts: alerts.length,
    },
    workspaces: rows,
    profiles: state.profiles.filter((row) => row.status !== 'DELETED').map(publicProfile),
    devices: state.devices,
    events: redactedEvents(state.events),
    alerts,
    dataDirectoryConfigured: Boolean(root),
  };
}

function browserExecutable(browser) {
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  const candidates = browser === 'EDGE'
    ? [
        join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ]
    : [
        join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function destinationUrl(destination) {
  const destinations = {
    GMAIL: 'https://mail.google.com/',
    CHATGPT: 'https://chatgpt.com/',
    GOOGLE_SECURITY: 'https://myaccount.google.com/security',
  };
  const url = destinations[String(destination || '').toUpperCase()];
  if (!url) throw apiError(400, 'VALIDATION', 'Destination is not allowed.');
  return url;
}

function base32Decode(value) {
  const normalized = String(value || '').toUpperCase().replace(/[\s-]/gu, '');
  if (!/^[A-Z2-7]{16,256}$/u.test(normalized)) throw apiError(400, 'VALIDATION', 'TOTP secret is invalid.');
  let bits = '';
  for (const character of normalized) bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(character).toString(2).padStart(5, '0');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totpCode(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', secret).update(buffer).digest();
  const offset = hash[hash.length - 1] & 0x0f;
  const code = ((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
  return { code, remainingSeconds: 30 - (Math.floor(timestamp / 1000) % 30) };
}

function sealed(value, key, aad) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') };
}

function openSealed(value, key, aad) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

function vaultKey(passphrase, salt) {
  return scryptSync(passphrase, Buffer.from(salt, 'base64url'), 32, { N: 16384, r: 8, p: 1 });
}

function readVault(root) {
  const file = paths(root).vault;
  if (!existsSync(file)) return null;
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (value?.version === 1 && typeof value.salt === 'string' && value.check && value.items && typeof value.items === 'object') return value;
  } catch {}
  throw apiError(500, 'VAULT_CORRUPT', 'The local encrypted vault could not be read.');
}

function setVaultSession(response, root, key) {
  const token = randomBytes(32).toString('base64url');
  vaultSessions.set(token, { root, key, expiresAt: Date.now() + 10 * 60 * 1000 });
  response.setHeader('Set-Cookie', `${VAULT_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=600`);
}

function vaultSession(request, root) {
  const token = readCookie(request, VAULT_COOKIE);
  const session = token ? vaultSessions.get(token) : null;
  if (!session || session.root !== root || session.expiresAt <= Date.now()) throw apiError(423, 'VAULT_LOCKED', 'Unlock the local encrypted 2FA vault first.');
  return session;
}

function withVault(root, session, mutator) {
  const vault = readVault(root);
  if (!vault) throw apiError(409, 'VAULT_SETUP_REQUIRED', 'Set a local vault passphrase before adding 2FA secrets.');
  const result = mutator(vault, session.key);
  atomicWrite(paths(root).vault, vault);
  return result;
}

function gmailConfiguration(environment) {
  const clientId = environment.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = environment.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = environment.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  let callback;
  try { callback = new URL(redirectUri); } catch { throw apiError(409, 'GMAIL_OAUTH_CONFIGURATION_INVALID', 'GOOGLE_OAUTH_REDIRECT_URI is invalid.'); }
  if (
    callback.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(callback.hostname) ||
    callback.username || callback.password || callback.search || callback.hash ||
    callback.pathname !== '/v1/identity-security/gmail/callback'
  ) {
    throw apiError(409, 'GMAIL_OAUTH_CONFIGURATION_INVALID', 'GOOGLE_OAUTH_REDIRECT_URI must be the exact local callback: http://127.0.0.1:4326/v1/identity-security/gmail/callback.');
  }
  return { clientId, clientSecret, redirectUri: callback.toString() };
}

function randomBase64Url(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

function pkceChallenge(verifier) {
  return createHash('sha256').update(verifier, 'utf8').digest('base64url');
}

function safeEqual(left, right) {
  const first = Buffer.from(String(left || ''), 'utf8');
  const second = Buffer.from(String(right || ''), 'utf8');
  return first.byteLength === second.byteLength && timingSafeEqual(first, second);
}

function gmailVaultKey(workspaceId) {
  return `gmail:${workspaceId}`;
}

function mailboxVaultKey(workspaceId) {
  return `mailbox:${workspaceId}`;
}

function vaultGet(root, session, key, aad) {
  const vault = readVault(root);
  const item = vault?.items?.[key];
  if (!item) return null;
  return JSON.parse(openSealed(item, session.key, aad));
}

function vaultSet(root, session, key, aad, value) {
  return withVault(root, session, (vault, encryptionKey) => {
    vault.items[key] = sealed(JSON.stringify(value), encryptionKey, aad);
  });
}

function sanitizeMailText(value, maximum = 3_000) {
  return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, maximum);
}

function gmailHeader(headers, name) {
  return headers.find((item) => String(item.name || '').toLowerCase() === name.toLowerCase())?.value || '';
}

function decodeGmailBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) return Buffer.from(payload.body.data, 'base64url').toString('utf8');
  for (const part of payload.parts || []) {
    const mimeType = String(part.mimeType || '').toLowerCase();
    if (mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
    const nested = decodeGmailBody(part);
    if (nested) return nested;
  }
  return '';
}

function extractEmailOtp(message) {
  const content = `${message.subject || ''}\n${message.preview || ''}`;
  const keywords = /(?:verification\s*(?:code|number)|security\s*code|login\s*code|one[ -]?time\s*(?:password|code)|\bOTP\b|验证码|验证代码|登录验证码|动态码)/iu;
  if (!keywords.test(content)) return null;
  const candidate = /(?:verification\s*(?:code|number)|security\s*code|login\s*code|one[ -]?time\s*(?:password|code)|\bOTP\b|验证码|验证代码|登录验证码|动态码)[^\d]{0,48}([0-9]{4,8})(?!\d)/iu.exec(content);
  if (!candidate?.[1]) return null;
  const code = candidate[1];
  const index = candidate.index + candidate[0].lastIndexOf(code);
  const before = content.slice(Math.max(0, index - 3), index);
  const after = content.slice(index + code.length, index + code.length + 3);
  if (/[¥$€£]|(?:19|20)\d{2}[\/.\-]/u.test(before) || /^[\/.\-]/u.test(after)) return null;
  return {
    code,
    source: sanitizeMailText(message.from || 'Unknown sender', 160),
    confidence: 'HIGH',
    status: 'ACTIVE',
    expiresAt: null,
  };
}

function mailSnapshotFromGmailMessage(workspaceRow, message) {
  const headers = message.payload?.headers || [];
  const receivedMs = Number(message.internalDate || Date.now());
  const from = sanitizeMailText(gmailHeader(headers, 'From'), 320) || 'Unknown sender';
  const subject = sanitizeMailText(gmailHeader(headers, 'Subject'), 500) || '(No subject)';
  const preview = sanitizeMailText(decodeGmailBody(message.payload) || message.snippet, 3_000);
  const attachments = (message.payload?.parts || []).filter((part) => part.filename && part.body?.attachmentId).length;
  const snapshot = {
    id: `msg_${String(message.id || randomUUID())}`,
    workspaceId: workspaceRow.id,
    gmailConnectionId: `gmail_${workspaceRow.id}`,
    recipientEmail: workspaceRow.email,
    from,
    senderDomain: (/@([^>\s]+)/u.exec(from)?.[1] || '').toLowerCase(),
    subject,
    preview,
    receivedAt: new Date(Number.isFinite(receivedMs) ? receivedMs : Date.now()).toISOString(),
    attachmentCount: attachments,
    mailType: /(?:verification|code|验证码|登录)/iu.test(`${subject}\n${preview}`) ? 'VERIFICATION' : 'MAIL',
  };
  const otp = extractEmailOtp(snapshot);
  return { ...snapshot, otpDetected: Boolean(otp), otp };
}

function redactEvent(event) {
  const { message, ...rest } = event;
  return { ...rest, message: String(message).replace(/\b\d{4,8}\b/gu, '[redacted]') };
}

function createWorkspace(root, state, input) {
  const accountEmail = email(input.email);
  if (state.workspaces.some((item) => item.email === accountEmail)) throw apiError(409, 'CONFLICT', 'This Google account already has an account workspace.');
  const browser = String(input.browser || 'EDGE').toUpperCase();
  if (!BROWSERS.has(browser)) throw apiError(400, 'VALIDATION', 'Browser must be Edge or Chrome.');
  const workspaceId = `ws_${randomUUID().replace(/-/gu, '')}`;
  const profileId = `profile_${randomUUID().replace(/-/gu, '')}`;
  const createdAt = now();
  const row = {
    id: workspaceId,
    ownerId: 'LOCAL_OS_OWNER',
    email: accountEmail,
    purpose: cleanText(input.purpose, 'Purpose', 120) || '未分类',
    tags: Array.isArray(input.tags) ? [...new Set(input.tags.map((tag) => cleanText(tag, 'Tag', 32)).filter(Boolean))].slice(0, 12) : [],
    status: 'ACTIVE',
    twoFactor: { status: 'NOT_CONFIGURED', provider: null, lastVerifiedAt: null },
    gmail: { status: 'DISCONNECTED', lastSyncedAt: null, lastNewMailCount: 0, connectionId: null, officialOAuthOnly: true },
    chatgpt: { status: 'NOT_LINKED', label: null, plan: 'UNKNOWN', officialSiteOnly: true, lastOpenedAt: null },
    recoveryConfigured: false,
    profileId,
    createdAt,
    updatedAt: createdAt,
  };
  const profile = { id: profileId, workspaceId, ownerId: 'LOCAL_OS_OWNER', name: cleanText(input.profileName, 'Profile name', 80) || `Profile ${state.profiles.length + 1}`, browser, status: 'READY', createdAt, lastOpenedAt: null, lastClearedAt: null };
  mkdirSync(profilePath(root, profileId), { recursive: true });
  state.workspaces.push(row);
  state.profiles.push(profile);
  addEvent(state, workspaceId, 'WORKSPACE_CREATED', '创建了独立账号工作区和空白浏览器 Profile。');
  return row;
}

function patchWorkspace(state, row, input) {
  if (input.purpose !== undefined) row.purpose = cleanText(input.purpose, 'Purpose', 120) || '未分类';
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags)) throw apiError(400, 'VALIDATION', 'Tags must be an array.');
    row.tags = [...new Set(input.tags.map((tag) => cleanText(tag, 'Tag', 32)).filter(Boolean))].slice(0, 12);
  }
  if (input.status !== undefined) {
    const status = String(input.status).toUpperCase();
    if (!WORKSPACE_STATUSES.has(status)) throw apiError(400, 'VALIDATION', 'Account workspace status is invalid.');
    row.status = status;
  }
  if (input.recoveryConfigured !== undefined) row.recoveryConfigured = input.recoveryConfigured === true;
  if (input.twoFactor?.status !== undefined) {
    const status = String(input.twoFactor.status).toUpperCase();
    if (!TWO_FACTOR_STATUSES.has(status)) throw apiError(400, 'VALIDATION', '2FA status is invalid.');
    row.twoFactor = { status, provider: cleanText(input.twoFactor.provider, '2FA provider', 64) || null, lastVerifiedAt: status === 'CONFIGURED' ? now() : row.twoFactor.lastVerifiedAt };
  }
  if (input.chatgpt?.status !== undefined) {
    const status = String(input.chatgpt.status).toUpperCase();
    if (!['NOT_LINKED', 'LINKED', 'SIGNED_IN_LOCAL_PROFILE', 'LOGIN_REQUIRED', 'UNKNOWN'].includes(status)) throw apiError(400, 'VALIDATION', 'ChatGPT binding status is invalid.');
    row.chatgpt = {
      status,
      label: cleanText(input.chatgpt.label, 'ChatGPT label', 120) || row.chatgpt.label || null,
      plan: cleanText(input.chatgpt.plan, 'ChatGPT plan', 48) || row.chatgpt.plan || 'UNKNOWN',
      officialSiteOnly: true,
      lastOpenedAt: row.chatgpt.lastOpenedAt || null,
    };
  }
  row.updatedAt = now();
  addEvent(state, row.id, 'WORKSPACE_UPDATED', '更新了账号工作区的非敏感状态。');
}

function clearProfileData(root, profile, scope) {
  const directory = profilePath(root, profile.id);
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  const defaultDirectory = join(directory, 'Default');
  if (scope === 'ALL') {
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
  } else {
    const targets = scope === 'COOKIES'
      ? [join(defaultDirectory, 'Network', 'Cookies'), join(defaultDirectory, 'Network', 'Cookies-journal')]
      : [join(defaultDirectory, 'Cache'), join(defaultDirectory, 'Code Cache'), join(defaultDirectory, 'GPUCache')];
    for (const target of targets) rmSync(target, { recursive: true, force: true });
  }
}

function archiveProfileData(root, profile) {
  const source = profilePath(root, profile.id);
  const target = resolve(paths(root).archives, `${profile.id}-${Date.now()}`);
  if (!source.startsWith(`${resolve(paths(root).profiles)}${sep}`)) throw apiError(400, 'VALIDATION', 'Profile path is invalid.');
  if (existsSync(source)) {
    mkdirSync(dirname(target), { recursive: true });
    renameSync(source, target);
  }
  mkdirSync(source, { recursive: true });
}

function removeProfileData(root, profile) {
  const directory = profilePath(root, profile.id);
  rmSync(directory, { recursive: true, force: true });
}

function identityAppUrl(environment, fragment = 'mail') {
  const configured = environment.PUBLIC_APP_URL?.trim() || 'http://127.0.0.1:5174';
  let origin;
  try { origin = new URL(configured); } catch { origin = new URL('http://127.0.0.1:5174'); }
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname)) origin = new URL('http://127.0.0.1:5174');
  return new URL(`/identity-browser-security-center-v1/index.html#${fragment}`, origin).toString();
}

async function googleRequest(url, init, failureCode, failureMessage) {
  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw apiError(503, failureCode, failureMessage);
  }
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) {
    const providerCode = cleanText(body?.error, 'Provider error', 80) || 'provider_error';
    throw apiError(response.status === 401 ? 401 : 502, failureCode, `${failureMessage} (${providerCode}).`);
  }
  return body;
}

async function exchangeGoogleAuthorizationCode(configuration, code, verifier) {
  return googleRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      redirect_uri: configuration.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  }, 'GMAIL_OAUTH_EXCHANGE_FAILED', 'Google OAuth token exchange failed');
}

async function refreshGoogleAccessToken(configuration, refreshToken) {
  return googleRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      grant_type: 'refresh_token',
    }),
  }, 'GMAIL_REAUTH_REQUIRED', 'Google OAuth refresh failed');
}

async function googleUserInfo(accessToken) {
  return googleRequest('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, 'GMAIL_ACCOUNT_VALIDATION_FAILED', 'Google account validation failed');
}

async function accessTokenForGmail(root, session, state, row, configuration) {
  const tokenRecord = vaultGet(root, session, gmailVaultKey(row.id), `gmail:${row.id}`);
  if (!tokenRecord?.accessToken) throw apiError(409, 'GMAIL_AUTH_REQUIRED', 'This account has not completed Gmail authorization.');
  if (tokenRecord.expiresAt && Date.parse(tokenRecord.expiresAt) > Date.now() + 90_000) return tokenRecord.accessToken;
  if (!tokenRecord.refreshToken) {
    row.gmail.status = 'REAUTH_REQUIRED';
    addEvent(state, row.id, 'GMAIL_REAUTH_REQUIRED', 'Gmail access token has expired and no refresh token is available.', 'WARNING');
    writeState(root, state);
    throw apiError(401, 'GMAIL_REAUTH_REQUIRED', 'Gmail authorization needs to be completed again.');
  }
  const refreshed = await refreshGoogleAccessToken(configuration, tokenRecord.refreshToken);
  const next = {
    ...tokenRecord,
    accessToken: cleanText(refreshed.access_token, 'Google access token', 8_192, true),
    expiresAt: new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000).toISOString(),
  };
  vaultSet(root, session, gmailVaultKey(row.id), `gmail:${row.id}`, next);
  return next.accessToken;
}

async function syncGmailInbox(root, session, state, row, configuration) {
  const accessToken = await accessTokenForGmail(root, session, state, row, configuration);
  const list = await googleRequest('https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=25', {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, 'GMAIL_SYNC_FAILED', 'Gmail message list request failed');
  const messages = [];
  for (const item of (list.messages || []).slice(0, 25)) {
    if (!item?.id) continue;
    const message = await googleRequest(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, 'GMAIL_SYNC_FAILED', 'Gmail message request failed');
    messages.push(mailSnapshotFromGmailMessage(row, message));
  }
  const prior = vaultGet(root, session, mailboxVaultKey(row.id), `mailbox:${row.id}`) || { messages: [], otpRecords: [] };
  const priorOtp = new Map((prior.otpRecords || []).map((otp) => [otp.messageId, otp]));
  const records = [];
  for (const message of messages) {
    if (!message.otp) continue;
    const priorRecord = priorOtp.get(message.id);
    records.push(priorRecord || {
      id: `otp_${randomUUID()}`,
      ownerId: 'LOCAL_OWNER',
      workspaceId: row.id,
      gmailConnectionId: `gmail_${row.id}`,
      messageId: message.id,
      recipientEmail: row.email,
      sender: message.from,
      source: message.otp.source,
      code: message.otp.code,
      receivedAt: message.receivedAt,
      expiresAt: null,
      status: 'ACTIVE',
      confidence: message.otp.confidence,
      createdAt: now(),
    });
  }
  const newMailCount = messages.filter((message) => !(prior.messages || []).some((previous) => previous.id === message.id)).length;
  vaultSet(root, session, mailboxVaultKey(row.id), `mailbox:${row.id}`, { messages, otpRecords: records.slice(0, 100) });
  row.gmail = { ...row.gmail, status: 'CONNECTED_IDLE', lastSyncedAt: now(), lastNewMailCount: newMailCount, connectionId: `gmail_${row.id}`, officialOAuthOnly: true };
  row.updatedAt = now();
  addEvent(state, row.id, 'GMAIL_SYNCED', `Gmail 同步完成；新增 ${newMailCount} 封邮件。`);
  for (const record of records.filter((record) => !priorOtp.has(record.messageId))) addEvent(state, row.id, 'EMAIL_OTP_RECEIVED', '已在属于该账号的邮件中识别到验证码。');
  writeState(root, state);
  return { messages: messages.map(({ otp, ...message }) => ({ ...message, otpDetected: Boolean(otp) })), otpRecords: records, newMailCount, lastSyncedAt: row.gmail.lastSyncedAt };
}

export function createIdentitySecurityServer(options = {}) {
  const root = resolve(options.dataDirectory || localDataRoot());
  const host = options.host || '127.0.0.1';
  const port = Number(options.port || process.env.MEZIP_IDENTITY_SECURITY_PORT || 4326);
  const environment = options.environment || withLocalEnvironment();

  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (!isLoopback(request) || !allowedOrigin(request)) {
      send(response, 403, errorBody(apiError(403, 'FORBIDDEN', 'Only the local ME.zip application may use this security center.')), request);
      return;
    }
    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      response.setHeader('Access-Control-Allow-Origin', origin || 'http://127.0.0.1:5174');
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      response.end();
      return;
    }
    try {
      const url = new URL(request.url || '/', `http://${host}:${port}`);
      const pathname = url.pathname;
      const method = request.method || 'GET';
      const state = readState(root);

      if (method === 'GET' && pathname === '/v1/identity-security/state') {
        send(response, 200, dashboard(root, state, environment), request);
        return;
      }
      if (method === 'GET' && pathname === '/v1/identity-security/health') {
        send(response, 200, { status: 'OK', service: 'ME.zip Identity Browser Security Center', storage: 'LOCAL_PRIVATE' }, request);
        return;
      }
      if (method === 'POST' && pathname === '/v1/identity-security/workspaces') {
        const row = createWorkspace(root, state, await readJson(request));
        writeState(root, state);
        send(response, 201, { workspace: publicWorkspace(state, row) }, request);
        return;
      }

      const workspaceMatch = /^\/v1\/identity-security\/workspaces\/([a-z0-9_-]+)$/iu.exec(pathname);
      if (method === 'PATCH' && workspaceMatch) {
        const row = workspace(state, safeId(workspaceMatch[1], 'Workspace ID'));
        patchWorkspace(state, row, await readJson(request));
        writeState(root, state);
        send(response, 200, { workspace: publicWorkspace(state, row) }, request);
        return;
      }

      const launchMatch = /^\/v1\/identity-security\/workspaces\/([a-z0-9_-]+)\/profile\/([a-z0-9_-]+)\/open$/iu.exec(pathname);
      if (method === 'POST' && launchMatch) {
        const workspaceId = safeId(launchMatch[1], 'Workspace ID');
        const row = workspace(state, workspaceId);
        if (row.status !== 'ACTIVE') throw apiError(409, 'WORKSPACE_NOT_ACTIVE', 'Only an active account workspace can launch a browser profile.');
        const profile = ensureProfileOwner(state, workspaceId, safeId(launchMatch[2], 'Profile ID'));
        if (['DELETED', 'ARCHIVED', 'ERROR'].includes(profile.status)) throw apiError(409, 'PROFILE_NOT_AVAILABLE', 'This browser profile is not available. Rebuild or rebind it before opening an account.');
        const input = await readJson(request);
        const browserPath = browserExecutable(profile.browser);
        if (!browserPath) throw apiError(503, 'BROWSER_NOT_FOUND', `${profile.browser === 'EDGE' ? 'Microsoft Edge' : 'Google Chrome'} was not found on this computer.`);
        const urlToOpen = destinationUrl(input.destination);
        const dataDirectory = profilePath(root, profile.id);
        const child = spawn(browserPath, [`--user-data-dir=${dataDirectory}`, '--no-first-run', urlToOpen], { detached: true, stdio: 'ignore', windowsHide: true });
        child.unref();
        launchedProfiles.set(profile.id, child.pid);
        profile.status = 'RUNNING';
        profile.lastOpenedAt = now();
        addEvent(state, workspaceId, 'PROFILE_OPENED', `在独立 ${profile.browser} Profile 中打开官方页面。`);
        writeState(root, state);
        send(response, 200, { opened: true, destination: String(input.destination).toUpperCase(), profile: publicProfile(profile) }, request);
        return;
      }

      const profileActionMatch = /^\/v1\/identity-security\/workspaces\/([a-z0-9_-]+)\/profile\/([a-z0-9_-]+)\/(clear|archive|delete|stop)$/iu.exec(pathname);
      if (method === 'POST' && profileActionMatch) {
        const workspaceId = safeId(profileActionMatch[1], 'Workspace ID');
        workspace(state, workspaceId);
        const profile = ensureProfileOwner(state, workspaceId, safeId(profileActionMatch[2], 'Profile ID'));
        const action = profileActionMatch[3].toLowerCase();
        const input = await readJson(request);
        if (action === 'clear') {
          const scope = String(input.scope || '').toUpperCase();
          if (!['CACHE', 'COOKIES', 'ALL'].includes(scope) || input.confirmation !== `CLEAR ${scope}`) throw apiError(400, 'CONFIRMATION_REQUIRED', 'Confirm the exact data scope before clearing browser data.');
          clearProfileData(root, profile, scope);
          profile.lastClearedAt = now();
          profile.status = 'READY';
          addEvent(state, workspaceId, 'PROFILE_DATA_CLEARED', `已清除独立 Profile 的 ${scope} 数据。`, 'WARNING');
        } else if (action === 'archive') {
          if (input.confirmation !== 'ARCHIVE PROFILE') throw apiError(400, 'CONFIRMATION_REQUIRED', 'Confirm profile archive before continuing.');
          archiveProfileData(root, profile);
          profile.status = 'ARCHIVED';
          addEvent(state, workspaceId, 'PROFILE_ARCHIVED', '已归档独立 Profile 的本地数据。', 'WARNING');
        } else if (action === 'delete') {
          if (input.confirmation !== 'DELETE PROFILE') throw apiError(400, 'CONFIRMATION_REQUIRED', 'Confirm profile deletion before continuing.');
          removeProfileData(root, profile);
          profile.status = 'DELETED';
          addEvent(state, workspaceId, 'PROFILE_DELETED', '已删除独立 Profile 本地数据。', 'WARNING');
        } else {
          const pid = launchedProfiles.get(profile.id);
          if (!pid) throw apiError(409, 'PROFILE_NOT_MANAGED', 'Only a browser process started by this security center can be stopped here.');
          try { process.kill(pid); } catch {}
          launchedProfiles.delete(profile.id);
          profile.status = 'READY';
          addEvent(state, workspaceId, 'PROFILE_STOPPED', '已请求关闭由安全中心启动的独立 Profile。');
        }
        writeState(root, state);
        send(response, 200, { profile: publicProfile(profile) }, request);
        return;
      }

      const gmailMatch = /^\/v1\/identity-security\/workspaces\/([a-z0-9_-]+)\/gmail\/(connect|sync|messages)$/iu.exec(pathname);
      if (gmailMatch) {
        const row = workspace(state, safeId(gmailMatch[1], 'Workspace ID'));
        const operation = gmailMatch[2];
        if (operation === 'connect' && method === 'POST') {
          const configuration = gmailConfiguration(environment);
          if (!configuration) throw apiError(409, 'GMAIL_OAUTH_NOT_CONFIGURED', 'Gmail is not connected. Add the official Google OAuth values to local configuration before authorizing this account.');
          const session = vaultSession(request, root);
          const requestState = randomBase64Url();
          const verifier = randomBase64Url(48);
          gmailAuthorizationRequests.set(requestState, { workspaceId: row.id, root, verifier, vaultToken: readCookie(request, VAULT_COOKIE), expiresAt: Date.now() + 10 * 60 * 1000 });
          for (const [key, pending] of gmailAuthorizationRequests.entries()) if (pending.expiresAt <= Date.now()) gmailAuthorizationRequests.delete(key);
          row.gmail = { ...row.gmail, status: 'SYNCING' };
          addEvent(state, row.id, 'GMAIL_AUTHORIZATION_REQUESTED', '已请求使用官方 Google OAuth 连接 Gmail。');
          writeState(root, state);
          const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
          authorizationUrl.search = new URLSearchParams({
            client_id: configuration.clientId,
            redirect_uri: configuration.redirectUri,
            response_type: 'code',
            scope: GMAIL_SCOPES.join(' '),
            access_type: 'offline',
            prompt: 'consent',
            state: requestState,
            code_challenge: pkceChallenge(verifier),
            code_challenge_method: 'S256',
          }).toString();
          send(response, 200, { authorizationUrl: authorizationUrl.toString(), status: 'AUTHORIZATION_REQUIRED', vaultUnlocked: Boolean(session) }, request);
          return;
        }
        if (operation === 'sync' && method === 'POST') {
          const configuration = gmailConfiguration(environment);
          if (!configuration) throw apiError(409, 'GMAIL_OAUTH_NOT_CONFIGURED', 'Gmail OAuth is not configured locally.');
          const session = vaultSession(request, root);
          const snapshot = await syncGmailInbox(root, session, state, row, configuration);
          send(response, 200, snapshot, request);
          return;
        }
        if (operation === 'messages' && method === 'GET') {
          const session = vaultSession(request, root);
          const snapshot = vaultGet(root, session, mailboxVaultKey(row.id), `mailbox:${row.id}`) || { messages: [], otpRecords: [] };
          send(response, 200, { workspaceId: row.id, recipientEmail: row.email, messages: snapshot.messages || [], otpRecords: snapshot.otpRecords || [], lastSyncedAt: row.gmail.lastSyncedAt || null }, request);
          return;
        }
      }

      if (method === 'GET' && pathname === '/v1/identity-security/gmail/callback') {
        const callbackState = cleanText(url.searchParams.get('state'), 'OAuth state', 300, true);
        const pending = gmailAuthorizationRequests.get(callbackState);
        if (!pending || pending.root !== root || pending.expiresAt <= Date.now() || !safeEqual(callbackState, url.searchParams.get('state'))) {
          redirect(response, identityAppUrl(environment, 'mail&gmail=invalid_state'));
          return;
        }
        gmailAuthorizationRequests.delete(callbackState);
        const row = workspace(state, pending.workspaceId);
        const denial = url.searchParams.get('error');
        if (denial) {
          row.gmail = { ...row.gmail, status: 'DISCONNECTED' };
          addEvent(state, row.id, 'GMAIL_AUTHORIZATION_DENIED', 'Google Gmail 授权被取消或拒绝。', 'WARNING');
          writeState(root, state);
          redirect(response, identityAppUrl(environment, 'mail&gmail=denied'));
          return;
        }
        const code = cleanText(url.searchParams.get('code'), 'OAuth code', 4_096, true);
        const session = pending.vaultToken ? vaultSessions.get(pending.vaultToken) : null;
        if (!session || session.root !== root || session.expiresAt <= Date.now()) {
          row.gmail = { ...row.gmail, status: 'DISCONNECTED' };
          addEvent(state, row.id, 'GMAIL_AUTHORIZATION_INTERRUPTED', 'Gmail 授权已完成，但本机 Vault 已锁定；没有保存任何 token。', 'WARNING');
          writeState(root, state);
          redirect(response, identityAppUrl(environment, 'mail&gmail=vault_locked'));
          return;
        }
        const configuration = gmailConfiguration(environment);
        if (!configuration) {
          redirect(response, identityAppUrl(environment, 'mail&gmail=not_configured'));
          return;
        }
        try {
          const tokens = await exchangeGoogleAuthorizationCode(configuration, code, pending.verifier);
          const accessToken = cleanText(tokens.access_token, 'Google access token', 8_192, true);
          const profile = await googleUserInfo(accessToken);
          const authorizedEmail = email(profile.email);
          if (authorizedEmail !== row.email) throw apiError(403, 'GMAIL_ACCOUNT_MISMATCH', 'The authorized Gmail account does not match this account workspace.');
          vaultSet(root, session, gmailVaultKey(row.id), `gmail:${row.id}`, {
            accessToken,
            refreshToken: cleanText(tokens.refresh_token, 'Google refresh token', 8_192) || null,
            expiresAt: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
            authorizedEmail,
          });
          row.gmail = { ...row.gmail, status: 'CONNECTED_IDLE', connectionId: `gmail_${row.id}`, lastSyncedAt: null, lastNewMailCount: 0, officialOAuthOnly: true };
          row.updatedAt = now();
          addEvent(state, row.id, 'GMAIL_CONNECTED', 'Gmail 已通过官方 OAuth 连接；令牌仅加密保存在本机 Vault。');
          writeState(root, state);
          redirect(response, identityAppUrl(environment, 'mail&gmail=connected'));
        } catch (error) {
          row.gmail = { ...row.gmail, status: 'REAUTH_REQUIRED' };
          addEvent(state, row.id, 'GMAIL_REAUTH_REQUIRED', 'Gmail 授权未完成；没有将凭据暴露给浏览器或日志。', 'WARNING');
          writeState(root, state);
          redirect(response, identityAppUrl(environment, 'mail&gmail=failed'));
        }
        return;
      }

      const vaultStatus = pathname === '/v1/identity-security/vault/status';
      if (method === 'GET' && vaultStatus) {
        const vault = readVault(root);
        const token = readCookie(request, VAULT_COOKIE);
        const active = token ? vaultSessions.get(token) : null;
        send(response, 200, { configured: Boolean(vault), unlocked: Boolean(active && active.root === root && active.expiresAt > Date.now()), autoLockMinutes: 10 }, request);
        return;
      }
      if (method === 'POST' && pathname === '/v1/identity-security/vault/unlock') {
        const input = await readJson(request);
        const passphrase = cleanText(input.passphrase, 'Vault passphrase', 512, true);
        if (passphrase.length < 12) throw apiError(400, 'VALIDATION', 'Use a vault passphrase of at least 12 characters.');
        let vault = readVault(root);
        if (!vault) {
          const salt = randomBytes(16).toString('base64url');
          const key = vaultKey(passphrase, salt);
          vault = { version: 1, salt, check: sealed('ME.zip identity vault v1', key, 'check'), items: {} };
          atomicWrite(paths(root).vault, vault);
          setVaultSession(response, root, key);
          send(response, 201, { configured: true, unlocked: true, created: true }, request);
          return;
        }
        const key = vaultKey(passphrase, vault.salt);
        try { openSealed(vault.check, key, 'check'); } catch { throw apiError(401, 'VAULT_PASSPHRASE_INVALID', 'Vault passphrase is incorrect.'); }
        setVaultSession(response, root, key);
        send(response, 200, { configured: true, unlocked: true, created: false }, request);
        return;
      }
      if (method === 'POST' && pathname === '/v1/identity-security/vault/lock') {
        const token = readCookie(request, VAULT_COOKIE);
        if (token) vaultSessions.delete(token);
        response.setHeader('Set-Cookie', `${VAULT_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
        send(response, 200, { unlocked: false }, request);
        return;
      }

      const totpMatch = /^\/v1\/identity-security\/workspaces\/([a-z0-9_-]+)\/2fa\/totp$/iu.exec(pathname);
      if (totpMatch && method === 'POST') {
        const row = workspace(state, safeId(totpMatch[1], 'Workspace ID'));
        const session = vaultSession(request, root);
        const input = await readJson(request);
        const secret = cleanText(input.secret, 'TOTP secret', 512, true);
        base32Decode(secret);
        withVault(root, session, (vault, key) => { vault.items[row.id] = sealed(secret, key, `totp:${row.id}`); });
        row.twoFactor = { status: 'CONFIGURED', provider: cleanText(input.provider, '2FA provider', 64) || 'TOTP', lastVerifiedAt: now() };
        row.updatedAt = now();
        addEvent(state, row.id, 'TOTP_VAULT_UPDATED', '已将 2FA 配置加密保存到本机 Vault；密钥不会显示或写入日志。');
        writeState(root, state);
        send(response, 204, null, request);
        return;
      }
      if (totpMatch && method === 'GET') {
        const row = workspace(state, safeId(totpMatch[1], 'Workspace ID'));
        const session = vaultSession(request, root);
        const vault = readVault(root);
        const encrypted = vault?.items?.[row.id];
        if (!encrypted) throw apiError(404, 'TOTP_NOT_CONFIGURED', 'No encrypted TOTP secret exists for this account workspace.');
        const value = totpCode(base32Decode(openSealed(encrypted, session.key, `totp:${row.id}`)));
        send(response, 200, value, request);
        return;
      }
      if (totpMatch && method === 'DELETE') {
        const row = workspace(state, safeId(totpMatch[1], 'Workspace ID'));
        const session = vaultSession(request, root);
        const input = await readJson(request);
        if (input.confirmation !== 'DELETE TOTP') throw apiError(400, 'CONFIRMATION_REQUIRED', 'Confirm TOTP deletion before continuing.');
        withVault(root, session, (vault) => { delete vault.items[row.id]; });
        row.twoFactor = { status: 'NOT_CONFIGURED', provider: null, lastVerifiedAt: null };
        row.updatedAt = now();
        addEvent(state, row.id, 'TOTP_VAULT_DELETED', '已从本机加密 Vault 删除 2FA Secret。', 'WARNING');
        writeState(root, state);
        send(response, 204, null, request);
        return;
      }

      if (method === 'GET' && pathname === '/v1/identity-security/otp') {
        const session = vaultSession(request, root);
        const requestedWorkspace = url.searchParams.get('workspaceId');
        const rows = requestedWorkspace ? [workspace(state, safeId(requestedWorkspace, 'Workspace ID'))] : state.workspaces;
        const records = rows.flatMap((row) => {
          const snapshot = vaultGet(root, session, mailboxVaultKey(row.id), `mailbox:${row.id}`) || { otpRecords: [] };
          return (snapshot.otpRecords || []).map((record) => ({ ...record, workspaceEmail: row.email }));
        }).sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt));
        send(response, 200, { records: records.slice(0, 100) }, request);
        return;
      }

      const securityCheckMatch = /^\/v1\/identity-security\/workspaces\/([a-z0-9_-]+)\/security-check$/iu.exec(pathname);
      if (method === 'POST' && securityCheckMatch) {
        const row = workspace(state, safeId(securityCheckMatch[1], 'Workspace ID'));
        const profile = state.profiles.find((item) => item.id === row.profileId);
        const result = {
          workspace: row.status === 'ACTIVE' ? 'OK' : 'ATTENTION',
          twoFactor: row.twoFactor.status === 'CONFIGURED' ? 'OK' : 'ATTENTION',
          gmail: row.gmail.status === 'CONNECTED_IDLE' ? 'OK' : 'ATTENTION',
          profile: profile && !['DELETED', 'ARCHIVED', 'ERROR'].includes(profile.status) ? 'OK' : 'ERROR',
          device: state.devices.some((item) => item.workspaceId === row.id && item.trust === 'TRUSTED') ? 'OK' : 'ATTENTION',
          alerts: workspaceAlerts(state, row),
          score: scoreWorkspace(state, row),
        };
        addEvent(state, row.id, 'SECURITY_CHECK', '已完成账号工作区安全检查。');
        writeState(root, state);
        send(response, 200, result, request);
        return;
      }

      if (method === 'POST' && pathname === '/v1/identity-security/devices/trust-local') {
        const input = await readJson(request);
        const workspaceId = safeId(input.workspaceId, 'Workspace ID');
        workspace(state, workspaceId);
        const existing = state.devices.find((item) => item.workspaceId === workspaceId && item.machine === 'THIS_WINDOWS_COMPUTER');
        if (!existing) {
          state.devices.push({ id: `device_${randomUUID().replace(/-/gu, '')}`, workspaceId, ownerId: 'LOCAL_OS_OWNER', machine: 'THIS_WINDOWS_COMPUTER', operatingSystem: 'Windows', trust: 'TRUSTED', createdAt: now(), lastSeenAt: now() });
          addEvent(state, workspaceId, 'DEVICE_TRUSTED', '已将当前 Windows 电脑标记为可信设备。');
          writeState(root, state);
        }
        send(response, 200, { devices: state.devices.filter((item) => item.workspaceId === workspaceId) }, request);
        return;
      }

      throw apiError(404, 'NOT_FOUND', 'The requested Identity Security Center route was not found.');
    } catch (error) {
      send(response, error?.status || 500, errorBody(error), request);
    }
  });
}

export function startIdentitySecurityServer(options = {}) {
  const host = options.host || '127.0.0.1';
  const port = Number(options.port || process.env.MEZIP_IDENTITY_SECURITY_PORT || 4326);
  createIdentitySecurityServer(options).listen(port, host, () => {
    process.stdout.write(`ME.zip Identity Browser Security Center listening on http://${host}:${port}\n`);
  });
}

export { extractEmailOtp, mailSnapshotFromGmailMessage };

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) startIdentitySecurityServer();
