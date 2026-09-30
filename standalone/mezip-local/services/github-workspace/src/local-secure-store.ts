import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { GitHubAppCredentialVault } from './github-app-provider.js';
import type { GitHubWorkspacePersistence } from './github-workspace.js';
import type { GitHubWorkspaceOwnerState } from './types.js';

interface SealedValue {
  readonly iv: string;
  readonly tag: string;
  readonly ciphertext: string;
}

interface LocalStoreDocument {
  readonly version: 1;
  readonly owners: Readonly<Record<string, SealedValue>>;
  readonly tokens: Readonly<Record<string, SealedValue>>;
}

const emptyState = (): GitHubWorkspaceOwnerState => ({
  connection: null,
  pendingAuthorizations: {},
  repositories: [],
  issues: [],
  pullRequests: [],
  activity: [],
  contributions: null,
  tasks: [],
  snippets: [],
  idempotency: {},
});

const emptyDocument = (): LocalStoreDocument => ({
  version: 1,
  owners: {},
  tokens: {},
});

function encryptionKey(value: string): Buffer {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{43}$/u.test(normalized)) {
    throw new Error('MEZIP_GITHUB_LOCAL_DATA_KEY must be a 32-byte base64url value.');
  }
  const decoded = Buffer.from(normalized, 'base64url');
  if (decoded.byteLength !== 32) {
    throw new Error('MEZIP_GITHUB_LOCAL_DATA_KEY must be a 32-byte base64url value.');
  }
  return decoded;
}

function sealedValue(value: unknown): value is SealedValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Readonly<Record<string, unknown>>;
  return (
    Object.keys(row).length === 3 &&
    typeof row.iv === 'string' &&
    typeof row.tag === 'string' &&
    typeof row.ciphertext === 'string' &&
    /^[A-Za-z0-9_-]+$/u.test(row.iv) &&
    /^[A-Za-z0-9_-]+$/u.test(row.tag) &&
    /^[A-Za-z0-9_-]+$/u.test(row.ciphertext)
  );
}

function parseDocument(value: string): LocalStoreDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Local GitHub Workspace store is not valid JSON.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Local GitHub Workspace store is invalid.');
  }
  const row = parsed as Readonly<Record<string, unknown>>;
  if (
    row.version !== 1 ||
    row.owners === null ||
    typeof row.owners !== 'object' ||
    Array.isArray(row.owners) ||
    row.tokens === null ||
    typeof row.tokens !== 'object' ||
    Array.isArray(row.tokens)
  ) {
    throw new Error('Local GitHub Workspace store has an invalid shape.');
  }
  const owners = row.owners as Readonly<Record<string, unknown>>;
  const tokens = row.tokens as Readonly<Record<string, unknown>>;
  if (
    Object.values(owners).some((item) => !sealedValue(item)) ||
    Object.values(tokens).some((item) => !sealedValue(item))
  ) {
    throw new Error('Local GitHub Workspace encrypted data is invalid.');
  }
  return structuredClone(parsed) as LocalStoreDocument;
}

function parseOwnerState(value: string): GitHubWorkspaceOwnerState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Local GitHub Workspace owner state is invalid.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Local GitHub Workspace owner state is invalid.');
  }
  const row = parsed as Readonly<Record<string, unknown>>;
  const required = [
    'connection',
    'pendingAuthorizations',
    'repositories',
    'issues',
    'pullRequests',
    'activity',
    'contributions',
    'tasks',
    'snippets',
    'idempotency',
  ];
  if (
    Object.keys(row).some((key) => !required.includes(key)) ||
    required.some((key) => !(key in row))
  ) {
    throw new Error('Local GitHub Workspace owner state has an invalid shape.');
  }
  return structuredClone(parsed) as GitHubWorkspaceOwnerState;
}

/**
 * Local-development-only encrypted persistence and token vault. The encryption
 * key must come from the process environment and the file lives outside Git.
 * This is durable for local restarts but is intentionally not production-safe.
 */
export class EncryptedLocalGitHubWorkspaceStore
  implements GitHubWorkspacePersistence, GitHubAppCredentialVault
{
  public readonly durable = true;
  public readonly productionSafe = false;
  private readonly filePath: string;
  private readonly key: Buffer;
  private queue: Promise<void> = Promise.resolve();

  public constructor(options: { readonly filePath: string; readonly key: string }) {
    this.filePath = resolve(options.filePath);
    this.key = encryptionKey(options.key);
  }

  public async readOwner(ownerId: string): Promise<GitHubWorkspaceOwnerState> {
    return this.locked(async () => {
      const document = await this.readDocument();
      const encrypted = document.owners[ownerId];
      if (encrypted === undefined) return emptyState();
      return parseOwnerState(this.open(encrypted, `owner:${ownerId}`));
    });
  }

  public async writeOwner(
    ownerId: string,
    state: GitHubWorkspaceOwnerState,
  ): Promise<void> {
    await this.locked(async () => {
      const document = await this.readDocument();
      await this.writeDocument({
        ...document,
        owners: {
          ...document.owners,
          [ownerId]: this.seal(JSON.stringify(state), `owner:${ownerId}`),
        },
      });
    });
  }

  public async put(input: {
    readonly ownerId: string;
    readonly connectionId: string;
    readonly accessToken: string;
  }): Promise<void> {
    if (input.accessToken.length === 0 || input.accessToken.length > 20_000) {
      throw new Error('GitHub token is invalid.');
    }
    const identity = `${input.ownerId}:${input.connectionId}`;
    await this.locked(async () => {
      const document = await this.readDocument();
      await this.writeDocument({
        ...document,
        tokens: {
          ...document.tokens,
          [identity]: this.seal(input.accessToken, `token:${identity}`),
        },
      });
    });
  }

  public async get(input: {
    readonly ownerId: string;
    readonly connectionId: string;
  }): Promise<string | null> {
    const identity = `${input.ownerId}:${input.connectionId}`;
    return this.locked(async () => {
      const document = await this.readDocument();
      const encrypted = document.tokens[identity];
      return encrypted === undefined ? null : this.open(encrypted, `token:${identity}`);
    });
  }

  public async remove(input: {
    readonly ownerId: string;
    readonly connectionId: string;
  }): Promise<void> {
    const identity = `${input.ownerId}:${input.connectionId}`;
    await this.locked(async () => {
      const document = await this.readDocument();
      if (!(identity in document.tokens)) return;
      const tokens = { ...document.tokens };
      delete tokens[identity];
      await this.writeDocument({ ...document, tokens });
    });
  }

  /**
   * Local development is a single-user loopback bridge. Older builds keyed
   * the encrypted owner state to a random browser session, so a new session
   * appeared disconnected even though the GitHub installation was still
   * stored. Re-home the one existing connected owner to the stable local
   * owner without exposing or rewriting credentials outside this store.
   */
  public async migrateConnectedOwner(targetOwnerId: string): Promise<boolean> {
    const target = targetOwnerId.trim();
    if (target.length === 0) throw new Error('Stable GitHub owner ID is required.');
    return this.locked(async () => {
      const document = await this.readDocument();
      const encryptedTarget = document.owners[target];
      const targetState =
        encryptedTarget === undefined
          ? null
          : parseOwnerState(this.open(encryptedTarget, `owner:${target}`));
      if (targetState?.connection?.status === 'CONNECTED') return false;
      for (const [ownerId, encryptedOwner] of Object.entries(document.owners)) {
        if (ownerId === target) continue;
        const state = parseOwnerState(this.open(encryptedOwner, `owner:${ownerId}`));
        if (state.connection?.status !== 'CONNECTED') continue;
        const mergedState: GitHubWorkspaceOwnerState = targetState === null ? state : {
          ...state,
          repositories: state.repositories.length > 0 ? state.repositories : targetState.repositories,
          issues: state.issues.length > 0 ? state.issues : targetState.issues,
          pullRequests: state.pullRequests.length > 0 ? state.pullRequests : targetState.pullRequests,
          activity: state.activity.length > 0 ? state.activity : targetState.activity,
          contributions: state.contributions ?? targetState.contributions,
          tasks: [...state.tasks, ...targetState.tasks.filter((item) => !state.tasks.some((existing) => existing.id === item.id))],
          snippets: [...state.snippets, ...targetState.snippets.filter((item) => !state.snippets.some((existing) => existing.id === item.id))],
          idempotency: { ...targetState.idempotency, ...state.idempotency },
        };
        const owners = { ...document.owners, [target]: this.seal(JSON.stringify(mergedState), `owner:${target}`) };
        const tokens = { ...document.tokens };
        if (state.connection.id !== undefined) {
          const oldIdentity = `${ownerId}:${state.connection.id}`;
          const oldToken = document.tokens[oldIdentity];
          if (oldToken !== undefined) {
            const accessToken = this.open(oldToken, `token:${oldIdentity}`);
            const newIdentity = `${target}:${state.connection.id}`;
            tokens[newIdentity] = this.seal(accessToken, `token:${newIdentity}`);
            delete tokens[oldIdentity];
          }
        }
        delete owners[ownerId];
        await this.writeDocument({ ...document, owners, tokens });
        return true;
      }
      return false;
    });
  }

  private async locked<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolveQueue) => {
      release = resolveQueue;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async readDocument(): Promise<LocalStoreDocument> {
    try {
      return parseDocument(await readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return emptyDocument();
      }
      throw error;
    }
  }

  private async writeDocument(document: LocalStoreDocument): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(document), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  private seal(plaintext: string, aad: string): SealedValue {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return {
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
    };
  }

  private open(value: SealedValue, aad: string): string {
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(value.iv, 'base64url'),
      );
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(value.ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('Local GitHub Workspace encrypted data could not be opened.');
    }
  }
}
