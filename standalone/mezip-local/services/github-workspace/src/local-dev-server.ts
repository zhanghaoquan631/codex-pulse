import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import {
  GitHubWorkspaceApiAdapter,
  type GitHubWorkspaceApiRequest,
  type GitHubWorkspaceApiResponse,
} from './api.js';
import { GitHubAppProvider } from './github-app-provider.js';
import { GitHubWorkspaceError, GitHubWorkspaceService } from './github-workspace.js';
import { EncryptedLocalGitHubWorkspaceStore } from './local-secure-store.js';

const cookieName = 'mezip_github_dev_session';
const maximumBodyBytes = 1_000_000;
const sessionLifetimeSeconds = 30 * 24 * 60 * 60;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

function parseLocalEnvironmentFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/u)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u.exec(line);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2];
    if (key === undefined || rawValue === undefined) continue;
    const value =
      rawValue.length >= 2 &&
      ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'")))
        ? rawValue.slice(1, -1)
        : rawValue;
    values[key] = value;
  }
  return values;
}

function withLocalEnvironment(environment: NodeJS.ProcessEnv): ServerEnvironment {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env.development.local'),
    resolve(repositoryRoot, '.env.local'),
    resolve(repositoryRoot, '.env.development.local'),
  ];
  const localFile = candidates.find((candidate) => existsSync(candidate));
  if (localFile === undefined) return environment;

  const fileValues = parseLocalEnvironmentFile(readFileSync(localFile, 'utf8'));
  const merged: Record<string, string | undefined> = { ...environment };
  for (const [key, value] of Object.entries(fileValues)) {
    if (merged[key] === undefined) merged[key] = value;
  }
  return merged;
}

export interface LocalGitHubWorkspaceServerOptions {
  readonly environment?: ServerEnvironment;
  readonly host?: string;
  readonly port?: number;
}

interface LocalServerConfiguration {
  readonly publicAppUrl: URL;
  readonly sessionSecret: Buffer;
  readonly stableOwnerId: string;
  readonly store: EncryptedLocalGitHubWorkspaceStore;
  readonly adapter: GitHubWorkspaceApiAdapter;
}

interface SessionPayload {
  readonly userId: string;
  readonly sessionId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

function required(value: string | undefined, name: string, max = 100_000): string {
  const normalized = value?.trim() ?? '';
  if (normalized.length === 0 || normalized.length > max) {
    throw new GitHubWorkspaceError(
      'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
      `${name} is not configured.`,
    );
  }
  return normalized;
}

function secret(value: string | undefined, name: string): Buffer {
  const encoded = required(value, name, 200);
  if (!/^[A-Za-z0-9_-]{43}$/u.test(encoded)) {
    throw new GitHubWorkspaceError(
      'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
      `${name} must be a 32-byte base64url value.`,
    );
  }
  const decoded = Buffer.from(encoded, 'base64url');
  if (decoded.byteLength !== 32) {
    throw new GitHubWorkspaceError(
      'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
      `${name} must be a 32-byte base64url value.`,
    );
  }
  return decoded;
}

function publicAppUrl(value: string | undefined): URL {
  let parsed: URL;
  try {
    parsed = new URL(required(value, 'PUBLIC_APP_URL', 500));
  } catch (error) {
    if (error instanceof GitHubWorkspaceError) throw error;
    throw new GitHubWorkspaceError(
      'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
      'PUBLIC_APP_URL is invalid.',
    );
  }
  if (
    parsed.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.pathname !== '/' ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new GitHubWorkspaceError(
      'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
      'The local GitHub bridge requires an exact loopback PUBLIC_APP_URL.',
    );
  }
  return parsed;
}

function privateKey(environment: ServerEnvironment): string {
  const path = environment.GITHUB_PRIVATE_KEY_PATH?.trim();
  if (path !== undefined && path.length > 0) {
    if (path.length > 2_000) {
      throw new GitHubWorkspaceError(
        'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
        'GITHUB_PRIVATE_KEY_PATH is invalid.',
      );
    }
    try {
      return required(readFileSync(resolve(path), 'utf8'), 'GITHUB_PRIVATE_KEY');
    } catch (error) {
      if (error instanceof GitHubWorkspaceError) throw error;
      throw new GitHubWorkspaceError(
        'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
        'GITHUB_PRIVATE_KEY_PATH could not be read.',
      );
    }
  }
  return required(environment.GITHUB_PRIVATE_KEY, 'GITHUB_PRIVATE_KEY');
}

function localStorePath(environment: ServerEnvironment): string {
  const configured = environment.MEZIP_GITHUB_LOCAL_DATA_FILE?.trim();
  if (configured !== undefined && configured.length > 0) return resolve(configured);
  const root = environment.LOCALAPPDATA?.trim() || tmpdir();
  return join(root, 'ME.zip', 'github-workspace.v1.enc.json');
}

function configure(environment: ServerEnvironment): LocalServerConfiguration {
  const appUrl = publicAppUrl(environment.PUBLIC_APP_URL);
  const store = new EncryptedLocalGitHubWorkspaceStore({
    filePath: localStorePath(environment),
    key: required(
      environment.MEZIP_GITHUB_LOCAL_DATA_KEY,
      'MEZIP_GITHUB_LOCAL_DATA_KEY',
    ),
  });
  const provider = new GitHubAppProvider({
    appId: required(environment.GITHUB_APP_ID, 'GITHUB_APP_ID', 100),
    clientId: required(environment.GITHUB_CLIENT_ID, 'GITHUB_CLIENT_ID', 200),
    clientSecret: required(
      environment.GITHUB_CLIENT_SECRET,
      'GITHUB_CLIENT_SECRET',
      2_000,
    ),
    privateKey: privateKey(environment),
    webhookSecret: required(
      environment.GITHUB_WEBHOOK_SECRET,
      'GITHUB_WEBHOOK_SECRET',
      2_000,
    ),
    callbackUrl: new URL('/api/integrations/github/callback', appUrl).toString(),
    credentialVault: store,
  });
  const sessionSecret = secret(
    environment.MEZIP_GITHUB_DEV_SESSION_SECRET,
    'MEZIP_GITHUB_DEV_SESSION_SECRET',
  );
  return {
    publicAppUrl: appUrl,
    sessionSecret,
    stableOwnerId: stableOwnerId(sessionSecret),
    store,
    adapter: new GitHubWorkspaceApiAdapter(
      new GitHubWorkspaceService({
        provider,
        persistence: store,
        deploymentMode: 'LOCAL',
      }),
    ),
  };
}

function stableOwnerId(signingKey: Buffer): string {
  return `local-github-owner:${createHmac('sha256', signingKey)
    .update('mezip-github-stable-owner-v1')
    .digest('hex')
    .slice(0, 32)}`;
}

function encodeSession(payload: SessionPayload, signingKey: Buffer): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', signingKey).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function decodeSession(value: string, signingKey: Buffer): SessionPayload | null {
  const [body, signature, extra] = value.split('.');
  if (body === undefined || signature === undefined || extra !== undefined) return null;
  const expected = createHmac('sha256', signingKey).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
      return null;
    const row = parsed as Readonly<Record<string, unknown>>;
    if (
      typeof row.userId !== 'string' ||
      typeof row.sessionId !== 'string' ||
      typeof row.issuedAt !== 'string' ||
      typeof row.expiresAt !== 'string' ||
      !/^local-github-owner:[a-f0-9]{32}$/u.test(row.userId) ||
      !/^[0-9a-f-]{36}$/u.test(row.sessionId) ||
      !Number.isFinite(Date.parse(row.issuedAt)) ||
      !Number.isFinite(Date.parse(row.expiresAt)) ||
      Date.parse(row.expiresAt) <= Date.now()
    ) {
      return null;
    }
    return {
      userId: row.userId,
      sessionId: row.sessionId,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
    };
  } catch {
    return null;
  }
}

function cookie(request: IncomingMessage, name: string): string | null {
  const raw = request.headers.cookie ?? '';
  for (const item of raw.split(';')) {
    const [key, ...value] = item.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

function createSession(signingKey: Buffer, ownerId = stableOwnerId(signingKey)): {
  readonly principal: AuthenticatedPrincipal;
  readonly cookie: string;
} {
  const sessionId = randomUUID();
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1_000).toISOString();
  const userId = ownerId;
  const payload = { userId, sessionId, issuedAt, expiresAt };
  return {
    principal: { userId, sessionId, issuedAt, roles: ['USER'] },
    cookie: `${cookieName}=${encodeSession(payload, signingKey)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetimeSeconds}`,
  };
}

function readPrincipal(
  request: IncomingMessage,
  signingKey: Buffer,
): AuthenticatedPrincipal | null {
  const value = cookie(request, cookieName);
  if (value === null) return null;
  const session = decodeSession(value, signingKey);
  return session === null
    ? null
    : {
        userId: session.userId,
        sessionId: session.sessionId,
        issuedAt: session.issuedAt,
        roles: ['USER'],
      };
}

async function body(request: IncomingMessage): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'DELETE') return undefined;
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.byteLength;
    if (length > maximumBodyBytes) {
      throw new GitHubWorkspaceError('VALIDATION', 'Request body is too large.');
    }
    chunks.push(buffer);
  }
  if (length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new GitHubWorkspaceError('VALIDATION', 'Request body must be valid JSON.');
  }
}

function allowedRequest(
  request: IncomingMessage,
  appUrl: URL,
  host: string,
  port: number,
): boolean {
  const actualPort = request.socket.localPort ?? port;
  const allowedHosts = new Set([
    `${host}:${port}`,
    `${host}:${actualPort}`,
    `127.0.0.1:${port}`,
    `127.0.0.1:${actualPort}`,
    `localhost:${port}`,
    `localhost:${actualPort}`,
    `127.0.0.1:${appUrl.port}`,
    `localhost:${appUrl.port}`,
    appUrl.host,
  ]);
  if (!allowedHosts.has(request.headers.host ?? '')) return false;
  const origin = request.headers.origin;
  if (origin === undefined) return true;
  const allowedOrigins = new Set([
    appUrl.origin,
    `http://127.0.0.1:${appUrl.port}`,
    `http://localhost:${appUrl.port}`,
  ]);
  return allowedOrigins.has(origin);
}

function query(url: URL): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries([...url.searchParams].map(([key, value]) => [key, value]));
}

function headerMap(
  headers: IncomingMessage['headers'],
): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key.toLowerCase(),
      Array.isArray(value) ? value[0] : value,
    ]),
  );
}

function writeResponse(
  response: ServerResponse,
  result: GitHubWorkspaceApiResponse,
  sessionCookie?: string,
): void {
  response.statusCode = result.status;
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cache-Control', result.headers?.['Cache-Control'] ?? 'no-store');
  for (const [name, value] of Object.entries(result.headers ?? {})) {
    response.setHeader(name, value);
  }
  if (sessionCookie !== undefined) response.setHeader('Set-Cookie', sessionCookie);
  if (result.body === null || result.status === 204 || result.status === 302) {
    response.end();
    return;
  }
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(result.body));
}

function unavailable(response: ServerResponse, error: unknown): void {
  const known =
    error instanceof GitHubWorkspaceError
      ? error
      : new GitHubWorkspaceError(
          'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
          'The local GitHub bridge is not configured.',
        );
  writeResponse(response, {
    status: 503,
    body: {
      error: {
        code: 'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
        message: known.message,
        retryable: false,
      },
    },
  });
}

export function createLocalGitHubWorkspaceServer(
  options: LocalGitHubWorkspaceServerOptions = {},
) {
  const environment =
    options.environment === undefined ? withLocalEnvironment(process.env) : options.environment;
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4317;
  let configuration: LocalServerConfiguration | null = null;
  let configurationError: unknown;
  try {
    configuration = configure(environment);
  } catch (error) {
    configurationError = error;
  }

  return createServer(async (request, response) => {
    try {
      if (configuration === null) {
        unavailable(response, configurationError);
        return;
      }
      if (!allowedRequest(request, configuration.publicAppUrl, host, port)) {
        writeResponse(response, {
          status: 403,
          body: {
            error: { code: 'FORBIDDEN', message: 'Request origin is not allowed.' },
          },
        });
        return;
      }
      const requestUrl = new URL(request.url ?? '/', configuration.publicAppUrl);
      const method = request.method;
      if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method ?? '')) {
        writeResponse(response, {
          status: 405,
          body: { error: { code: 'VALIDATION', message: 'Method is not allowed.' } },
        });
        return;
      }
      let principal = readPrincipal(request, configuration.sessionSecret);
      let sessionCookie: string | undefined;
      if (
        method === 'GET' &&
        (requestUrl.pathname === '/api/integrations/github/connect' ||
          requestUrl.pathname === '/v1/github-workspace/connection')
      ) {
        // A loopback bridge is a single local owner. Older builds keyed the
        // durable encrypted state to a random browser session, which caused
        // an already-installed App to look disconnected after a reload or
        // host switch. Re-home the one existing connected owner before
        // serving the canonical local owner. No token ever leaves the store.
        await configuration.store.migrateConnectedOwner(configuration.stableOwnerId);
        if (principal === null || principal.userId !== configuration.stableOwnerId) {
          const session = createSession(
            configuration.sessionSecret,
            configuration.stableOwnerId,
          );
          principal = session.principal;
          sessionCookie = session.cookie;
        }
      }
      const apiRequest: GitHubWorkspaceApiRequest = {
        method: method as GitHubWorkspaceApiRequest['method'],
        path: requestUrl.pathname,
        principal,
        query: query(requestUrl),
        headers: headerMap(request.headers),
        body: await body(request),
      };
      writeResponse(
        response,
        await configuration.adapter.handle(apiRequest),
        sessionCookie,
      );
    } catch (error) {
      const known =
        error instanceof GitHubWorkspaceError
          ? error
          : new GitHubWorkspaceError(
              'GITHUB_UNAVAILABLE',
              'GitHub Workspace request failed.',
              true,
            );
      writeResponse(response, {
        status: known.code === 'VALIDATION' ? 400 : 502,
        body: {
          error: {
            code: known.code,
            message: known.message,
            retryable: known.retryable,
          },
        },
      });
    }
  });
}

export function startLocalGitHubWorkspaceServer(
  options: LocalGitHubWorkspaceServerOptions = {},
): void {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4317;
  createLocalGitHubWorkspaceServer(options).listen(port, host, () => {
    process.stdout.write(
      `ME.zip GitHub Workspace local bridge listening on http://${host}:${port}\n`,
    );
  });
}

const directEntry = process.argv[1];
if (
  directEntry !== undefined &&
  resolve(directEntry) === resolve(fileURLToPath(import.meta.url))
) {
  startLocalGitHubWorkspaceServer();
}
