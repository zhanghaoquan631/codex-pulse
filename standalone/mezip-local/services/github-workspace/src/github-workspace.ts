import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import type {
  DeveloperTaskStatus,
  GitHubBranchSummary,
  GitHubCommitSummary,
  GitHubDeveloperTask,
  GitHubRepositoryContent,
  GitHubSnippetSource,
  GitHubWorkspaceActivity,
  GitHubWorkspaceAuthorizationStart,
  GitHubWorkspaceConnection,
  GitHubWorkspaceErrorCode,
  GitHubWorkspaceIssue,
  GitHubWorkspaceOverview,
  GitHubWorkspaceOwnerState,
  GitHubWorkspacePullRequest,
  GitHubWorkspaceRepository,
  GitHubWorkspaceSnapshot,
  GitHubWorkspaceSnippet,
} from './types.js';

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

const clone = <T>(value: T): T => structuredClone(value);
const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
const nowIso = (): string => new Date().toISOString();

function requiredId(value: string, name: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u.test(normalized)) {
    throw new GitHubWorkspaceError('VALIDATION', `${name} is invalid.`);
  }
  return normalized;
}

function requiredIdempotency(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(normalized)) {
    throw new GitHubWorkspaceError('VALIDATION', 'Idempotency key is invalid.');
  }
  return normalized;
}

function boundedText(
  value: string,
  name: string,
  max: number,
  allowEmpty = false,
): string {
  const normalized = value.trim();
  if ((!allowEmpty && normalized.length === 0) || normalized.length > max) {
    throw new GitHubWorkspaceError('VALIDATION', `${name} is invalid.`);
  }
  return normalized;
}

function repositoryFullName(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/u.test(normalized)) {
    throw new GitHubWorkspaceError('VALIDATION', 'Repository name is invalid.');
  }
  return normalized;
}

function safeGitHubUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new GitHubWorkspaceError(
      'GITHUB_UNAVAILABLE',
      'GitHub returned an invalid URL.',
    );
  }
  if (
    parsed.protocol !== 'https:' ||
    !['github.com', 'www.github.com'].includes(parsed.hostname) ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new GitHubWorkspaceError(
      'GITHUB_UNAVAILABLE',
      'GitHub returned an invalid URL.',
    );
  }
  return parsed.toString();
}

export class GitHubWorkspaceError extends Error {
  public constructor(
    public readonly code: GitHubWorkspaceErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'GitHubWorkspaceError';
  }
}

export interface GitHubWorkspacePersistence {
  readonly durable: boolean;
  readOwner(ownerId: string): Promise<GitHubWorkspaceOwnerState>;
  writeOwner(ownerId: string, state: GitHubWorkspaceOwnerState): Promise<void>;
}

/** Local/test only. Production composition rejects this persistence adapter. */
export class InMemoryGitHubWorkspacePersistence implements GitHubWorkspacePersistence {
  public readonly durable = false;
  private readonly owners = new Map<string, GitHubWorkspaceOwnerState>();

  public async readOwner(ownerId: string): Promise<GitHubWorkspaceOwnerState> {
    return clone(this.owners.get(ownerId) ?? emptyState());
  }

  public async writeOwner(
    ownerId: string,
    state: GitHubWorkspaceOwnerState,
  ): Promise<void> {
    this.owners.set(ownerId, clone(state));
  }
}

export interface GitHubWorkspaceProvider {
  readonly productionSafe: boolean;
  beginAuthorization(input: {
    readonly ownerId: string;
    readonly state: string;
    readonly codeChallenge: string;
  }): Promise<GitHubWorkspaceAuthorizationStart>;
  completeAuthorization(input: {
    readonly ownerId: string;
    readonly state: string;
    readonly code: string;
    readonly codeVerifier: string;
    readonly installationId?: string;
  }): Promise<GitHubWorkspaceConnection>;
  disconnect(input: {
    readonly ownerId: string;
    readonly connectionId: string;
  }): Promise<void>;
  sync(input: {
    readonly ownerId: string;
    readonly connection: GitHubWorkspaceConnection;
  }): Promise<GitHubWorkspaceSnapshot>;
  readRepositoryContent(input: {
    readonly ownerId: string;
    readonly connection: GitHubWorkspaceConnection;
    readonly repositoryFullName: string;
    readonly path: string;
  }): Promise<GitHubRepositoryContent>;
  listCommits(input: {
    readonly ownerId: string;
    readonly connection: GitHubWorkspaceConnection;
    readonly repositoryFullName: string;
    readonly page: number;
  }): Promise<readonly GitHubCommitSummary[]>;
  listBranches(input: {
    readonly ownerId: string;
    readonly connection: GitHubWorkspaceConnection;
    readonly repositoryFullName: string;
  }): Promise<readonly GitHubBranchSummary[]>;
}

export interface GitHubWorkspaceAuditSink {
  append(input: {
    readonly action: string;
    readonly actorUserId: string;
    readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
  }): void;
}

export interface GitHubWorkspaceServiceOptions {
  readonly provider: GitHubWorkspaceProvider;
  readonly persistence: GitHubWorkspacePersistence;
  readonly deploymentMode?: 'LOCAL' | 'TEST' | 'PRODUCTION';
  readonly now?: () => string;
  readonly id?: () => string;
  readonly state?: () => string;
  readonly codeVerifier?: () => string;
  readonly audit?: GitHubWorkspaceAuditSink;
  readonly syncTtlMs?: number;
}

export class GitHubWorkspaceService {
  private readonly now: () => string;
  private readonly id: () => string;
  private readonly state: () => string;
  private readonly codeVerifier: () => string;
  private readonly syncTtlMs: number;
  private readonly locks = new Map<string, Promise<void>>();

  public constructor(private readonly options: GitHubWorkspaceServiceOptions) {
    this.now = options.now ?? nowIso;
    this.id = options.id ?? randomUUID;
    this.state = options.state ?? (() => randomBytes(32).toString('base64url'));
    this.codeVerifier =
      options.codeVerifier ?? (() => randomBytes(48).toString('base64url'));
    this.syncTtlMs = options.syncTtlMs ?? 120_000;
    if (
      options.deploymentMode === 'PRODUCTION' &&
      (!options.persistence.durable || !options.provider.productionSafe)
    ) {
      throw new GitHubWorkspaceError(
        'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
        'Production GitHub Workspace requires durable owner storage and the reviewed GitHub App provider.',
      );
    }
  }

  private async locked<T>(ownerId: string, run: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(ownerId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.locks.set(ownerId, queued);
    await previous;
    try {
      return await run();
    } finally {
      release();
      if (this.locks.get(ownerId) === queued) this.locks.delete(ownerId);
    }
  }

  private owner(principal: AuthenticatedPrincipal): string {
    return requiredId(principal.userId, 'Principal');
  }

  private async connected(ownerId: string): Promise<{
    readonly state: GitHubWorkspaceOwnerState;
    readonly connection: GitHubWorkspaceConnection;
  }> {
    const state = await this.options.persistence.readOwner(ownerId);
    const connection = state.connection;
    if (connection === null || connection.status !== 'CONNECTED') {
      throw new GitHubWorkspaceError(
        'AUTH_REQUIRED',
        'Connect GitHub to use the developer workspace.',
      );
    }
    return { state, connection };
  }

  public async getConnection(
    principal: AuthenticatedPrincipal,
  ): Promise<GitHubWorkspaceConnection | null> {
    const state = await this.options.persistence.readOwner(this.owner(principal));
    return clone(state.connection);
  }

  public async beginConnection(
    principal: AuthenticatedPrincipal,
  ): Promise<GitHubWorkspaceAuthorizationStart> {
    const ownerId = this.owner(principal);
    return this.locked(ownerId, async () => {
      const rawState = this.state();
      if (rawState.length < 32 || rawState.length > 200) {
        throw new GitHubWorkspaceError(
          'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
          'OAuth state generator is invalid.',
        );
      }
      const codeVerifier = this.codeVerifier();
      if (!/^[A-Za-z0-9._~-]{43,128}$/u.test(codeVerifier)) {
        throw new GitHubWorkspaceError(
          'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
          'OAuth PKCE verifier generator is invalid.',
        );
      }
      const codeChallenge = createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
      const handoff = await this.options.provider.beginAuthorization({
        ownerId,
        state: rawState,
        codeChallenge,
      });
      safeGitHubUrl(handoff.authorizationUrl);
      if (
        !Number.isFinite(Date.parse(handoff.expiresAt)) ||
        Date.parse(handoff.expiresAt) <= Date.parse(this.now())
      ) {
        throw new GitHubWorkspaceError(
          'GITHUB_UNAVAILABLE',
          'GitHub returned an invalid authorization handoff.',
        );
      }
      const state = await this.options.persistence.readOwner(ownerId);
      const pending = Object.fromEntries(
        Object.entries(state.pendingAuthorizations).filter(
          ([, value]) => Date.parse(value.expiresAt) > Date.parse(this.now()),
        ),
      );
      pending[sha256(rawState)] = {
        expiresAt: handoff.expiresAt,
        codeVerifier,
      };
      await this.options.persistence.writeOwner(ownerId, {
        ...state,
        pendingAuthorizations: pending,
      });
      this.options.audit?.append({
        action: 'GITHUB_CONNECTION_STARTED',
        actorUserId: ownerId,
        metadata: {},
      });
      return clone(handoff);
    });
  }

  public async completeConnection(
    principal: AuthenticatedPrincipal,
    input: {
      readonly state: string;
      readonly code: string;
      readonly installationId?: string;
    },
  ): Promise<GitHubWorkspaceConnection> {
    const ownerId = this.owner(principal);
    const oauthState = boundedText(input.state, 'OAuth state', 200);
    const code = boundedText(input.code, 'OAuth code', 1_000);
    const installationId =
      input.installationId === undefined
        ? undefined
        : requiredId(input.installationId, 'Installation ID');
    return this.locked(ownerId, async () => {
      const state = await this.options.persistence.readOwner(ownerId);
      const stateHash = sha256(oauthState);
      const pending = state.pendingAuthorizations[stateHash];
      if (
        pending === undefined ||
        Date.parse(pending.expiresAt) <= Date.parse(this.now())
      ) {
        throw new GitHubWorkspaceError(
          'NOT_FOUND',
          'GitHub authorization request was not found or expired.',
        );
      }
      const completed = await this.options.provider.completeAuthorization({
        ownerId,
        state: oauthState,
        code,
        codeVerifier: pending.codeVerifier,
        ...(installationId === undefined ? {} : { installationId }),
      });
      const connection: GitHubWorkspaceConnection = {
        ...completed,
        status: 'CONNECTED',
        githubLogin: boundedText(completed.githubLogin, 'GitHub login', 120),
        installationId: requiredId(completed.installationId, 'Installation ID'),
        updatedAt: this.now(),
      };
      const pendingAuthorizations = { ...state.pendingAuthorizations };
      delete pendingAuthorizations[stateHash];
      await this.options.persistence.writeOwner(ownerId, {
        ...emptyState(),
        connection,
        pendingAuthorizations,
      });
      this.options.audit?.append({
        action: 'GITHUB_CONNECTED',
        actorUserId: ownerId,
        metadata: {
          connectionId: connection.id,
          installationId: connection.installationId,
        },
      });
      return clone(connection);
    });
  }

  public async disconnect(principal: AuthenticatedPrincipal): Promise<void> {
    const ownerId = this.owner(principal);
    await this.locked(ownerId, async () => {
      const state = await this.options.persistence.readOwner(ownerId);
      if (state.connection === null) return;
      await this.options.provider.disconnect({
        ownerId,
        connectionId: state.connection.id,
      });
      await this.options.persistence.writeOwner(ownerId, emptyState());
      this.options.audit?.append({
        action: 'GITHUB_DISCONNECTED',
        actorUserId: ownerId,
        metadata: { connectionId: state.connection.id },
      });
    });
  }

  public async sync(
    principal: AuthenticatedPrincipal,
    idempotencyKey: string,
  ): Promise<GitHubWorkspaceOverview> {
    const ownerId = this.owner(principal);
    const key = requiredIdempotency(idempotencyKey);
    return this.locked(ownerId, async () => {
      const current = await this.connected(ownerId);
      const receiptKey = `sync:${key}`;
      const fingerprint = sha256(`sync:${current.connection.id}`);
      const receipt = current.state.idempotency[receiptKey];
      if (receipt !== undefined) {
        if (receipt.fingerprint !== fingerprint) {
          throw new GitHubWorkspaceError(
            'CONFLICT',
            'Idempotency key was already used for another operation.',
          );
        }
        return this.overviewFromState(current.state);
      }
      if (
        current.connection.lastSyncedAt !== null &&
        Date.parse(this.now()) - Date.parse(current.connection.lastSyncedAt) <
          this.syncTtlMs
      ) {
        const idempotency = {
          ...current.state.idempotency,
          [receiptKey]: { fingerprint, resourceId: current.connection.id },
        };
        const next = { ...current.state, idempotency };
        await this.options.persistence.writeOwner(ownerId, next);
        return this.overviewFromState(next);
      }
      const syncingConnection = {
        ...current.connection,
        syncStatus: 'SYNCING' as const,
        updatedAt: this.now(),
      };
      await this.options.persistence.writeOwner(ownerId, {
        ...current.state,
        connection: syncingConnection,
      });
      try {
        const snapshot = await this.options.provider.sync({
          ownerId,
          connection: syncingConnection,
        });
        const connectedAt = this.now();
        const connection: GitHubWorkspaceConnection = {
          ...syncingConnection,
          authorizedRepositoryCount: snapshot.repositories.length,
          lastSyncedAt: connectedAt,
          updatedAt: connectedAt,
          syncStatus: snapshot.partial ? 'PARTIAL' : 'SUCCESS',
          rateLimitRemaining: snapshot.rateLimitRemaining,
          rateLimitResetAt: snapshot.rateLimitResetAt,
        };
        const tasks = this.mergeDerivedTasks(
          current.state.tasks,
          snapshot.issues,
          snapshot.pullRequests,
        );
        const snippets =
          snapshot.snippets === undefined
            ? current.state.snippets
            : [
                ...current.state.snippets.filter(
                  (snippet) => snippet.source !== 'REPOSITORY_FILE',
                ),
                ...snapshot.snippets.map((snippet) => ({
                  ...snippet,
                  favorite:
                    current.state.snippets.find(
                      (existing) =>
                        existing.source === 'REPOSITORY_FILE' &&
                        existing.sourceUrl === snippet.sourceUrl,
                    )?.favorite ?? snippet.favorite,
                })),
              ];
        const next: GitHubWorkspaceOwnerState = {
          ...current.state,
          connection,
          repositories: snapshot.repositories,
          issues: snapshot.issues,
          pullRequests: snapshot.pullRequests,
          activity: snapshot.activity,
          contributions: snapshot.contributions,
          tasks,
          snippets,
          idempotency: {
            ...current.state.idempotency,
            [receiptKey]: { fingerprint, resourceId: connection.id },
          },
        };
        await this.options.persistence.writeOwner(ownerId, next);
        this.options.audit?.append({
          action: 'GITHUB_SYNCED',
          actorUserId: ownerId,
          metadata: {
            repositories: snapshot.repositories.length,
            partial: snapshot.partial,
          },
        });
        return this.overviewFromState(next);
      } catch (error) {
        const code = error instanceof GitHubWorkspaceError ? error.code : 'SYNC_FAILED';
        const failedConnection = {
          ...syncingConnection,
          syncStatus:
            code === 'RATE_LIMITED'
              ? ('RATE_LIMITED' as const)
              : code === 'AUTH_REQUIRED'
                ? ('AUTH_REQUIRED' as const)
                : ('ERROR' as const),
          updatedAt: this.now(),
        };
        await this.options.persistence.writeOwner(ownerId, {
          ...current.state,
          connection: failedConnection,
        });
        throw error instanceof GitHubWorkspaceError
          ? error
          : new GitHubWorkspaceError(
              'SYNC_FAILED',
              'GitHub synchronization failed.',
              true,
            );
      }
    });
  }

  public async getOverview(
    principal: AuthenticatedPrincipal,
  ): Promise<GitHubWorkspaceOverview> {
    const { state } = await this.connected(this.owner(principal));
    return this.overviewFromState(state);
  }

  private overviewFromState(state: GitHubWorkspaceOwnerState): GitHubWorkspaceOverview {
    if (state.connection === null) {
      throw new GitHubWorkspaceError(
        'AUTH_REQUIRED',
        'Connect GitHub to use the developer workspace.',
      );
    }
    const languageDistribution: Record<string, number> = {};
    for (const repository of state.repositories) {
      if (repository.language !== null) {
        languageDistribution[repository.language] =
          (languageDistribution[repository.language] ?? 0) + 1;
      }
    }
    const stale =
      state.connection.lastSyncedAt === null ||
      Date.parse(this.now()) - Date.parse(state.connection.lastSyncedAt) > 15 * 60_000;
    return clone({
      connection: state.connection,
      contributions: state.contributions ?? {
        year: new Date(this.now()).getUTCFullYear(),
        total: null,
        currentStreak: null,
        longestStreak: null,
        days: [],
      },
      commitCount: state.contributions?.commitCount ?? null,
      pullRequestCount:
        state.contributions?.pullRequestCount ?? state.pullRequests.length,
      issueCount: state.contributions?.issueCount ?? state.issues.length,
      repositoryCount: state.repositories.length,
      repositories: state.repositories.slice(0, 6),
      recentActivity: state.activity.slice(0, 20),
      languageDistribution,
      pendingTasks: state.tasks.filter((task) => task.status !== 'DONE').slice(0, 12),
      stale,
    });
  }

  public async listRepositories(
    principal: AuthenticatedPrincipal,
    input: {
      readonly query?: string;
      readonly visibility?: 'ALL' | 'PUBLIC' | 'PRIVATE' | 'ARCHIVED' | 'FORKED';
      readonly language?: string;
      readonly sort?: 'UPDATED' | 'NAME' | 'STARS';
      readonly page?: number;
      readonly limit?: number;
    } = {},
  ): Promise<{
    readonly items: readonly GitHubWorkspaceRepository[];
    readonly page: number;
    readonly hasMore: boolean;
  }> {
    const { state } = await this.connected(this.owner(principal));
    const page = Math.max(1, Math.min(10_000, Math.trunc(input.page ?? 1)));
    const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 30)));
    const query = (input.query ?? '').trim().toLowerCase();
    const language = (input.language ?? '').trim().toLowerCase();
    const visibility = input.visibility ?? 'ALL';
    const filtered = state.repositories
      .filter((repository) => {
        if (
          query.length > 0 &&
          !`${repository.fullName} ${repository.description ?? ''}`
            .toLowerCase()
            .includes(query)
        )
          return false;
        if (language.length > 0 && repository.language?.toLowerCase() !== language)
          return false;
        if (visibility === 'PUBLIC' && repository.private) return false;
        if (visibility === 'PRIVATE' && !repository.private) return false;
        if (visibility === 'ARCHIVED' && !repository.archived) return false;
        if (visibility === 'FORKED' && !repository.fork) return false;
        return true;
      })
      .sort((a, b) =>
        input.sort === 'NAME'
          ? a.fullName.localeCompare(b.fullName)
          : input.sort === 'STARS'
            ? b.stars - a.stars
            : b.updatedAt.localeCompare(a.updatedAt),
      );
    const start = (page - 1) * limit;
    return clone({
      items: filtered.slice(start, start + limit),
      page,
      hasMore: start + limit < filtered.length,
    });
  }

  public async getRepository(
    principal: AuthenticatedPrincipal,
    fullName: string,
  ): Promise<GitHubWorkspaceRepository> {
    const { state } = await this.connected(this.owner(principal));
    const normalized = repositoryFullName(fullName).toLowerCase();
    const repository = state.repositories.find(
      (item) => item.fullName.toLowerCase() === normalized,
    );
    if (repository === undefined)
      throw new GitHubWorkspaceError('NOT_FOUND', 'Repository was not found.');
    return clone(repository);
  }

  public async readRepositoryContent(
    principal: AuthenticatedPrincipal,
    fullName: string,
    path: string,
  ): Promise<GitHubRepositoryContent> {
    const ownerId = this.owner(principal);
    const { connection } = await this.connected(ownerId);
    const repository = await this.getRepository(principal, fullName);
    const normalizedPath = path.trim().replace(/^\/+|\/+$/gu, '');
    if (normalizedPath.length > 1_000 || normalizedPath.includes('..')) {
      throw new GitHubWorkspaceError('VALIDATION', 'Repository path is invalid.');
    }
    return clone(
      await this.options.provider.readRepositoryContent({
        ownerId,
        connection,
        repositoryFullName: repository.fullName,
        path: normalizedPath,
      }),
    );
  }

  public async listCommits(
    principal: AuthenticatedPrincipal,
    fullName: string,
    page = 1,
  ): Promise<readonly GitHubCommitSummary[]> {
    const ownerId = this.owner(principal);
    const { connection } = await this.connected(ownerId);
    const repository = await this.getRepository(principal, fullName);
    return clone(
      await this.options.provider.listCommits({
        ownerId,
        connection,
        repositoryFullName: repository.fullName,
        page: Math.max(1, Math.min(1000, Math.trunc(page))),
      }),
    );
  }

  public async listBranches(
    principal: AuthenticatedPrincipal,
    fullName: string,
  ): Promise<readonly GitHubBranchSummary[]> {
    const ownerId = this.owner(principal);
    const { connection } = await this.connected(ownerId);
    const repository = await this.getRepository(principal, fullName);
    return clone(
      await this.options.provider.listBranches({
        ownerId,
        connection,
        repositoryFullName: repository.fullName,
      }),
    );
  }

  public async listIssues(
    principal: AuthenticatedPrincipal,
    input: {
      readonly state?: 'OPEN' | 'CLOSED' | 'ALL';
      readonly repository?: string;
      readonly query?: string;
    } = {},
  ): Promise<readonly GitHubWorkspaceIssue[]> {
    const { state } = await this.connected(this.owner(principal));
    const query = (input.query ?? '').trim().toLowerCase();
    return clone(
      state.issues.filter((issue) => {
        if (
          input.state !== undefined &&
          input.state !== 'ALL' &&
          issue.state !== input.state
        )
          return false;
        if (
          input.repository !== undefined &&
          issue.repositoryFullName.toLowerCase() !==
            repositoryFullName(input.repository).toLowerCase()
        )
          return false;
        return (
          query.length === 0 ||
          `${issue.title} ${issue.body ?? ''}`.toLowerCase().includes(query)
        );
      }),
    );
  }

  public async getIssue(
    principal: AuthenticatedPrincipal,
    fullName: string,
    number: number,
  ): Promise<GitHubWorkspaceIssue> {
    const issues = await this.listIssues(principal, {
      state: 'ALL',
      repository: fullName,
    });
    const issue = issues.find((item) => item.number === number);
    if (issue === undefined)
      throw new GitHubWorkspaceError('NOT_FOUND', 'Issue was not found.');
    return clone(issue);
  }

  public async listPullRequests(
    principal: AuthenticatedPrincipal,
    input: {
      readonly state?: 'OPEN' | 'CLOSED' | 'MERGED' | 'ALL';
      readonly repository?: string;
      readonly reviewState?: GitHubWorkspacePullRequest['reviewState'] | 'ALL';
      readonly query?: string;
    } = {},
  ): Promise<readonly GitHubWorkspacePullRequest[]> {
    const { state } = await this.connected(this.owner(principal));
    const query = (input.query ?? '').trim().toLowerCase();
    return clone(
      state.pullRequests.filter((pull) => {
        if (
          input.state !== undefined &&
          input.state !== 'ALL' &&
          pull.state !== input.state
        )
          return false;
        if (
          input.repository !== undefined &&
          pull.repositoryFullName.toLowerCase() !==
            repositoryFullName(input.repository).toLowerCase()
        )
          return false;
        if (
          input.reviewState !== undefined &&
          input.reviewState !== 'ALL' &&
          pull.reviewState !== input.reviewState
        )
          return false;
        return (
          query.length === 0 ||
          `${pull.title} ${pull.repositoryFullName} ${pull.author}`
            .toLowerCase()
            .includes(query)
        );
      }),
    );
  }

  public async getPullRequest(
    principal: AuthenticatedPrincipal,
    fullName: string,
    number: number,
  ): Promise<GitHubWorkspacePullRequest> {
    const pulls = await this.listPullRequests(principal, {
      state: 'ALL',
      repository: fullName,
    });
    const pull = pulls.find((item) => item.number === number);
    if (pull === undefined)
      throw new GitHubWorkspaceError('NOT_FOUND', 'Pull request was not found.');
    return clone(pull);
  }

  public async listTasks(
    principal: AuthenticatedPrincipal,
  ): Promise<readonly GitHubDeveloperTask[]> {
    const { state } = await this.connected(this.owner(principal));
    return clone(state.tasks);
  }

  public async updateTaskStatus(
    principal: AuthenticatedPrincipal,
    input: {
      readonly taskId: string;
      readonly status: DeveloperTaskStatus;
      readonly idempotencyKey: string;
    },
  ): Promise<GitHubDeveloperTask> {
    const ownerId = this.owner(principal);
    const taskId = requiredId(input.taskId, 'Task ID');
    const key = requiredIdempotency(input.idempotencyKey);
    if (!['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'].includes(input.status)) {
      throw new GitHubWorkspaceError('VALIDATION', 'Task status is invalid.');
    }
    return this.locked(ownerId, async () => {
      const state = await this.options.persistence.readOwner(ownerId);
      if (state.connection === null)
        throw new GitHubWorkspaceError('AUTH_REQUIRED', 'Connect GitHub to use tasks.');
      const index = state.tasks.findIndex((task) => task.id === taskId);
      if (index < 0) throw new GitHubWorkspaceError('NOT_FOUND', 'Task was not found.');
      const fingerprint = sha256(`${taskId}:${input.status}`);
      const receiptKey = `task:${key}`;
      const receipt = state.idempotency[receiptKey];
      if (receipt !== undefined && receipt.fingerprint !== fingerprint) {
        throw new GitHubWorkspaceError(
          'CONFLICT',
          'Idempotency key was already used for another task update.',
        );
      }
      if (receipt !== undefined) return clone(state.tasks[index]!);
      const updated = {
        ...state.tasks[index]!,
        status: input.status,
        updatedAt: this.now(),
      };
      const tasks = [...state.tasks];
      tasks[index] = updated;
      await this.options.persistence.writeOwner(ownerId, {
        ...state,
        tasks,
        idempotency: {
          ...state.idempotency,
          [receiptKey]: { fingerprint, resourceId: taskId },
        },
      });
      return clone(updated);
    });
  }

  public async listActivity(
    principal: AuthenticatedPrincipal,
    kind?: string,
  ): Promise<readonly GitHubWorkspaceActivity[]> {
    const { state } = await this.connected(this.owner(principal));
    const normalized = (kind ?? 'ALL').trim().toUpperCase();
    return clone(
      normalized === 'ALL'
        ? state.activity
        : state.activity.filter((item) => item.kind === normalized),
    );
  }

  public async listSnippets(
    principal: AuthenticatedPrincipal,
    input: {
      readonly query?: string;
      readonly language?: string;
      readonly source?: GitHubSnippetSource;
      readonly favorite?: boolean;
    } = {},
  ): Promise<readonly GitHubWorkspaceSnippet[]> {
    const { state } = await this.connected(this.owner(principal));
    const query = (input.query ?? '').trim().toLowerCase();
    const language = (input.language ?? '').trim().toLowerCase();
    return clone(
      state.snippets.filter((snippet) => {
        if (input.source !== undefined && snippet.source !== input.source) return false;
        if (input.favorite !== undefined && snippet.favorite !== input.favorite)
          return false;
        if (language.length > 0 && snippet.language.toLowerCase() !== language)
          return false;
        return (
          query.length === 0 ||
          `${snippet.title} ${snippet.description} ${snippet.tags.join(' ')}`
            .toLowerCase()
            .includes(query)
        );
      }),
    );
  }

  public async createSnippet(
    principal: AuthenticatedPrincipal,
    input: {
      readonly title: string;
      readonly description?: string;
      readonly language: string;
      readonly content: string;
      readonly tags?: readonly string[];
      readonly source?: GitHubSnippetSource;
      readonly sourceUrl?: string;
      readonly idempotencyKey: string;
    },
  ): Promise<GitHubWorkspaceSnippet> {
    const ownerId = this.owner(principal);
    const key = requiredIdempotency(input.idempotencyKey);
    const title = boundedText(input.title, 'Snippet title', 160);
    const description = boundedText(
      input.description ?? '',
      'Snippet description',
      1_000,
      true,
    );
    const language = boundedText(input.language, 'Snippet language', 60);
    const content = boundedText(input.content, 'Snippet content', 500_000);
    const tags = [
      ...new Set(
        (input.tags ?? [])
          .map((tag) => boundedText(tag, 'Snippet tag', 40))
          .slice(0, 20),
      ),
    ];
    const source = input.source ?? 'MANUAL';
    if (!['MEZIP', 'GITHUB_GIST', 'REPOSITORY_FILE', 'MANUAL'].includes(source)) {
      throw new GitHubWorkspaceError('VALIDATION', 'Snippet source is invalid.');
    }
    const sourceUrl =
      input.sourceUrl === undefined ? null : safeGitHubUrl(input.sourceUrl);
    const fingerprint = sha256(
      JSON.stringify({
        title,
        description,
        language,
        content,
        tags,
        source,
        sourceUrl,
      }),
    );
    return this.locked(ownerId, async () => {
      const state = await this.options.persistence.readOwner(ownerId);
      if (state.connection === null)
        throw new GitHubWorkspaceError(
          'AUTH_REQUIRED',
          'Connect GitHub to use snippets.',
        );
      const receiptKey = `snippet:${key}`;
      const receipt = state.idempotency[receiptKey];
      if (receipt !== undefined) {
        if (receipt.fingerprint !== fingerprint)
          throw new GitHubWorkspaceError(
            'CONFLICT',
            'Idempotency key was already used for another snippet.',
          );
        const existing = state.snippets.find(
          (snippet) => snippet.id === receipt.resourceId,
        );
        if (existing === undefined)
          throw new GitHubWorkspaceError(
            'CONFLICT',
            'Snippet idempotency receipt is inconsistent.',
          );
        return clone(existing);
      }
      const createdAt = this.now();
      const snippet: GitHubWorkspaceSnippet = {
        id: this.id(),
        source,
        sourceUrl,
        title,
        description,
        language,
        content,
        tags,
        favorite: false,
        createdAt,
        updatedAt: createdAt,
      };
      await this.options.persistence.writeOwner(ownerId, {
        ...state,
        snippets: [...state.snippets, snippet],
        idempotency: {
          ...state.idempotency,
          [receiptKey]: { fingerprint, resourceId: snippet.id },
        },
      });
      return clone(snippet);
    });
  }

  public async setSnippetFavorite(
    principal: AuthenticatedPrincipal,
    snippetId: string,
    favorite: boolean,
  ): Promise<GitHubWorkspaceSnippet> {
    const ownerId = this.owner(principal);
    const id = requiredId(snippetId, 'Snippet ID');
    return this.locked(ownerId, async () => {
      const state = await this.options.persistence.readOwner(ownerId);
      const index = state.snippets.findIndex((snippet) => snippet.id === id);
      if (index < 0)
        throw new GitHubWorkspaceError('NOT_FOUND', 'Snippet was not found.');
      const updated = { ...state.snippets[index]!, favorite, updatedAt: this.now() };
      const snippets = [...state.snippets];
      snippets[index] = updated;
      await this.options.persistence.writeOwner(ownerId, { ...state, snippets });
      return clone(updated);
    });
  }

  public async deleteSnippet(
    principal: AuthenticatedPrincipal,
    snippetId: string,
  ): Promise<void> {
    const ownerId = this.owner(principal);
    const id = requiredId(snippetId, 'Snippet ID');
    await this.locked(ownerId, async () => {
      const state = await this.options.persistence.readOwner(ownerId);
      if (!state.snippets.some((snippet) => snippet.id === id)) {
        throw new GitHubWorkspaceError('NOT_FOUND', 'Snippet was not found.');
      }
      await this.options.persistence.writeOwner(ownerId, {
        ...state,
        snippets: state.snippets.filter((snippet) => snippet.id !== id),
      });
    });
  }

  public async search(
    principal: AuthenticatedPrincipal,
    query: string,
  ): Promise<{
    readonly repositories: readonly GitHubWorkspaceRepository[];
    readonly issues: readonly GitHubWorkspaceIssue[];
    readonly snippets: readonly GitHubWorkspaceSnippet[];
    readonly tasks: readonly GitHubDeveloperTask[];
  }> {
    const normalized = boundedText(query, 'Search query', 160).toLowerCase();
    const { state } = await this.connected(this.owner(principal));
    return clone({
      repositories: state.repositories
        .filter((item) =>
          `${item.fullName} ${item.description ?? ''}`
            .toLowerCase()
            .includes(normalized),
        )
        .slice(0, 20),
      issues: state.issues
        .filter((item) =>
          `${item.title} ${item.body ?? ''}`.toLowerCase().includes(normalized),
        )
        .slice(0, 20),
      snippets: state.snippets
        .filter((item) =>
          `${item.title} ${item.description} ${item.tags.join(' ')}`
            .toLowerCase()
            .includes(normalized),
        )
        .slice(0, 20),
      tasks: state.tasks
        .filter((item) =>
          `${item.title} ${item.description ?? ''}`.toLowerCase().includes(normalized),
        )
        .slice(0, 20),
    });
  }

  private mergeDerivedTasks(
    existing: readonly GitHubDeveloperTask[],
    issues: readonly GitHubWorkspaceIssue[],
    pulls: readonly GitHubWorkspacePullRequest[],
  ): readonly GitHubDeveloperTask[] {
    const statusBySource = new Map(
      existing.map((task) => [`${task.source}:${task.sourceId}`, task.status]),
    );
    const issueTasks = issues.map((issue): GitHubDeveloperTask => ({
      id: `issue:${issue.githubId}`,
      source: 'GITHUB_ISSUE',
      sourceId: issue.githubId,
      repositoryFullName: issue.repositoryFullName,
      title: issue.title,
      description: issue.body,
      status:
        statusBySource.get(`GITHUB_ISSUE:${issue.githubId}`) ??
        (issue.state === 'CLOSED' ? 'DONE' : 'TODO'),
      priority: 'P2',
      labels: issue.labels.map((label) => label.name),
      assignee: issue.assignees[0] ?? null,
      dueAt: null,
      linkedIssue: issue.number,
      linkedPullRequest: null,
      updatedAt: issue.updatedAt,
    }));
    const pullTasks = pulls.map((pull): GitHubDeveloperTask => ({
      id: `pull:${pull.githubId}`,
      source: 'GITHUB_PR',
      sourceId: pull.githubId,
      repositoryFullName: pull.repositoryFullName,
      title: pull.title,
      description: null,
      status:
        statusBySource.get(`GITHUB_PR:${pull.githubId}`) ??
        (pull.state === 'MERGED' || pull.state === 'CLOSED'
          ? 'DONE'
          : pull.reviewState === 'REVIEW_REQUIRED'
            ? 'REVIEW'
            : 'IN_PROGRESS'),
      priority: 'P2',
      labels: [],
      assignee: pull.author,
      dueAt: null,
      linkedIssue: null,
      linkedPullRequest: pull.number,
      updatedAt: pull.updatedAt,
    }));
    const internal = existing.filter((task) => task.source === 'MEZIP_INTERNAL');
    return [...issueTasks, ...pullTasks, ...internal].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
}

export const GITHUB_OFFICIAL_URL = 'https://github.com/' as const;
