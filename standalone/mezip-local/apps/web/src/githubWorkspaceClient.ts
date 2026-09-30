export interface GitHubWorkspaceConnection {
  readonly githubLogin: string;
  readonly githubAvatarUrl: string | null;
  readonly status: 'CONNECTED' | 'AUTH_REQUIRED' | 'DISCONNECTED';
  readonly authorizedRepositoryCount: number;
  readonly lastSyncedAt: string | null;
  readonly syncStatus: string;
  readonly rateLimitRemaining: number | null;
  readonly rateLimitResetAt: string | null;
}

export interface GitHubWorkspaceRepository {
  readonly fullName: string;
  readonly name: string;
  readonly owner: string;
  readonly description: string | null;
  readonly visibility: string;
  readonly private: boolean;
  readonly archived: boolean;
  readonly language: string | null;
  readonly stars: number;
  readonly forks: number;
  readonly issuesCount: number;
  readonly defaultBranch: string;
  readonly htmlUrl: string;
  readonly updatedAt: string;
}

interface GitHubWorkspaceRepositoryPage {
  readonly items: readonly GitHubWorkspaceRepository[];
  readonly page: number;
  readonly hasMore: boolean;
}

export interface GitHubWorkspaceSnippet {
  readonly id: string;
  readonly source: string;
  readonly sourceUrl: string | null;
  readonly title: string;
  readonly description: string;
  readonly language: string;
  readonly content: string;
  readonly favorite: boolean;
  readonly updatedAt: string;
}

export interface GitHubWorkspaceIssue {
  readonly repositoryFullName: string;
  readonly number: number;
  readonly title: string;
  readonly state: 'OPEN' | 'CLOSED';
  readonly labels: readonly { readonly name: string; readonly color: string }[];
  readonly htmlUrl: string;
  readonly updatedAt: string;
}

export interface GitHubWorkspaceTask {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly repositoryFullName: string | null;
  readonly status: string;
  readonly priority: string;
  readonly updatedAt: string;
}

export interface GitHubWorkspaceActivity {
  readonly id: string;
  readonly kind: string;
  readonly action: string;
  readonly repositoryFullName: string | null;
  readonly occurredAt: string;
  readonly htmlUrl: string;
}

export interface GitHubWorkspaceOverview {
  readonly commitCount: number | null;
  readonly pullRequestCount: number | null;
  readonly issueCount: number | null;
  readonly repositoryCount: number;
  readonly languageDistribution: Readonly<Record<string, number>>;
  readonly contributions: {
    readonly total: number | null;
    readonly currentStreak: number | null;
    readonly longestStreak: number | null;
  };
}

export interface GitHubWorkspaceSection<T> {
  readonly data: T | null;
  readonly error: GitHubWorkspaceClientError | null;
}

export interface GitHubWorkspaceData {
  readonly connection: GitHubWorkspaceConnection;
  readonly overview: GitHubWorkspaceSection<GitHubWorkspaceOverview>;
  readonly repositories: GitHubWorkspaceSection<readonly GitHubWorkspaceRepository[]>;
  readonly snippets: GitHubWorkspaceSection<readonly GitHubWorkspaceSnippet[]>;
  readonly issues: GitHubWorkspaceSection<readonly GitHubWorkspaceIssue[]>;
  readonly tasks: GitHubWorkspaceSection<readonly GitHubWorkspaceTask[]>;
  readonly activity: GitHubWorkspaceSection<readonly GitHubWorkspaceActivity[]>;
}

export class GitHubWorkspaceClientError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  public constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = 'GitHubWorkspaceClientError';
    this.code = code;
    this.retryable = retryable;
  }
}

function errorForStatus(status: number): GitHubWorkspaceClientError {
  if (status === 401) return new GitHubWorkspaceClientError('AUTH_REQUIRED', '请先完成 GitHub 官方授权。');
  if (status === 403) return new GitHubWorkspaceClientError('FORBIDDEN', '当前账号无权读取这部分 GitHub 数据。');
  if (status === 404) return new GitHubWorkspaceClientError('NOT_FOUND', 'GitHub 数据不存在或已对当前账号不可见。');
  if (status === 429) return new GitHubWorkspaceClientError('RATE_LIMITED', 'GitHub API 额度暂时用尽，请稍后再试。', true);
  return new GitHubWorkspaceClientError('SERVICE_UNAVAILABLE', 'GitHub 数据服务暂时不可用。', status >= 500);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(options?.headers ?? {}) },
      ...options,
    });
  } catch {
    throw new GitHubWorkspaceClientError('NETWORK_ERROR', '无法连接 GitHub 数据服务。', true);
  }
  const text = await response.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new GitHubWorkspaceClientError('SERVICE_UNAVAILABLE', 'GitHub 服务返回了无法识别的数据。', true);
    }
  }
  if (!response.ok) {
    const message =
      body !== null && typeof body === 'object' && !Array.isArray(body) &&
      'error' in body && body.error !== null && typeof body.error === 'object' && !Array.isArray(body.error) &&
      'message' in body.error && typeof body.error.message === 'string'
        ? body.error.message
        : errorForStatus(response.status).message;
    const code =
      body !== null && typeof body === 'object' && !Array.isArray(body) &&
      'error' in body && body.error !== null && typeof body.error === 'object' && !Array.isArray(body.error) &&
      'code' in body.error && typeof body.error.code === 'string'
        ? body.error.code
        : errorForStatus(response.status).code;
    const fallback = errorForStatus(response.status);
    throw new GitHubWorkspaceClientError(code, message, fallback.retryable);
  }
  return body as T;
}

function section<T>(promise: Promise<T>): Promise<GitHubWorkspaceSection<T>> {
  return promise.then((data) => ({ data, error: null })).catch((error: unknown) => ({
    data: null,
    error: error instanceof GitHubWorkspaceClientError
      ? error
      : new GitHubWorkspaceClientError('SERVICE_UNAVAILABLE', '这项 GitHub 数据暂时不可用。', true),
  }));
}

export async function loadGitHubWorkspaceData(): Promise<GitHubWorkspaceData> {
  const connection = await request<GitHubWorkspaceConnection | null>('/v1/github-workspace/connection');
  if (connection === null || connection.status !== 'CONNECTED') {
    throw new GitHubWorkspaceClientError('AUTH_REQUIRED', '请先完成 GitHub 官方授权。');
  }
  const [overview, repositories, snippets, issues, tasks, activity] = await Promise.all([
    section(request<GitHubWorkspaceOverview>('/v1/github-workspace/overview')),
    section(
      request<GitHubWorkspaceRepositoryPage>('/v1/github-workspace/repositories?limit=100').then(
        (page) => page.items,
      ),
    ),
    section(request<readonly GitHubWorkspaceSnippet[]>('/v1/github-workspace/snippets?limit=100')),
    section(request<readonly GitHubWorkspaceIssue[]>('/v1/github-workspace/issues?limit=100')),
    section(request<readonly GitHubWorkspaceTask[]>('/v1/github-workspace/tasks?limit=100')),
    section(request<readonly GitHubWorkspaceActivity[]>('/v1/github-workspace/activity?limit=100')),
  ]);
  return { connection, overview, repositories, snippets, issues, tasks, activity };
}

export async function syncGitHubWorkspaceData(): Promise<void> {
  await request('/v1/github-workspace/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `web-github-sync:${crypto.randomUUID()}`,
    },
    body: '{}',
  });
}
