import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { SocialConnectorApiAdapter, type SocialApiResponse } from '@me-zip/social-connectors/api';
import type { SocialPersistence, SocialPersistenceSnapshot } from '@me-zip/social-connectors';
import { createXEnabledSocialConnectorService } from './x-social-composition.js';
import { EncryptedLocalXConnectorStore } from './local-x-secure-store.js';

const cookieName = 'mezip_x_dev_session';
const maximumBodyBytes = 1_000_000;
const sessionLifetimeSeconds = 30 * 24 * 60 * 60;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

interface LocalXServerConfiguration {
  readonly publicAppUrl: URL;
  readonly sessionSecret: Buffer;
  readonly adapter: SocialConnectorApiAdapter;
}

interface SessionPayload {
  readonly userId: string;
  readonly sessionId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface LocalXConnectorServerOptions {
  readonly environment?: ServerEnvironment;
  readonly host?: string;
  readonly port?: number;
}

function parseEnvironmentFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/u)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u.exec(line);
    if (match === null || match[1] === undefined || match[2] === undefined) continue;
    const raw = match[2];
    values[match[1]] = raw.length >= 2 && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
      ? raw.slice(1, -1)
      : raw;
  }
  return values;
}

function withLocalEnvironment(environment: NodeJS.ProcessEnv): ServerEnvironment {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const candidates = [resolve(process.cwd(), '.env.local'), resolve(process.cwd(), '.env.development.local'), resolve(repositoryRoot, '.env.local'), resolve(repositoryRoot, '.env.development.local')];
  const localFile = candidates.find((candidate) => existsSync(candidate));
  if (localFile === undefined) return environment;
  const values = parseEnvironmentFile(readFileSync(localFile, 'utf8'));
  return { ...values, ...environment };
}

function publicAppUrl(value: string | undefined): URL {
  const configured = value?.trim() || 'http://127.0.0.1:5174';
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('PUBLIC_APP_URL is invalid for the local X connector.');
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('PUBLIC_APP_URL must be an exact local application origin.');
  }
  return url;
}

function localDataDirectory(environment: ServerEnvironment): string {
  const configured = environment.MEZIP_X_LOCAL_DATA_DIRECTORY?.trim();
  if (configured !== undefined && configured.length > 0) return resolve(configured);
  return join(environment.LOCALAPPDATA?.trim() || tmpdir(), 'ME.zip', 'x-connector');
}

function persistentSessionSecret(directory: string): Buffer {
  const path = join(directory, 'x-session.key');
  try {
    const existing = readFileSync(path);
    if (existing.byteLength >= 32) return existing;
  } catch {
    // The local key is created below on first startup.
  }
  const created = randomBytes(32);
  mkdirSync(directory, { recursive: true });
  try {
    writeFileSync(path, created, { flag: 'wx' });
    return created;
  } catch {
    const existing = readFileSync(path);
    if (existing.byteLength < 32) throw new Error('The local X session key could not be created.');
    return existing;
  }
}

function localOwnerId(signingKey: Buffer): string {
  return `local-x-owner:${createHmac('sha256', signingKey).update('owner').digest('hex').slice(0, 32)}`;
}

/**
 * The local connector is deliberately single-owner. A browser cookie proves
 * that the request belongs to this local installation, but it must not create
 * a different data owner whenever the browser opens a fresh tab.
 */
class LocalOwnerPersistence implements SocialPersistence {
  public readonly durable = true;

  public constructor(
    private readonly delegate: SocialPersistence,
    private readonly ownerId: string,
  ) {}

  public read(): SocialPersistenceSnapshot | null {
    const snapshot = this.delegate.read();
    return snapshot === null ? null : this.normalize(snapshot);
  }

  public write(snapshot: SocialPersistenceSnapshot): void {
    this.delegate.write(this.normalize(snapshot));
  }

  private normalize(snapshot: SocialPersistenceSnapshot): SocialPersistenceSnapshot {
    const owner = this.ownerId;
    return {
      ...snapshot,
      accounts: snapshot.accounts.map((item) => ({ ...item, ownerId: owner })),
      jobs: snapshot.jobs.map((item) => ({ ...item, ownerId: owner })),
      archives: snapshot.archives.map((item) => ({ ...item, ownerId: owner })),
      collections: snapshot.collections.map((item) => ({ ...item, ownerId: owner })),
      publications: snapshot.publications.map((item) => ({ ...item, ownerId: owner })),
      externalPublications: snapshot.externalPublications.map((item) => ({ ...item, ownerId: owner })),
      // Idempotency keys are owner-scoped in memory and cannot be safely
      // transplanted from an old transient browser session.
      idempotency: [],
      auditEvents: snapshot.auditEvents.map((item) => ({ ...item, ownerId: item.ownerId === null ? null : owner })),
    };
  }
}

function configure(environment: ServerEnvironment): LocalXServerConfiguration {
  const publicUrl = publicAppUrl(environment.PUBLIC_APP_URL);
  const directory = localDataDirectory(environment);
  const sessionSecret = persistentSessionSecret(directory);
  const store = new EncryptedLocalXConnectorStore({
    dataPath: join(directory, 'x-connector.v1.enc.json'),
    keyPath: join(directory, 'x-connector.key'),
  });
  return {
    publicAppUrl: publicUrl,
    sessionSecret,
    adapter: new SocialConnectorApiAdapter(createXEnabledSocialConnectorService({
      clientId: environment.X_CLIENT_ID,
      clientSecret: environment.X_CLIENT_SECRET,
      credentialVault: store,
    }, {
      persistence: new LocalOwnerPersistence(store, localOwnerId(sessionSecret)),
      credentialStore: store,
      deploymentMode: 'LOCAL',
    })),
  };
}

function cookie(request: IncomingMessage, name: string): string | null {
  for (const item of (request.headers.cookie ?? '').split(';')) {
    const [key, ...value] = item.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

function encodeSession(payload: SessionPayload, signingKey: Buffer): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${createHmac('sha256', signingKey).update(body).digest('base64url')}`;
}

function readPrincipal(request: IncomingMessage, signingKey: Buffer): AuthenticatedPrincipal | null {
  const current = cookie(request, cookieName);
  if (current === null) return null;
  const [body, signature, extra] = current.split('.');
  if (body === undefined || signature === undefined || extra !== undefined) return null;
  const expected = createHmac('sha256', signingKey).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Readonly<Record<string, unknown>>;
    if (typeof row.userId !== 'string' || typeof row.sessionId !== 'string' || typeof row.issuedAt !== 'string' || typeof row.expiresAt !== 'string' || Date.parse(row.expiresAt) <= Date.now()) return null;
    return { userId: localOwnerId(signingKey), sessionId: row.sessionId, issuedAt: row.issuedAt, roles: ['USER'] };
  } catch {
    return null;
  }
}

function createSession(signingKey: Buffer): { readonly principal: AuthenticatedPrincipal; readonly cookie: string } {
  const sessionId = randomUUID();
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1_000).toISOString();
  const userId = localOwnerId(signingKey);
  const payload = { userId, sessionId, issuedAt, expiresAt };
  return {
    principal: { userId, sessionId, issuedAt, roles: ['USER'] },
    cookie: `${cookieName}=${encodeSession(payload, signingKey)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetimeSeconds}`,
  };
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'DELETE') return undefined;
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.byteLength;
    if (length > maximumBodyBytes) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  if (length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function query(url: URL): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries([...url.searchParams].map(([key, value]) => [key, value]));
}

function allowedRequest(request: IncomingMessage, appUrl: URL, host: string, port: number): boolean {
  const actualPort = request.socket.localPort ?? port;
  const expectedHosts = new Set([
    `${host}:${port}`,
    `${host}:${actualPort}`,
    `127.0.0.1:${port}`,
    `127.0.0.1:${actualPort}`,
    `localhost:${port}`,
    `localhost:${actualPort}`,
  ]);
  if (!expectedHosts.has(request.headers.host ?? '')) return false;
  return request.headers.origin === undefined || request.headers.origin === appUrl.origin;
}

function writeResponse(response: ServerResponse, result: SocialApiResponse, origin: string, sessionCookie?: string): void {
  response.statusCode = result.status;
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (sessionCookie !== undefined) response.setHeader('Set-Cookie', sessionCookie);
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(result.body));
}

export function createLocalXConnectorServer(options: LocalXConnectorServerOptions = {}) {
  const environment = options.environment === undefined ? withLocalEnvironment(process.env) : options.environment;
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4318;
  const configuration = configure(environment);
  return createServer(async (request, response) => {
    try {
      const origin = configuration.publicAppUrl.origin;
      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Access-Control-Allow-Credentials', 'true');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
        response.setHeader('Vary', 'Origin');
        response.end();
        return;
      }
      if (!allowedRequest(request, configuration.publicAppUrl, host, port)) {
        writeResponse(response, { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Request origin is not allowed.', retryable: false } } }, origin);
        return;
      }
      const method = request.method;
      if (method === undefined || !['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
        writeResponse(response, { status: 405, body: { error: { code: 'VALIDATION', message: 'Method is not allowed.', retryable: false } } }, origin);
        return;
      }
      let principal = readPrincipal(request, configuration.sessionSecret);
      let sessionCookie: string | undefined;
      if (principal === null && method === 'GET' && request.url?.startsWith('/v1/social/providers') === true) {
        const session = createSession(configuration.sessionSecret);
        principal = session.principal;
        sessionCookie = session.cookie;
      }
      const url = new URL(request.url ?? '/', configuration.publicAppUrl);
      const idempotencyKey = typeof request.headers['idempotency-key'] === 'string'
        ? request.headers['idempotency-key']
        : undefined;
      const result = await configuration.adapter.handle({
        method: method as 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
        path: url.pathname,
        query: query(url),
        body: await requestBody(request),
        ...(principal === null ? {} : { principal }),
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      });
      writeResponse(response, result, origin, sessionCookie);
    } catch {
      writeResponse(response, { status: 500, body: { error: { code: 'INTERNAL', message: 'X connector request failed.', retryable: true } } }, configuration.publicAppUrl.origin);
    }
  });
}

export function startLocalXConnectorServer(options: LocalXConnectorServerOptions = {}): void {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4318;
  createLocalXConnectorServer(options).listen(port, host, () => {
    process.stdout.write(`ME.zip X connector local bridge listening on http://${host}:${port}\n`);
  });
}

const directEntry = process.argv[1];
if (directEntry !== undefined && resolve(directEntry) === resolve(fileURLToPath(import.meta.url))) {
  startLocalXConnectorServer();
}
