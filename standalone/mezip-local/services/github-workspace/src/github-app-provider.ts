import { randomUUID } from 'node:crypto';
import type {
  GitHubBranchSummary,
  GitHubCommitSummary,
  GitHubContributionDay,
  GitHubRepositoryContent,
  GitHubWorkspaceActivity,
  GitHubWorkspaceActivityKind,
  GitHubWorkspaceConnection,
  GitHubWorkspaceIssue,
  GitHubWorkspacePullRequest,
  GitHubWorkspaceRepository,
  GitHubWorkspaceSnapshot,
  GitHubWorkspaceSnippet,
} from './types.js';
import {
  GITHUB_OFFICIAL_URL,
  GitHubWorkspaceError,
  type GitHubWorkspaceProvider,
} from './github-workspace.js';

type JsonObject = Readonly<Record<string, unknown>>;

const asObject = (value: unknown): JsonObject | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
const asArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];
const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asNullableString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;
const asNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;
const asNullableNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const asBoolean = (value: unknown): boolean => value === true;

const snippetLanguages: Readonly<Record<string, string>> = {
  css: 'CSS',
  go: 'Go',
  html: 'HTML',
  java: 'Java',
  js: 'JavaScript',
  jsx: 'JavaScript',
  json: 'JSON',
  md: 'Markdown',
  py: 'Python',
  rs: 'Rust',
  sh: 'Shell',
  sql: 'SQL',
  swift: 'Swift',
  ts: 'TypeScript',
  tsx: 'TypeScript',
  vue: 'Vue',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
};

const ignoredSnippetPath = (path: string): boolean =>
  /(^|\/)(node_modules|vendor|dist|build|coverage|\.git)(\/|$)/u.test(path) ||
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock)$/u.test(path);

const snippetLanguage = (path: string): string | null => {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return snippetLanguages[extension] ?? null;
};

function requiredConfiguration(value: string, name: string, max = 20_000): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > max) {
    throw new GitHubWorkspaceError(
      'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
      `${name} is not configured.`,
    );
  }
  return normalized;
}

function callbackUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new GitHubWorkspaceError(
      'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
      'GitHub callback URL is invalid.',
    );
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (
    (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new GitHubWorkspaceError(
      'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
      'GitHub callback URL is invalid.',
    );
  }
  return parsed;
}

function officialGitHubUrl(
  value: unknown,
  fallback: string = GITHUB_OFFICIAL_URL,
): string {
  const raw = typeof value === 'string' && value.length > 0 ? value : fallback;
  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol !== 'https:' ||
      !['github.com', 'www.github.com'].includes(parsed.hostname)
    )
      return fallback;
    if (parsed.username.length > 0 || parsed.password.length > 0) return fallback;
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function repositoryName(value: string): {
  readonly owner: string;
  readonly repository: string;
} {
  const match = /^([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})$/u.exec(
    value.trim(),
  );
  if (match === null)
    throw new GitHubWorkspaceError('VALIDATION', 'Repository name is invalid.');
  return { owner: match[1]!, repository: match[2]! };
}

function iso(value: unknown): string {
  const raw = asString(value);
  return Number.isFinite(Date.parse(raw))
    ? new Date(raw).toISOString()
    : new Date(0).toISOString();
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new GitHubWorkspaceError(
      'GITHUB_UNAVAILABLE',
      'GitHub returned an invalid response.',
      true,
    );
  }
}

export interface GitHubAppCredentialVault {
  readonly durable: boolean;
  /** Only reviewed KMS/secret-manager backed vaults may set this to true. */
  readonly productionSafe: boolean;
  put(input: {
    readonly ownerId: string;
    readonly connectionId: string;
    readonly accessToken: string;
  }): Promise<void>;
  get(input: {
    readonly ownerId: string;
    readonly connectionId: string;
  }): Promise<string | null>;
  remove(input: {
    readonly ownerId: string;
    readonly connectionId: string;
  }): Promise<void>;
}

/** Development/test only. Production composition rejects this plaintext process-memory vault. */
export class InMemoryGitHubAppCredentialVault implements GitHubAppCredentialVault {
  public readonly durable = false;
  public readonly productionSafe = false;
  private readonly tokens = new Map<string, string>();

  public async put(input: {
    readonly ownerId: string;
    readonly connectionId: string;
    readonly accessToken: string;
  }): Promise<void> {
    this.tokens.set(`${input.ownerId}:${input.connectionId}`, input.accessToken);
  }

  public async get(input: {
    readonly ownerId: string;
    readonly connectionId: string;
  }): Promise<string | null> {
    return this.tokens.get(`${input.ownerId}:${input.connectionId}`) ?? null;
  }

  public async remove(input: {
    readonly ownerId: string;
    readonly connectionId: string;
  }): Promise<void> {
    this.tokens.delete(`${input.ownerId}:${input.connectionId}`);
  }
}

export interface GitHubAppProviderOptions {
  readonly appId: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly privateKey: string;
  readonly webhookSecret: string;
  readonly callbackUrl: string;
  readonly credentialVault: GitHubAppCredentialVault;
  readonly fetcher?: typeof fetch;
  readonly now?: () => string;
  readonly id?: () => string;
}

/**
 * Server-only GitHub App adapter. It uses GitHub's official user authorization
 * and installation APIs, stores the user token only in the injected vault, and
 * never returns credentials in a public projection.
 */
export class GitHubAppProvider implements GitHubWorkspaceProvider {
  public readonly productionSafe: boolean;
  private readonly appId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly privateKey: string;
  private readonly webhookSecret: string;
  private readonly callback: URL;
  private readonly fetcher: typeof fetch;
  private readonly now: () => string;
  private readonly id: () => string;

  public constructor(private readonly options: GitHubAppProviderOptions) {
    this.appId = requiredConfiguration(options.appId, 'GITHUB_APP_ID', 100);
    this.clientId = requiredConfiguration(options.clientId, 'GITHUB_CLIENT_ID', 200);
    this.clientSecret = requiredConfiguration(
      options.clientSecret,
      'GITHUB_CLIENT_SECRET',
      2_000,
    );
    this.privateKey = requiredConfiguration(
      options.privateKey,
      'GITHUB_PRIVATE_KEY',
      100_000,
    );
    this.webhookSecret = requiredConfiguration(
      options.webhookSecret,
      'GITHUB_WEBHOOK_SECRET',
      2_000,
    );
    this.callback = callbackUrl(options.callbackUrl);
    this.fetcher = options.fetcher ?? globalThis.fetch;
    this.now = options.now ?? (() => new Date().toISOString());
    this.id = options.id ?? randomUUID;
    this.productionSafe =
      options.credentialVault.durable && options.credentialVault.productionSafe;
    if (typeof this.fetcher !== 'function') {
      throw new GitHubWorkspaceError(
        'GITHUB_CALLBACK_REQUIRES_CONFIGURATION',
        'GitHub network adapter is not configured.',
      );
    }
    // Touch server-only values so dead-code optimizers cannot accidentally
    // remove configuration validation while keeping them out of all DTOs.
    void this.appId;
    void this.privateKey;
    void this.webhookSecret;
  }

  public async beginAuthorization(input: {
    readonly ownerId: string;
    readonly state: string;
    readonly codeChallenge: string;
  }) {
    if (
      input.ownerId.length === 0 ||
      input.state.length < 32 ||
      !/^[A-Za-z0-9_-]{43}$/u.test(input.codeChallenge)
    ) {
      throw new GitHubWorkspaceError(
        'VALIDATION',
        'GitHub authorization request is invalid.',
      );
    }
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.callback.toString());
    url.searchParams.set('state', input.state);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return {
      authorizationUrl: url.toString(),
      expiresAt: new Date(Date.parse(this.now()) + 10 * 60_000).toISOString(),
    };
  }

  public async completeAuthorization(input: {
    readonly ownerId: string;
    readonly state: string;
    readonly code: string;
    readonly codeVerifier: string;
    readonly installationId?: string;
  }): Promise<GitHubWorkspaceConnection> {
    const tokenResponse = await this.fetcher(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code: input.code,
          code_verifier: input.codeVerifier,
          redirect_uri: this.callback.toString(),
        }),
      },
    );
    await this.assertResponse(tokenResponse);
    const tokenPayload = asObject(await json(tokenResponse));
    const accessToken = asString(tokenPayload?.access_token);
    if (accessToken.length === 0 || accessToken.length > 20_000) {
      throw new GitHubWorkspaceError(
        'AUTH_REQUIRED',
        'GitHub did not return a usable user token.',
      );
    }
    const user = asObject(
      await this.authorizedJson('https://api.github.com/user', accessToken),
    );
    const githubUserId = String(asNumber(user?.id));
    const githubLogin = asString(user?.login).trim();
    if (githubUserId === '0' || githubLogin.length === 0 || githubLogin.length > 120) {
      throw new GitHubWorkspaceError(
        'AUTH_REQUIRED',
        'GitHub account identity could not be verified.',
      );
    }
    const installationsPayload = asObject(
      await this.authorizedJson(
        'https://api.github.com/user/installations?per_page=100',
        accessToken,
      ),
    );
    const installations = asArray(installationsPayload?.installations)
      .map(asObject)
      .filter((value): value is JsonObject => value !== null);
    const requestedInstallation = input.installationId;
    const selected =
      requestedInstallation === undefined
        ? installations.length === 1
          ? installations[0]
          : undefined
        : installations.find(
            (installation) =>
              String(asNumber(installation.id)) === requestedInstallation,
          );
    if (selected === undefined) {
      throw new GitHubWorkspaceError(
        'PERMISSION_REQUIRED',
        installations.length === 0
          ? 'Install the ME.zip GitHub App and select repositories before completing the connection.'
          : 'Select the GitHub App installation to connect.',
      );
    }
    const installationId = String(asNumber(selected.id));
    const selection =
      asString(selected.repository_selection) === 'all'
        ? ('ALL' as const)
        : ('SELECTED' as const);
    const connectionId = this.id();
    await this.options.credentialVault.put({
      ownerId: input.ownerId,
      connectionId,
      accessToken,
    });
    const timestamp = this.now();
    return {
      id: connectionId,
      githubUserId,
      githubLogin,
      githubAvatarUrl: asNullableString(user?.avatar_url),
      installationId,
      status: 'CONNECTED',
      repositorySelection: selection,
      authorizedRepositoryCount: 0,
      connectedAt: timestamp,
      updatedAt: timestamp,
      lastSyncedAt: null,
      syncStatus: 'IDLE',
      rateLimitRemaining: null,
      rateLimitResetAt: null,
    };
  }

  public async disconnect(input: {
    readonly ownerId: string;
    readonly connectionId: string;
  }): Promise<void> {
    await this.options.credentialVault.remove(input);
  }

  public async sync(input: {
    readonly ownerId: string;
    readonly connection: GitHubWorkspaceConnection;
  }): Promise<GitHubWorkspaceSnapshot> {
    const token = await this.token(input.ownerId, input.connection.id);
    const repositories: GitHubWorkspaceRepository[] = [];
    let remaining: number | null = null;
    let resetAt: string | null = null;
    for (let page = 1; page <= 10; page += 1) {
      const response = await this.authorizedResponse(
        `https://api.github.com/user/installations/${encodeURIComponent(input.connection.installationId)}/repositories?per_page=100&page=${page}`,
        token,
      );
      const rate = this.rate(response);
      remaining = rate.remaining;
      resetAt = rate.resetAt;
      const payload = asObject(await json(response));
      const rows = asArray(payload?.repositories);
      repositories.push(
        ...rows
          .map((row) => this.repository(row))
          .filter((row): row is GitHubWorkspaceRepository => row !== null),
      );
      if (rows.length < 100) break;
    }
    const issues: GitHubWorkspaceIssue[] = [];
    const pulls: GitHubWorkspacePullRequest[] = [];
    let partial = repositories.length > 25;
    for (const repository of repositories.slice(0, 25)) {
      const parsed = repositoryName(repository.fullName);
      const issuePayload = asArray(
        await this.authorizedJson(
          `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}/issues?state=all&per_page=30&sort=updated`,
          token,
        ),
      );
      for (const row of issuePayload) {
        const object = asObject(row);
        if (object === null) continue;
        if (asObject(object.pull_request) !== null) {
          const pull = this.pull(repository.fullName, object);
          if (pull !== null) pulls.push(pull);
        } else {
          const issue = this.issue(repository.fullName, object);
          if (issue !== null) issues.push(issue);
        }
      }
    }
    const events = asArray(
      await this.authorizedJson(
        `https://api.github.com/users/${encodeURIComponent(input.connection.githubLogin)}/events?per_page=100`,
        token,
      ),
    );
    const activity = events
      .map((event) => this.activity(event))
      .filter((event): event is GitHubWorkspaceActivity => event !== null);
    const snippetIndex = await this.indexRepositorySnippets(
      repositories.slice(0, 3),
      token,
    );
    if (repositories.length > 3) partial = true;
    partial = partial || snippetIndex.partial;
    let contributions: GitHubContributionDay[] = [];
    let contributionTotal: number | null = null;
    let contributionCommitCount: number | null = null;
    let contributionPullRequestCount: number | null = null;
    let contributionIssueCount: number | null = null;
    try {
      const graph = asObject(await this.graphql(token, input.connection.githubLogin));
      const user = asObject(asObject(graph?.data)?.user);
      const collection = asObject(user?.contributionsCollection);
      const calendar = asObject(collection?.contributionCalendar);
      contributionTotal = asNullableNumber(calendar?.totalContributions);
      contributionCommitCount = asNullableNumber(collection?.totalCommitContributions);
      contributionPullRequestCount = asNullableNumber(
        collection?.totalPullRequestContributions,
      );
      contributionIssueCount = asNullableNumber(collection?.totalIssueContributions);
      const weeks = asArray(calendar?.weeks);
      contributions = weeks
        .flatMap((week) => asArray(asObject(week)?.contributionDays))
        .map((day) => ({
          date: asString(asObject(day)?.date),
          count: asNumber(asObject(day)?.contributionCount),
        }))
        .filter((day) => /^\d{4}-\d{2}-\d{2}$/u.test(day.date));
    } catch (error) {
      if (
        error instanceof GitHubWorkspaceError &&
        ['RATE_LIMITED', 'AUTH_REQUIRED'].includes(error.code)
      )
        throw error;
      partial = true;
    }
    const streaks = this.streaks(contributions);
    return {
      repositories,
      issues,
      pullRequests: pulls,
      activity,
      snippets: snippetIndex.snippets,
      contributions: {
        year: new Date(this.now()).getUTCFullYear(),
        total: contributionTotal,
        currentStreak: streaks.current,
        longestStreak: streaks.longest,
        days: contributions,
        ...(contributionCommitCount === null
          ? {}
          : { commitCount: contributionCommitCount }),
        ...(contributionPullRequestCount === null
          ? {}
          : { pullRequestCount: contributionPullRequestCount }),
        ...(contributionIssueCount === null
          ? {}
          : { issueCount: contributionIssueCount }),
      },
      rateLimitRemaining: remaining,
      rateLimitResetAt: resetAt,
      partial,
    };
  }

  private async indexRepositorySnippets(
    repositories: readonly GitHubWorkspaceRepository[],
    token: string,
  ): Promise<{
    readonly snippets: readonly GitHubWorkspaceSnippet[];
    readonly partial: boolean;
  }> {
    const snippets: GitHubWorkspaceSnippet[] = [];
    let partial = false;
    for (const repository of repositories) {
      const parsed = repositoryName(repository.fullName);
      let treePayload: unknown;
      try {
        treePayload = await this.authorizedJson(
          `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}/git/trees/${encodeURIComponent(repository.defaultBranch)}?recursive=1`,
          token,
        );
      } catch (error) {
        if (
          error instanceof GitHubWorkspaceError &&
          ['AUTH_REQUIRED', 'RATE_LIMITED'].includes(error.code)
        )
          throw error;
        partial = true;
        continue;
      }
      const treeObject = asObject(treePayload);
      const tree = asArray(treeObject?.tree);
      if (asBoolean(treeObject?.truncated)) partial = true;
      const candidates = tree
        .map(asObject)
        .filter((entry): entry is JsonObject => entry !== null)
        .filter((entry) => asString(entry.type) === 'blob')
        .map((entry) => ({
          path: asString(entry.path),
          size: asNumber(entry.size),
        }))
        .filter(
          (entry) =>
            entry.path.length > 0 &&
            entry.path.length <= 240 &&
            entry.size > 0 &&
            entry.size <= 120_000 &&
            !ignoredSnippetPath(entry.path) &&
            snippetLanguage(entry.path) !== null,
        )
        .slice(0, 8);
      for (const candidate of candidates) {
        try {
          const contentPayload = await this.authorizedJson(
            `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}/contents/${candidate.path
              .split('/')
              .map(encodeURIComponent)
              .join('/')}?ref=${encodeURIComponent(repository.defaultBranch)}`,
            token,
          );
          const object = asObject(contentPayload);
          const encoded = asString(object?.content).replaceAll('\n', '');
          if (asString(object?.encoding) !== 'base64' || encoded.length === 0) {
            partial = true;
            continue;
          }
          const content = Buffer.from(encoded, 'base64').toString('utf8');
          if (
            content.length === 0 ||
            content.includes('\u0000') ||
            content.length > 120_000
          ) {
            partial = true;
            continue;
          }
          const language = snippetLanguage(candidate.path);
          if (language === null) continue;
          const sha = asString(object?.sha) || candidate.path;
          snippets.push({
            id: `github-file:${repository.fullName}:${sha}`.slice(0, 200),
            source: 'REPOSITORY_FILE',
            sourceUrl: officialGitHubUrl(object?.html_url, repository.htmlUrl),
            title: candidate.path,
            description: `来自 GitHub 仓库文件 · ${repository.fullName} · ${repository.defaultBranch}`,
            language,
            content,
            tags: [repository.fullName, 'REPOSITORY_FILE'],
            favorite: false,
            createdAt: this.now(),
            updatedAt: this.now(),
          });
        } catch (error) {
          if (
            error instanceof GitHubWorkspaceError &&
            ['AUTH_REQUIRED', 'RATE_LIMITED'].includes(error.code)
          )
            throw error;
          partial = true;
        }
      }
    }
    return { snippets, partial };
  }

  public async readRepositoryContent(input: {
    readonly ownerId: string;
    readonly connection: GitHubWorkspaceConnection;
    readonly repositoryFullName: string;
    readonly path: string;
  }): Promise<GitHubRepositoryContent> {
    const token = await this.token(input.ownerId, input.connection.id);
    const parsed = repositoryName(input.repositoryFullName);
    const encodedPath = input.path
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
    const suffix = encodedPath.length > 0 ? `/${encodedPath}` : '';
    const payload = await this.authorizedJson(
      `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}/contents${suffix}`,
      token,
    );
    if (Array.isArray(payload)) {
      const entries = payload
        .map((row) => this.contentEntry(row))
        .filter(
          (row): row is NonNullable<ReturnType<GitHubAppProvider['contentEntry']>> =>
            row !== null,
        );
      return {
        repositoryFullName: input.repositoryFullName,
        path: input.path,
        kind: 'DIRECTORY',
        sizeBytes: 0,
        sha: '',
        htmlUrl: GITHUB_OFFICIAL_URL,
        downloadUrl: null,
        content: null,
        entries,
      };
    }
    const object = asObject(payload);
    if (object === null)
      throw new GitHubWorkspaceError(
        'GITHUB_UNAVAILABLE',
        'GitHub returned invalid repository content.',
      );
    const rawContent = asString(object.content).replaceAll('\n', '');
    const content =
      asString(object.encoding) === 'base64' && rawContent.length <= 1_500_000
        ? Buffer.from(rawContent, 'base64').toString('utf8')
        : null;
    return {
      repositoryFullName: input.repositoryFullName,
      path: asString(object.path),
      kind: 'FILE',
      sizeBytes: asNumber(object.size),
      sha: asString(object.sha),
      htmlUrl: officialGitHubUrl(object.html_url),
      downloadUrl: asNullableString(object.download_url),
      content,
      entries: [],
    };
  }

  public async listCommits(input: {
    readonly ownerId: string;
    readonly connection: GitHubWorkspaceConnection;
    readonly repositoryFullName: string;
    readonly page: number;
  }): Promise<readonly GitHubCommitSummary[]> {
    const token = await this.token(input.ownerId, input.connection.id);
    const parsed = repositoryName(input.repositoryFullName);
    const payload = asArray(
      await this.authorizedJson(
        `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}/commits?per_page=30&page=${input.page}`,
        token,
      ),
    );
    return payload
      .map((row): GitHubCommitSummary | null => {
        const object = asObject(row);
        const commit = asObject(object?.commit);
        if (object === null || commit === null) return null;
        const gitAuthor = asObject(commit.author);
        const userAuthor = asObject(object.author);
        return {
          sha: asString(object.sha),
          message: asString(commit.message),
          author: asString(userAuthor?.login) || asString(gitAuthor?.name) || 'Unknown',
          avatarUrl: asNullableString(userAuthor?.avatar_url),
          committedAt: iso(gitAuthor?.date),
          htmlUrl: officialGitHubUrl(object.html_url),
        };
      })
      .filter((row): row is GitHubCommitSummary => row !== null);
  }

  public async listBranches(input: {
    readonly ownerId: string;
    readonly connection: GitHubWorkspaceConnection;
    readonly repositoryFullName: string;
  }): Promise<readonly GitHubBranchSummary[]> {
    const token = await this.token(input.ownerId, input.connection.id);
    const parsed = repositoryName(input.repositoryFullName);
    const repositoryPayload = asObject(
      await this.authorizedJson(
        `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}`,
        token,
      ),
    );
    const defaultBranch = asString(repositoryPayload?.default_branch);
    const branches = asArray(
      await this.authorizedJson(
        `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}/branches?per_page=100`,
        token,
      ),
    );
    return branches
      .map((row): GitHubBranchSummary | null => {
        const object = asObject(row);
        if (object === null) return null;
        const name = asString(object.name);
        return {
          name,
          default: name === defaultBranch,
          protected: asBoolean(object.protected),
          lastCommitSha: asString(asObject(object.commit)?.sha),
        };
      })
      .filter((row): row is GitHubBranchSummary => row !== null);
  }

  private async token(ownerId: string, connectionId: string): Promise<string> {
    const token = await this.options.credentialVault.get({ ownerId, connectionId });
    if (token === null)
      throw new GitHubWorkspaceError(
        'AUTH_REQUIRED',
        'GitHub authorization has expired or is unavailable.',
      );
    return token;
  }

  private async authorizedJson(url: string, token: string): Promise<unknown> {
    return json(await this.authorizedResponse(url, token));
  }

  private async authorizedResponse(url: string, token: string): Promise<Response> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.github.com') {
      throw new GitHubWorkspaceError(
        'GITHUB_UNAVAILABLE',
        'GitHub API URL is invalid.',
      );
    }
    const response = await this.fetcher(parsed, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    await this.assertResponse(response);
    return response;
  }

  private async graphql(token: string, login: string): Promise<unknown> {
    const response = await this.fetcher('https://api.github.com/graphql', {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        query:
          'query($login:String!){user(login:$login){contributionsCollection{totalCommitContributions totalPullRequestContributions totalIssueContributions contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}',
        variables: { login },
      }),
    });
    await this.assertResponse(response);
    return json(response);
  }

  private async assertResponse(response: Response): Promise<void> {
    if (response.ok) return;
    const remaining = Number(response.headers.get('x-ratelimit-remaining'));
    if (response.status === 401)
      throw new GitHubWorkspaceError(
        'AUTH_REQUIRED',
        'GitHub authorization has expired.',
      );
    if ((response.status === 403 || response.status === 429) && remaining === 0)
      throw new GitHubWorkspaceError(
        'RATE_LIMITED',
        'GitHub rate limit has been reached.',
        true,
      );
    if (response.status === 403)
      throw new GitHubWorkspaceError(
        'PERMISSION_REQUIRED',
        'The GitHub App needs additional permission for this resource.',
      );
    if (response.status === 404)
      throw new GitHubWorkspaceError('NOT_FOUND', 'GitHub resource was not found.');
    if (response.status >= 500)
      throw new GitHubWorkspaceError(
        'GITHUB_UNAVAILABLE',
        'GitHub is temporarily unavailable.',
        true,
      );
    throw new GitHubWorkspaceError(
      'GITHUB_UNAVAILABLE',
      `GitHub request failed with status ${response.status}.`,
      true,
    );
  }

  private rate(response: Response): {
    readonly remaining: number | null;
    readonly resetAt: string | null;
  } {
    const remainingRaw = response.headers.get('x-ratelimit-remaining');
    const resetRaw = response.headers.get('x-ratelimit-reset');
    const remaining =
      remainingRaw !== null && Number.isFinite(Number(remainingRaw))
        ? Number(remainingRaw)
        : null;
    const reset =
      resetRaw !== null && Number.isFinite(Number(resetRaw)) ? Number(resetRaw) : null;
    return {
      remaining,
      resetAt: reset === null ? null : new Date(reset * 1000).toISOString(),
    };
  }

  private repository(value: unknown): GitHubWorkspaceRepository | null {
    const object = asObject(value);
    if (object === null) return null;
    const fullName = asString(object.full_name);
    const owner = asString(asObject(object.owner)?.login);
    const name = asString(object.name);
    if (fullName.length === 0 || owner.length === 0 || name.length === 0) return null;
    return {
      githubId: String(asNumber(object.id)),
      owner,
      name,
      fullName,
      description: asNullableString(object.description),
      visibility: asBoolean(object.private)
        ? 'PRIVATE'
        : asString(object.visibility) === 'internal'
          ? 'INTERNAL'
          : 'PUBLIC',
      private: asBoolean(object.private),
      archived: asBoolean(object.archived),
      fork: asBoolean(object.fork),
      language: asNullableString(object.language),
      stars: asNumber(object.stargazers_count),
      forks: asNumber(object.forks_count),
      issuesCount: asNumber(object.open_issues_count),
      defaultBranch: asString(object.default_branch) || 'main',
      htmlUrl: officialGitHubUrl(object.html_url),
      updatedAt: iso(object.updated_at),
      syncedAt: this.now(),
    };
  }

  private issue(
    repositoryFullName: string,
    object: JsonObject,
  ): GitHubWorkspaceIssue | null {
    const number = asNumber(object.number);
    const title = asString(object.title);
    if (number <= 0 || title.length === 0) return null;
    return {
      githubId: String(asNumber(object.id)),
      repositoryFullName,
      number,
      title,
      body: asNullableString(object.body),
      state: asString(object.state) === 'closed' ? 'CLOSED' : 'OPEN',
      labels: asArray(object.labels)
        .map(asObject)
        .filter((label): label is JsonObject => label !== null)
        .map((label) => ({ name: asString(label.name), color: asString(label.color) })),
      assignees: asArray(object.assignees)
        .map(asObject)
        .filter((user): user is JsonObject => user !== null)
        .map((user) => asString(user.login))
        .filter(Boolean),
      author: asString(asObject(object.user)?.login) || 'Unknown',
      commentsCount: asNumber(object.comments),
      htmlUrl: officialGitHubUrl(object.html_url),
      createdAt: iso(object.created_at),
      updatedAt: iso(object.updated_at),
    };
  }

  private pull(
    repositoryFullName: string,
    object: JsonObject,
  ): GitHubWorkspacePullRequest | null {
    const number = asNumber(object.number);
    const title = asString(object.title);
    if (number <= 0 || title.length === 0) return null;
    const pullRef = asObject(object.pull_request);
    return {
      githubId: String(asNumber(object.id)),
      repositoryFullName,
      number,
      title,
      state:
        asString(object.state) === 'closed'
          ? asString(pullRef?.merged_at).length > 0
            ? 'MERGED'
            : 'CLOSED'
          : 'OPEN',
      draft: asBoolean(object.draft),
      author: asString(asObject(object.user)?.login) || 'Unknown',
      reviewState: 'UNKNOWN',
      headBranch: asString(asObject(object.head)?.ref),
      baseBranch: asString(asObject(object.base)?.ref),
      htmlUrl: officialGitHubUrl(object.html_url),
      createdAt: iso(object.created_at),
      updatedAt: iso(object.updated_at),
    };
  }

  private activity(value: unknown): GitHubWorkspaceActivity | null {
    const object = asObject(value);
    if (object === null) return null;
    const type = asString(object.type);
    const mapping: Readonly<Record<string, GitHubWorkspaceActivityKind>> = {
      PushEvent: 'PUSH',
      PullRequestEvent: 'PULL_REQUEST',
      IssuesEvent: 'ISSUE',
      IssueCommentEvent: 'ISSUE_COMMENT',
      PullRequestReviewEvent: 'PR_REVIEW',
      ReleaseEvent: 'RELEASE',
      WatchEvent: 'STAR',
      ForkEvent: 'FORK',
      CreateEvent: 'COMMIT',
    };
    const kind = mapping[type];
    if (kind === undefined) return null;
    const repo = asObject(object.repo);
    const payload = asObject(object.payload);
    const action = asString(payload?.action) || type.replace(/Event$/u, '');
    return {
      id: asString(object.id),
      kind,
      action,
      repositoryFullName: asNullableString(repo?.name),
      occurredAt: iso(object.created_at),
      htmlUrl: GITHUB_OFFICIAL_URL,
      metadata: { public: asBoolean(object.public) },
    };
  }

  private contentEntry(value: unknown): {
    readonly name: string;
    readonly path: string;
    readonly kind: 'FILE' | 'DIRECTORY';
    readonly sizeBytes: number;
    readonly sha: string;
    readonly htmlUrl: string;
  } | null {
    const object = asObject(value);
    if (object === null) return null;
    const type = asString(object.type);
    if (type !== 'file' && type !== 'dir') return null;
    return {
      name: asString(object.name),
      path: asString(object.path),
      kind: type === 'dir' ? 'DIRECTORY' : 'FILE',
      sizeBytes: asNumber(object.size),
      sha: asString(object.sha),
      htmlUrl: officialGitHubUrl(object.html_url),
    };
  }

  private streaks(days: readonly GitHubContributionDay[]): {
    readonly current: number | null;
    readonly longest: number | null;
  } {
    if (days.length === 0) return { current: null, longest: null };
    const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
    let longest = 0;
    let run = 0;
    for (const day of ordered) {
      run = day.count > 0 ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    let current = 0;
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      if (ordered[index]!.count <= 0) break;
      current += 1;
    }
    return { current, longest };
  }
}
