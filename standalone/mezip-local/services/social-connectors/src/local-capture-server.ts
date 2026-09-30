import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import type { XCapturePersistenceSnapshot } from './x-local-capture.js';
import { XLocalCaptureApiAdapter } from './x-local-capture-api.js';
import { XLocalCaptureService, type XCapturePersistence } from './x-local-capture.js';
import type { WatchPersistenceSnapshot } from './watch-capture.js';
import { WatchCaptureService, type WatchPersistence } from './watch-capture.js';

interface OwnerDocument {
  readonly ownerId: string;
  readonly snapshot: XCapturePersistenceSnapshot;
}

interface CaptureDocument {
  readonly owners: readonly OwnerDocument[];
}

class JsonFileXCapturePersistence implements XCapturePersistence {
  public readonly durable = true;

  public constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
  }

  private readDocument(): CaptureDocument {
    if (!existsSync(this.path)) return { owners: [] };
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
      if (parsed !== null && typeof parsed === 'object' && Array.isArray((parsed as { owners?: unknown }).owners)) return parsed as CaptureDocument;
    } catch {
      // A corrupt local cache is not allowed to become a cross-owner read.
    }
    return { owners: [] };
  }

  public read(ownerId: string): XCapturePersistenceSnapshot | null {
    return this.readDocument().owners.find((entry) => entry.ownerId === ownerId)?.snapshot ?? null;
  }

  public write(ownerId: string, snapshot: XCapturePersistenceSnapshot): void {
    const document = this.readDocument();
    const owners = document.owners.filter((entry) => entry.ownerId !== ownerId);
    const temporary = `${this.path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({ owners: [...owners, { ownerId, snapshot }] }), { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, this.path);
  }
}

interface WatchOwnerDocument {
  readonly ownerId: string;
  readonly snapshot: WatchPersistenceSnapshot;
}

interface WatchDocument {
  readonly owners: readonly WatchOwnerDocument[];
}

/** Watch data is deliberately stored separately from X events. This keeps the
 * existing Capture file backward-compatible while making playback records
 * durable and owner-scoped. */
class JsonFileWatchPersistence implements WatchPersistence {
  public readonly durable = true;

  public constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
  }

  private readDocument(): WatchDocument {
    if (!existsSync(this.path)) return { owners: [] };
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
      if (parsed !== null && typeof parsed === 'object' && Array.isArray((parsed as { owners?: unknown }).owners)) return parsed as WatchDocument;
    } catch {
      // A corrupt local cache cannot be used to cross owner boundaries.
    }
    return { owners: [] };
  }

  public read(ownerId: string): WatchPersistenceSnapshot | null {
    return this.readDocument().owners.find((entry) => entry.ownerId === ownerId)?.snapshot ?? null;
  }

  public write(ownerId: string, snapshot: WatchPersistenceSnapshot): void {
    const document = this.readDocument();
    const owners = document.owners.filter((entry) => entry.ownerId !== ownerId);
    const temporary = `${this.path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({ owners: [...owners, { ownerId, snapshot }] }), { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, this.path);
  }
}

interface SessionPayload {
  readonly userId: string;
  readonly expiresAt: number;
}

function base64(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function sign(value: string, secret: Buffer): string {
  return base64(createHmac('sha256', secret).update(value).digest());
}

function sessionCookie(payload: SessionPayload, secret: Buffer): string {
  const value = base64(JSON.stringify(payload));
  return `${value}.${sign(value, secret)}`;
}

function parseCookies(header: string | undefined): Record<string, string> {
  return Object.fromEntries((header ?? '').split(';').flatMap((part) => {
    const separator = part.indexOf('=');
    return separator < 0 ? [] : [[part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())]];
  }));
}

function readSession(request: IncomingMessage, secret: Buffer): SessionPayload | null {
  const raw = parseCookies(request.headers.cookie).mezip_x_capture_session;
  if (raw === undefined) return null;
  const [encoded, signature] = raw.split('.');
  if (encoded === undefined || signature === undefined) return null;
  const expected = sign(encoded, secret);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (value !== null && typeof value === 'object' && typeof (value as SessionPayload).userId === 'string' && typeof (value as SessionPayload).expiresAt === 'number' && (value as SessionPayload).expiresAt > Date.now()) return value as SessionPayload;
  } catch {
    return null;
  }
  return null;
}

function newSession(secret: Buffer, userId = `local_${randomUUID()}`): { readonly payload: SessionPayload; readonly cookie: string } {
  const payload: SessionPayload = { userId, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1_000 };
  return { payload, cookie: sessionCookie(payload, secret) };
}

function localOwnerId(dataPath: string): string {
  const ownerPath = join(dirname(dataPath), 'owner.id');
  if (existsSync(ownerPath)) {
    const stored = readFileSync(ownerPath, 'utf8').trim();
    if (/^local_[0-9a-f-]{36}$/iu.test(stored)) return stored;
  }

  // A loopback-only bridge is a single-user local installation. Reuse the
  // existing owner with the most captured events once, so upgrading from the
  // previous per-browser cookie model does not hide the user's history.
  let ownerId = `local_${randomUUID()}`;
  if (existsSync(dataPath)) {
    try {
      const parsed = JSON.parse(readFileSync(dataPath, 'utf8')) as { owners?: Array<{ ownerId?: unknown; snapshot?: { events?: unknown } }> };
      const existing = (parsed.owners ?? [])
        .filter((entry) => typeof entry.ownerId === 'string' && entry.snapshot !== null && typeof entry.snapshot === 'object' && Array.isArray(entry.snapshot.events))
        .sort((left, right) => (right.snapshot?.events as unknown[]).length - (left.snapshot?.events as unknown[]).length)[0];
      if (typeof existing?.ownerId === 'string' && existing.ownerId.length > 0) ownerId = existing.ownerId;
    } catch {
      // Invalid local data is handled by the persistence layer; start a fresh owner id.
    }
  }
  writeFileSync(ownerPath, `${ownerId}\n`, { encoding: 'utf8', mode: 0o600 });
  return ownerId;
}

const DEFAULT_BODY_MAX_BYTES = 1_000_000;
// A large Edge bookmark tree can legitimately exceed the normal event body
// limit. Keep a finite endpoint-specific cap instead of making every bridge
// route accept multi-megabyte payloads.
const EDGE_BOOKMARK_BODY_MAX_BYTES = 8_000_000;
const BRIDGE_PAIRING_TTL_MS = 10 * 60 * 1_000;
const BRIDGE_TOKEN_MAX = 100;

async function readBody(request: IncomingMessage, maxBytes = DEFAULT_BODY_MAX_BYTES): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.from(chunk as Uint8Array);
    size += value.byteLength;
    if (size > maxBytes) throw new Error('Local capture request is too large.');
    chunks.push(value);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function localSecret(path: string): Buffer {
  const secretPath = join(dirname(path), 'session.key');
  mkdirSync(dirname(secretPath), { recursive: true });
  if (existsSync(secretPath)) {
    const value = readFileSync(secretPath);
    if (value.byteLength >= 32) return value;
  }
  const value = randomBytes(32);
  writeFileSync(secretPath, value, { mode: 0o600 });
  return value;
}

interface BridgePairingCodeRecord {
  readonly pairingId: string;
  readonly ownerId: string;
  readonly codeHash: string;
  readonly expiresAt: number;
}

interface BridgeTokenRecord {
  readonly tokenHash: string;
  readonly ownerId: string;
  readonly origin: string;
  readonly pairedAt: string;
}

interface BridgePairingDocument {
  readonly pairingCode: BridgePairingCodeRecord | null;
  readonly tokens: readonly BridgeTokenRecord[];
}

interface BridgePairResult {
  readonly pairingId: string;
  readonly ownerId: string;
  readonly origin: string;
  readonly bridgeToken: string;
  readonly pairedAt: string;
}

function bridgeDigest(value: string, secret: Buffer): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function safeEqualText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

/**
 * Stores only HMACs of the short-lived pairing code and long-lived bridge
 * tokens.  The raw values are returned once to the trusted UI/extension and
 * are never written to disk, logs, or the URL.
 */
class JsonFileBridgePairingStore {
  public constructor(private readonly path: string, private readonly secret: Buffer) {
    mkdirSync(dirname(path), { recursive: true });
  }

  private read(): BridgePairingDocument {
    if (!existsSync(this.path)) return { pairingCode: null, tokens: [] };
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
      if (parsed !== null && typeof parsed === 'object') {
        const value = parsed as { pairingCode?: unknown; tokens?: unknown };
        const pairingCode = value.pairingCode !== null && typeof value.pairingCode === 'object' ? value.pairingCode as BridgePairingCodeRecord : null;
        const tokens = Array.isArray(value.tokens) ? value.tokens.filter((item): item is BridgeTokenRecord => item !== null && typeof item === 'object') : [];
        return { pairingCode, tokens };
      }
    } catch {
      // A corrupt pairing cache must fail closed rather than grant access.
    }
    return { pairingCode: null, tokens: [] };
  }

  private write(document: BridgePairingDocument): void {
    const temporary = `${this.path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(document), { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, this.path);
  }

  public issue(ownerId: string, now = Date.now()): { readonly pairingId: string; readonly pairingCode: string; readonly expiresAt: number } {
    const pairingId = randomUUID();
    const pairingCode = randomBytes(8).toString('hex').toUpperCase();
    const expiresAt = now + BRIDGE_PAIRING_TTL_MS;
    const current = this.read();
    this.write({
      pairingCode: { pairingId, ownerId, codeHash: bridgeDigest(pairingCode, this.secret), expiresAt },
      tokens: current.tokens,
    });
    return { pairingId, pairingCode, expiresAt };
  }

  public complete(input: { readonly pairingId?: string; readonly pairingCode: string; readonly origin: string; readonly existingToken?: string }, now = Date.now()): BridgePairResult {
    const current = this.read();
    const pairing = current.pairingCode;
    if (pairing === null || pairing.expiresAt <= now) {
      if (pairing !== null) this.write({ pairingCode: null, tokens: current.tokens });
      throw new Error('Bridge pairing code is missing or expired.');
    }
    if (input.pairingId !== undefined && input.pairingId !== pairing.pairingId) throw new Error('Bridge pairing request does not match.');
    if (!safeEqualText(bridgeDigest(input.pairingCode, this.secret), pairing.codeHash)) throw new Error('Bridge pairing code is invalid.');
    if (!isExtensionOrigin(input.origin)) throw new Error('Bridge pairing requires a browser extension origin.');
    const bridgeToken = randomBytes(32).toString('base64url');
    const pairedAt = new Date(now).toISOString();
    const existingTokenHash = input.existingToken ? bridgeDigest(input.existingToken, this.secret) : null;
    const tokens = [
      // Separate browser profiles can share an unpacked extension origin.
      // Rotate only the credential presented by this profile, keeping other
      // profiles paired even when this one has no valid previous credential.
      ...current.tokens.filter((token) => token.origin !== input.origin
        || existingTokenHash === null || !safeEqualText(token.tokenHash, existingTokenHash)),
      { tokenHash: bridgeDigest(bridgeToken, this.secret), ownerId: pairing.ownerId, origin: input.origin, pairedAt },
    ].slice(-BRIDGE_TOKEN_MAX);
    this.write({ pairingCode: null, tokens });
    return { pairingId: pairing.pairingId, ownerId: pairing.ownerId, origin: input.origin, bridgeToken, pairedAt };
  }

  public ownerForToken(origin: string, token: string): string | null {
    if (!isExtensionOrigin(origin) || token.trim() === '') return null;
    const digest = bridgeDigest(token, this.secret);
    const record = this.read().tokens.find((candidate) => candidate.origin === origin && safeEqualText(candidate.tokenHash, digest));
    return record?.ownerId ?? null;
  }
}

const DEFAULT_ALLOWED_ORIGINS = new Set(['http://127.0.0.1:5174', 'http://localhost:5174']);
const BRIDGE_PAIRING_CODE_PATHS = new Set([
  '/v1/x/local-capture/bridge/pairing-code',
  // Compatibility alias used by the first V13 pairing prototype.
  '/v1/x/local-capture/edge-bookmarks/pairing/start',
]);
const BRIDGE_PAIR_PATHS = new Set([
  '/v1/x/local-capture/bridge/pair',
  // Compatibility alias used by the first V13 pairing prototype.
  '/v1/x/local-capture/edge-bookmarks/pairing/complete',
]);

function configuredAllowedOrigins(): ReadonlySet<string> {
  const configured = process.env.MEZIP_X_CAPTURE_ALLOWED_ORIGINS ?? process.env.MEZIP_X_CAPTURE_EXTENSION_ORIGINS ?? '';
  return new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...configured.split(',').map((value) => value.trim()).filter((value) => value.length > 0),
  ]);
}

/**
 * CORS must be an exact allow-list.  In particular, accepting every
 * chrome-/edge-extension origin lets an unrelated extension bootstrap the
 * single local owner session.  Extension IDs can be configured through
 * MEZIP_X_CAPTURE_ALLOWED_ORIGINS (or the backwards-compatible
 * MEZIP_X_CAPTURE_EXTENSION_ORIGINS) without putting an ID in source.
 */
function allowedOrigin(origin: string | undefined, configured: ReadonlySet<string>, hasValidOwnerSession: boolean): string | null {
  if (origin === undefined) return 'http://127.0.0.1:5174';
  if (configured.has(origin)) return origin;
  // The extension cannot be known at source-build time when it is loaded
  // unpacked (its ID is derived by the browser).  A browser extension may
  // therefore use the owner session bootstrapped by the trusted loopback UI,
  // but it may never mint a new session merely by choosing an extension
  // origin.  An explicit allow-list remains available for deployments that
  // pin an extension ID.
  return isExtensionOrigin(origin) && hasValidOwnerSession ? origin : null;
}

function isExtensionOrigin(origin: string | undefined): boolean {
  return origin?.startsWith('chrome-extension://') === true || origin?.startsWith('edge-extension://') === true;
}

function isTrustedUiOrigin(origin: string | undefined, configured: ReadonlySet<string>): boolean {
  return origin === undefined || (origin !== undefined && configured.has(origin) && !isExtensionOrigin(origin));
}

function bridgeTokenMatches(request: IncomingMessage, expected: string | null): boolean {
  if (expected === null) return true;
  const supplied = request.headers['x-mezip-local-bridge-token'];
  if (typeof supplied !== 'string' || supplied.length === 0) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function json(response: ServerResponse, status: number, body: Readonly<Record<string, unknown>>, origin: string, cookie?: string): void {
  response.statusCode = status;
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cookie !== undefined) response.setHeader('Set-Cookie', `mezip_x_capture_session=${encodeURIComponent(cookie)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  response.end(JSON.stringify(body));
}

export interface LocalCaptureServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly dataPath?: string;
}

export function createLocalCaptureServer(options: LocalCaptureServerOptions = {}) {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? Number.parseInt(process.env.MEZIP_X_CAPTURE_PORT ?? '4319', 10);
  const dataPath = options.dataPath ?? process.env.MEZIP_X_CAPTURE_DATA_PATH ?? join(process.env.LOCALAPPDATA?.trim() || tmpdir(), 'ME.zip', 'x-local-capture', 'events.json');
  const secret = localSecret(dataPath);
  const ownerId = localOwnerId(dataPath);
  const origins = configuredAllowedOrigins();
  const bridgeToken = process.env.MEZIP_X_CAPTURE_BRIDGE_TOKEN?.trim() || null;
  const pairingStore = new JsonFileBridgePairingStore(join(dirname(dataPath), 'bridge-pairing.json'), secret);
  const service = new XLocalCaptureService(new JsonFileXCapturePersistence(dataPath));
  const watchPath = process.env.MEZIP_WATCH_CAPTURE_DATA_PATH?.trim() || join(dirname(dataPath), 'watch.json');
  const watchService = new WatchCaptureService(new JsonFileWatchPersistence(watchPath));
  const adapter = new XLocalCaptureApiAdapter(service, watchService);
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`);
    const isPairingCodePath = BRIDGE_PAIRING_CODE_PATHS.has(url.pathname);
    const isPairPath = BRIDGE_PAIR_PATHS.has(url.pathname);
    const isPairRequest = isPairPath && request.method === 'POST';
    const existingSession = readSession(request, secret);
    const hasValidOwnerSession = existingSession?.userId === ownerId;
    const suppliedBridgeToken = request.headers['x-mezip-local-bridge-token'];
    const hasValidPairedToken = isExtensionOrigin(request.headers.origin)
      && typeof suppliedBridgeToken === 'string'
      && pairingStore.ownerForToken(request.headers.origin as string, suppliedBridgeToken) === ownerId;
    // CORS preflight carries no credentials by design.  It is safe to answer
    // an extension preflight without a session because it never reaches the
    // adapter. The one-time pair request is also allowed to reach its own
    // code-gated handler before a token exists; all other extension routes
    // still require an exact paired origin and token.
    const origin = allowedOrigin(request.headers.origin, origins, hasValidOwnerSession || hasValidPairedToken || request.method === 'OPTIONS' || isPairPath);
    if (origin === null) {
      response.statusCode = 403;
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'This local bridge origin is not allow-listed.', retryable: false } }));
      return;
    }
    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-MEZIP-Local-Bridge-Token, X-MEZIP-Local-Bridge-Pairing-Code');
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      response.end();
      return;
    }
    try {
      if (isPairingCodePath && (request.method === 'GET' || request.method === 'POST')) {
        if (!isTrustedUiOrigin(request.headers.origin, origins)) {
          json(response, 403, { error: { code: 'PAIRING_UI_ORIGIN_REQUIRED', message: 'Pairing codes can only be created by the trusted local ME.zip page.', retryable: false } }, origin);
          return;
        }
        const session = existingSession === null || existingSession.userId !== ownerId
          ? newSession(secret, ownerId)
          : { payload: existingSession, cookie: sessionCookie(existingSession, secret) };
        const issued = pairingStore.issue(ownerId);
        const data = {
          pairingId: issued.pairingId,
          pairingCode: issued.pairingCode,
          // `code` is kept as a response alias for the V13 pairing prototype.
          code: issued.pairingCode,
          expiresAt: new Date(issued.expiresAt).toISOString(),
        };
        json(response, 200, { ...data, data }, origin, session.cookie);
        return;
      }

      if (isPairRequest) {
        const extensionOrigin = request.headers.origin;
        if (!isExtensionOrigin(extensionOrigin)) {
          json(response, 403, { error: { code: 'EXTENSION_ORIGIN_REQUIRED', message: 'Only a browser extension can complete bridge pairing.', retryable: false } }, origin);
          return;
        }
        const requestBody = await readBody(request, DEFAULT_BODY_MAX_BYTES);
        const body = requestBody !== null && typeof requestBody === 'object' && !Array.isArray(requestBody)
          ? requestBody as Record<string, unknown>
          : {};
        const bodyOrigin = typeof body.extensionOrigin === 'string' ? body.extensionOrigin.trim().replace(/\/$/u, '') : extensionOrigin;
        if (bodyOrigin !== extensionOrigin) {
          json(response, 400, { error: { code: 'PAIRING_ORIGIN_MISMATCH', message: 'The extension origin does not match the browser request origin.', retryable: false } }, origin);
          return;
        }
        const headerCode = request.headers['x-mezip-local-bridge-pairing-code'];
        const pairingCode = typeof headerCode === 'string' ? headerCode.trim() : (typeof body.code === 'string' ? body.code.trim() : (typeof body.pairingCode === 'string' ? body.pairingCode.trim() : ''));
        const pairingId = typeof body.pairingId === 'string' ? body.pairingId.trim() : undefined;
        if (pairingCode.length === 0) {
          json(response, 400, { error: { code: 'PAIRING_CODE_REQUIRED', message: 'A one-time bridge pairing code is required.', retryable: false } }, origin);
          return;
        }
        let completed: BridgePairResult;
        try {
          completed = pairingStore.complete({
            ...(pairingId === undefined ? {} : { pairingId }), pairingCode, origin: extensionOrigin as string,
            ...(typeof suppliedBridgeToken === 'string' ? { existingToken: suppliedBridgeToken } : {}),
          });
        } catch (error) {
          json(response, 400, { error: { code: 'PAIRING_FAILED', message: error instanceof Error ? error.message : 'Bridge pairing failed.', retryable: false } }, origin);
          return;
        }
        if (completed.ownerId !== ownerId) {
          json(response, 403, { error: { code: 'PAIRING_OWNER_MISMATCH', message: 'This pairing code belongs to a different local owner.', retryable: false } }, origin);
          return;
        }
        const data = {
          bridgeToken: completed.bridgeToken,
          // Keep the short `token` alias for the V13 prototype response shape.
          token: completed.bridgeToken,
          origin: completed.origin,
          pairingId: completed.pairingId,
          pairedAt: completed.pairedAt,
        };
        const session = newSession(secret, ownerId);
        json(response, 200, { ...data, data }, origin, session.cookie);
        return;
      }

      let session: { readonly payload: SessionPayload; readonly cookie: string };
      if (isExtensionOrigin(request.headers.origin)) {
        const suppliedToken = request.headers['x-mezip-local-bridge-token'];
        const tokenValue = typeof suppliedToken === 'string' ? suppliedToken : '';
        const tokenOwnerId = pairingStore.ownerForToken(request.headers.origin as string, tokenValue);
        const legacyTokenAllowed = tokenOwnerId === null && origins.has(request.headers.origin as string) && bridgeToken !== null && bridgeTokenMatches(request, bridgeToken);
        if (tokenOwnerId === null && !legacyTokenAllowed) {
          json(response, 401, { error: { code: 'BRIDGE_PAIRING_REQUIRED', message: 'Pair this Edge extension from the trusted ME.zip page before syncing.', retryable: false } }, origin);
          return;
        }
        session = { payload: { userId: tokenOwnerId ?? ownerId, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1_000 }, cookie: sessionCookie({ userId: tokenOwnerId ?? ownerId, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1_000 }, secret) };
      } else {
        session = existingSession === null || existingSession.userId !== ownerId
          ? newSession(secret, ownerId)
          : { payload: existingSession, cookie: sessionCookie(existingSession, secret) };
      }
      const bodyLimit = request.method === 'PUT' && url.pathname === '/v1/x/local-capture/edge-bookmarks'
        ? EDGE_BOOKMARK_BODY_MAX_BYTES
        : DEFAULT_BODY_MAX_BYTES;
      const result = await adapter.handle({
        method: request.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        principal: { userId: session.payload.userId, sessionId: 'local-capture-session', roles: ['USER'], issuedAt: new Date().toISOString() } satisfies AuthenticatedPrincipal,
        ...(request.method === 'GET' || request.method === 'DELETE' ? {} : { body: await readBody(request, bodyLimit) }),
      });
      json(response, result.status, result.body, origin, session.cookie);
    } catch (error) {
      json(response, 500, { error: { code: 'INTERNAL', message: error instanceof Error ? error.message : 'Local capture server failed.', retryable: true } }, origin);
    }
  });
}

export function startLocalCaptureServer(options: LocalCaptureServerOptions = {}): void {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? Number.parseInt(process.env.MEZIP_X_CAPTURE_PORT ?? '4319', 10);
  createLocalCaptureServer(options).listen(port, host, () => process.stdout.write(`ME.zip X Local Capture listening on http://${host}:${port}\n`));
}

const directEntry = process.argv[1];
if (directEntry !== undefined && directEntry.endsWith('local-capture-server.js')) startLocalCaptureServer();
