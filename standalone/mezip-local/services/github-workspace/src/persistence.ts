import type { GitHubWorkspacePersistence } from './github-workspace.js';
import type { GitHubWorkspaceOwnerState } from './types.js';

export interface GitHubWorkspaceSqlResult<
  Row extends Readonly<Record<string, unknown>>,
> {
  readonly rows: readonly Row[];
  readonly rowCount?: number;
}

export interface GitHubWorkspaceSqlClient {
  query<Row extends Readonly<Record<string, unknown>>>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<GitHubWorkspaceSqlResult<Row>>;
}

export interface GitHubWorkspaceCiphertext {
  readonly ciphertext: Uint8Array;
  readonly keyReference: string;
  readonly keyVersion: number;
}

/** Production implementations should wrap a reviewed KMS or secrets manager. */
export interface GitHubWorkspaceStateCipher {
  readonly productionSafe: boolean;
  encrypt(input: {
    readonly plaintext: string;
    readonly aad: string;
  }): Promise<GitHubWorkspaceCiphertext>;
  decrypt(input: {
    readonly ciphertext: Uint8Array;
    readonly keyReference: string;
    readonly keyVersion: number;
    readonly aad: string;
  }): Promise<string>;
}

interface SnapshotRow extends Readonly<Record<string, unknown>> {
  readonly state_ciphertext: Uint8Array;
  readonly key_reference: string;
  readonly key_version: number;
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

function ownerId(value: string): string {
  const normalized = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      normalized,
    )
  ) {
    throw new Error('GitHub Workspace durable owner ID must be a UUID.');
  }
  return normalized;
}

function parseState(value: string): GitHubWorkspaceOwnerState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('GitHub Workspace durable state could not be decoded.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('GitHub Workspace durable state is invalid.');
  }
  const row = parsed as Readonly<Record<string, unknown>>;
  const exactKeys = [
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
    Object.keys(row).some((key) => !exactKeys.includes(key)) ||
    exactKeys.some((key) => !(key in row))
  ) {
    throw new Error('GitHub Workspace durable state shape is invalid.');
  }
  for (const key of [
    'repositories',
    'issues',
    'pullRequests',
    'activity',
    'tasks',
    'snippets',
  ]) {
    if (!Array.isArray(row[key]))
      throw new Error('GitHub Workspace durable collection is invalid.');
  }
  if (
    row.pendingAuthorizations === null ||
    typeof row.pendingAuthorizations !== 'object' ||
    Array.isArray(row.pendingAuthorizations) ||
    row.idempotency === null ||
    typeof row.idempotency !== 'object' ||
    Array.isArray(row.idempotency)
  ) {
    throw new Error('GitHub Workspace durable metadata is invalid.');
  }
  return structuredClone(row) as unknown as GitHubWorkspaceOwnerState;
}

/**
 * Encrypted owner aggregate used as the authoritative restart/multi-instance
 * state boundary. Normalized tables in migration 022 remain query/audit
 * projections and never contain OAuth credentials or raw snippet text.
 */
export class PostgresGitHubWorkspacePersistence implements GitHubWorkspacePersistence {
  public readonly durable = true;

  public constructor(
    private readonly client: GitHubWorkspaceSqlClient,
    private readonly cipher: GitHubWorkspaceStateCipher,
  ) {
    if (!cipher.productionSafe) {
      throw new Error(
        'GitHub Workspace durable state requires a production-safe cipher.',
      );
    }
  }

  public async readOwner(rawOwnerId: string): Promise<GitHubWorkspaceOwnerState> {
    const owner = ownerId(rawOwnerId);
    const result = await this.client.query<SnapshotRow>(
      `SELECT state_ciphertext, key_reference, key_version
       FROM github_workspace_owner_snapshots
       WHERE owner_user_id = $1`,
      [owner],
    );
    const row = result.rows[0];
    if (row === undefined) return emptyState();
    if (
      !(row.state_ciphertext instanceof Uint8Array) ||
      typeof row.key_reference !== 'string' ||
      !Number.isInteger(row.key_version)
    ) {
      throw new Error('GitHub Workspace durable state row is invalid.');
    }
    const plaintext = await this.cipher.decrypt({
      ciphertext: row.state_ciphertext,
      keyReference: row.key_reference,
      keyVersion: row.key_version,
      aad: `github-workspace-owner:${owner}`,
    });
    return parseState(plaintext);
  }

  public async writeOwner(
    rawOwnerId: string,
    state: GitHubWorkspaceOwnerState,
  ): Promise<void> {
    const owner = ownerId(rawOwnerId);
    const encrypted = await this.cipher.encrypt({
      plaintext: JSON.stringify(state),
      aad: `github-workspace-owner:${owner}`,
    });
    if (
      encrypted.ciphertext.byteLength === 0 ||
      !/^(?:vault|kms|secret):\/\//u.test(encrypted.keyReference) ||
      !Number.isInteger(encrypted.keyVersion) ||
      encrypted.keyVersion < 1
    ) {
      throw new Error('GitHub Workspace cipher returned invalid metadata.');
    }
    await this.client.query(
      `INSERT INTO github_workspace_owner_snapshots
         (owner_user_id, state_ciphertext, key_reference, key_version, revision, updated_at)
       VALUES ($1, $2, $3, $4, 1, now())
       ON CONFLICT (owner_user_id) DO UPDATE SET
         state_ciphertext = EXCLUDED.state_ciphertext,
         key_reference = EXCLUDED.key_reference,
         key_version = EXCLUDED.key_version,
         revision = github_workspace_owner_snapshots.revision + 1,
         updated_at = now()`,
      [owner, encrypted.ciphertext, encrypted.keyReference, encrypted.keyVersion],
    );
  }
}
