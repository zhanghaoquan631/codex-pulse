export type GitHubWorkspaceConnectionStatus =
  'CONNECTED' | 'AUTH_REQUIRED' | 'DISCONNECTED';

export type GitHubWorkspaceSyncStatus =
  | 'IDLE'
  | 'SYNCING'
  | 'SUCCESS'
  | 'PARTIAL'
  | 'ERROR'
  | 'RATE_LIMITED'
  | 'AUTH_REQUIRED';

export type GitHubWorkspaceErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'AUTH_REQUIRED'
  | 'PERMISSION_REQUIRED'
  | 'NETWORK_ERROR'
  | 'GITHUB_UNAVAILABLE'
  | 'SYNC_FAILED'
  | 'GITHUB_CALLBACK_REQUIRES_CONFIGURATION';

export interface GitHubWorkspaceConnection {
  readonly id: string;
  readonly githubUserId: string;
  readonly githubLogin: string;
  readonly githubAvatarUrl: string | null;
  readonly installationId: string;
  readonly status: GitHubWorkspaceConnectionStatus;
  readonly repositorySelection: 'ALL' | 'SELECTED';
  readonly authorizedRepositoryCount: number;
  readonly connectedAt: string;
  readonly updatedAt: string;
  readonly lastSyncedAt: string | null;
  readonly syncStatus: GitHubWorkspaceSyncStatus;
  readonly rateLimitRemaining: number | null;
  readonly rateLimitResetAt: string | null;
}

export interface GitHubWorkspaceAuthorizationStart {
  readonly authorizationUrl: string;
  readonly expiresAt: string;
}

export interface GitHubContributionDay {
  readonly date: string;
  readonly count: number;
}

export interface GitHubContributionSummary {
  readonly year: number;
  readonly total: number | null;
  readonly currentStreak: number | null;
  readonly longestStreak: number | null;
  readonly commitCount?: number | null;
  readonly pullRequestCount?: number | null;
  readonly issueCount?: number | null;
  readonly days: readonly GitHubContributionDay[];
}

export interface GitHubWorkspaceRepository {
  readonly githubId: string;
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly description: string | null;
  readonly visibility: 'PUBLIC' | 'PRIVATE' | 'INTERNAL';
  readonly private: boolean;
  readonly archived: boolean;
  readonly fork: boolean;
  readonly language: string | null;
  readonly stars: number;
  readonly forks: number;
  readonly issuesCount: number;
  readonly defaultBranch: string;
  readonly htmlUrl: string;
  readonly updatedAt: string;
  readonly syncedAt: string;
}

export interface GitHubWorkspaceIssue {
  readonly githubId: string;
  readonly repositoryFullName: string;
  readonly number: number;
  readonly title: string;
  readonly body: string | null;
  readonly state: 'OPEN' | 'CLOSED';
  readonly labels: readonly { readonly name: string; readonly color: string }[];
  readonly assignees: readonly string[];
  readonly author: string;
  readonly commentsCount: number;
  readonly htmlUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GitHubWorkspacePullRequest {
  readonly githubId: string;
  readonly repositoryFullName: string;
  readonly number: number;
  readonly title: string;
  readonly state: 'OPEN' | 'CLOSED' | 'MERGED';
  readonly draft: boolean;
  readonly author: string;
  readonly reviewState:
    'REVIEW_REQUIRED' | 'CHANGES_REQUESTED' | 'APPROVED' | 'UNKNOWN';
  readonly headBranch: string;
  readonly baseBranch: string;
  readonly htmlUrl: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type GitHubWorkspaceActivityKind =
  | 'PUSH'
  | 'COMMIT'
  | 'PULL_REQUEST'
  | 'ISSUE'
  | 'ISSUE_COMMENT'
  | 'PR_REVIEW'
  | 'RELEASE'
  | 'STAR'
  | 'FORK';

export interface GitHubWorkspaceActivity {
  readonly id: string;
  readonly kind: GitHubWorkspaceActivityKind;
  readonly action: string;
  readonly repositoryFullName: string | null;
  readonly occurredAt: string;
  readonly htmlUrl: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export type DeveloperTaskSource =
  'GITHUB_ISSUE' | 'GITHUB_PR' | 'GITHUB_PROJECT' | 'MEZIP_INTERNAL';

export type DeveloperTaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';

export interface GitHubDeveloperTask {
  readonly id: string;
  readonly source: DeveloperTaskSource;
  readonly sourceId: string | null;
  readonly repositoryFullName: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: DeveloperTaskStatus;
  readonly priority: 'P0' | 'P1' | 'P2' | 'P3';
  readonly labels: readonly string[];
  readonly assignee: string | null;
  readonly dueAt: string | null;
  readonly linkedIssue: number | null;
  readonly linkedPullRequest: number | null;
  readonly updatedAt: string;
}

export type GitHubSnippetSource =
  'MEZIP' | 'GITHUB_GIST' | 'REPOSITORY_FILE' | 'MANUAL';

export interface GitHubWorkspaceSnippet {
  readonly id: string;
  readonly source: GitHubSnippetSource;
  readonly sourceUrl: string | null;
  readonly title: string;
  readonly description: string;
  readonly language: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly favorite: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GitHubWorkspaceOverview {
  readonly connection: GitHubWorkspaceConnection;
  readonly contributions: GitHubContributionSummary;
  readonly commitCount: number | null;
  readonly pullRequestCount: number | null;
  readonly issueCount: number | null;
  readonly repositoryCount: number;
  readonly repositories: readonly GitHubWorkspaceRepository[];
  readonly recentActivity: readonly GitHubWorkspaceActivity[];
  readonly languageDistribution: Readonly<Record<string, number>>;
  readonly pendingTasks: readonly GitHubDeveloperTask[];
  readonly stale: boolean;
}

export interface GitHubRepositoryContent {
  readonly repositoryFullName: string;
  readonly path: string;
  readonly kind: 'FILE' | 'DIRECTORY';
  readonly sizeBytes: number;
  readonly sha: string;
  readonly htmlUrl: string;
  readonly downloadUrl: string | null;
  readonly content: string | null;
  readonly entries: readonly {
    readonly name: string;
    readonly path: string;
    readonly kind: 'FILE' | 'DIRECTORY';
    readonly sizeBytes: number;
    readonly sha: string;
    readonly htmlUrl: string;
  }[];
}

export interface GitHubCommitSummary {
  readonly sha: string;
  readonly message: string;
  readonly author: string;
  readonly avatarUrl: string | null;
  readonly committedAt: string;
  readonly htmlUrl: string;
}

export interface GitHubBranchSummary {
  readonly name: string;
  readonly default: boolean;
  readonly protected: boolean;
  readonly lastCommitSha: string;
}

export interface GitHubWorkspaceSnapshot {
  readonly repositories: readonly GitHubWorkspaceRepository[];
  readonly issues: readonly GitHubWorkspaceIssue[];
  readonly pullRequests: readonly GitHubWorkspacePullRequest[];
  readonly activity: readonly GitHubWorkspaceActivity[];
  /** Repository-backed snippets are optional for providers that do not index files. */
  readonly snippets?: readonly GitHubWorkspaceSnippet[];
  readonly contributions: GitHubContributionSummary;
  readonly rateLimitRemaining: number | null;
  readonly rateLimitResetAt: string | null;
  readonly partial: boolean;
}

export interface GitHubWorkspaceOwnerState {
  readonly connection: GitHubWorkspaceConnection | null;
  readonly pendingAuthorizations: Readonly<
    Record<
      string,
      {
        readonly expiresAt: string;
        readonly codeVerifier: string;
      }
    >
  >;
  readonly repositories: readonly GitHubWorkspaceRepository[];
  readonly issues: readonly GitHubWorkspaceIssue[];
  readonly pullRequests: readonly GitHubWorkspacePullRequest[];
  readonly activity: readonly GitHubWorkspaceActivity[];
  readonly contributions: GitHubContributionSummary | null;
  readonly tasks: readonly GitHubDeveloperTask[];
  readonly snippets: readonly GitHubWorkspaceSnippet[];
  readonly idempotency: Readonly<
    Record<string, { readonly fingerprint: string; readonly resourceId: string }>
  >;
}
