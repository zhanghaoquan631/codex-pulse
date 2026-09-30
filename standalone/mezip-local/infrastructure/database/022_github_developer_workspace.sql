-- ME.zip — Personal GitHub Developer Workspace.
-- Additive only. The official GitHub URL remains https://github.com/ and all
-- user/installation credentials stay inside the trusted service boundary.
-- No raw GitHub row has a direct consumer SELECT policy.
BEGIN;

CREATE TABLE IF NOT EXISTS github_workspace_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_user_id text NOT NULL CHECK (github_user_id ~ '^[0-9]+$'),
  github_login text NOT NULL CHECK (github_login ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$'),
  github_avatar_url text CHECK (github_avatar_url IS NULL OR github_avatar_url ~ '^https://'),
  installation_id text NOT NULL CHECK (installation_id ~ '^[0-9]+$'),
  status text NOT NULL CHECK (status IN ('CONNECTED', 'AUTH_REQUIRED', 'DISCONNECTED')),
  repository_selection text NOT NULL CHECK (repository_selection IN ('ALL', 'SELECTED')),
  authorized_repository_count integer NOT NULL DEFAULT 0 CHECK (authorized_repository_count >= 0),
  sync_status text NOT NULL DEFAULT 'IDLE' CHECK (sync_status IN ('IDLE', 'SYNCING', 'SUCCESS', 'PARTIAL', 'ERROR', 'RATE_LIMITED', 'AUTH_REQUIRED')),
  rate_limit_remaining integer CHECK (rate_limit_remaining IS NULL OR rate_limit_remaining >= 0),
  rate_limit_reset_at timestamptz,
  last_synced_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id),
  UNIQUE (owner_user_id, installation_id)
);

-- Ciphertext is written/read only by the reviewed credential-vault adapter.
-- It is never included in consumer DTOs, logs, exports, or public snapshots.
CREATE TABLE IF NOT EXISTS github_workspace_credentials (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL,
  token_ciphertext bytea NOT NULL,
  key_reference text NOT NULL CHECK (key_reference ~ '^(?:vault|kms|secret)://'),
  key_version integer NOT NULL CHECK (key_version >= 1),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  PRIMARY KEY (owner_user_id, connection_id),
  FOREIGN KEY (owner_user_id, connection_id) REFERENCES github_workspace_connections(owner_user_id, id) ON DELETE CASCADE
);

-- Authoritative encrypted aggregate for restart and multi-instance hydration.
-- Normalized tables below remain owner-scoped query/audit projections.
CREATE TABLE IF NOT EXISTS github_workspace_owner_snapshots (
  owner_user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state_ciphertext bytea NOT NULL,
  key_reference text NOT NULL CHECK (key_reference ~ '^(?:vault|kms|secret)://'),
  key_version integer NOT NULL CHECK (key_version >= 1),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS github_workspace_oauth_states (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS github_workspace_repositories (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL,
  github_id text NOT NULL CHECK (github_id ~ '^[0-9]+$'),
  repository_owner text NOT NULL,
  repository_name text NOT NULL,
  full_name text NOT NULL CHECK (full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  description text,
  visibility text NOT NULL CHECK (visibility IN ('PUBLIC', 'PRIVATE', 'INTERNAL')),
  is_private boolean NOT NULL,
  is_archived boolean NOT NULL,
  is_fork boolean NOT NULL,
  language text,
  stars integer NOT NULL DEFAULT 0 CHECK (stars >= 0),
  forks integer NOT NULL DEFAULT 0 CHECK (forks >= 0),
  issues_count integer NOT NULL DEFAULT 0 CHECK (issues_count >= 0),
  default_branch text NOT NULL,
  html_url text NOT NULL CHECK (html_url ~ '^https://(?:www\.)?github\.com/'),
  provider_updated_at timestamptz NOT NULL,
  synced_at timestamptz NOT NULL,
  PRIMARY KEY (owner_user_id, github_id),
  UNIQUE (owner_user_id, full_name),
  FOREIGN KEY (owner_user_id, connection_id) REFERENCES github_workspace_connections(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS github_workspace_issues (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL,
  github_id text NOT NULL CHECK (github_id ~ '^[0-9]+$'),
  repository_full_name text NOT NULL,
  issue_number integer NOT NULL CHECK (issue_number > 0),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 1000),
  body_ciphertext bytea,
  state text NOT NULL CHECK (state IN ('OPEN', 'CLOSED')),
  labels jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(labels) = 'array'),
  assignees jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(assignees) = 'array'),
  author_login text NOT NULL,
  comments_count integer NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
  html_url text NOT NULL CHECK (html_url ~ '^https://(?:www\.)?github\.com/'),
  provider_created_at timestamptz NOT NULL,
  provider_updated_at timestamptz NOT NULL,
  PRIMARY KEY (owner_user_id, github_id),
  UNIQUE (owner_user_id, repository_full_name, issue_number),
  FOREIGN KEY (owner_user_id, connection_id) REFERENCES github_workspace_connections(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, repository_full_name) REFERENCES github_workspace_repositories(owner_user_id, full_name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS github_workspace_pull_requests (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL,
  github_id text NOT NULL CHECK (github_id ~ '^[0-9]+$'),
  repository_full_name text NOT NULL,
  pull_number integer NOT NULL CHECK (pull_number > 0),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 1000),
  state text NOT NULL CHECK (state IN ('OPEN', 'CLOSED', 'MERGED')),
  is_draft boolean NOT NULL,
  author_login text NOT NULL,
  review_state text NOT NULL CHECK (review_state IN ('REVIEW_REQUIRED', 'CHANGES_REQUESTED', 'APPROVED', 'UNKNOWN')),
  head_branch text NOT NULL,
  base_branch text NOT NULL,
  html_url text NOT NULL CHECK (html_url ~ '^https://(?:www\.)?github\.com/'),
  provider_created_at timestamptz NOT NULL,
  provider_updated_at timestamptz NOT NULL,
  PRIMARY KEY (owner_user_id, github_id),
  UNIQUE (owner_user_id, repository_full_name, pull_number),
  FOREIGN KEY (owner_user_id, connection_id) REFERENCES github_workspace_connections(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, repository_full_name) REFERENCES github_workspace_repositories(owner_user_id, full_name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS github_workspace_contribution_days (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contribution_date date NOT NULL,
  contribution_count integer NOT NULL CHECK (contribution_count >= 0),
  synced_at timestamptz NOT NULL,
  PRIMARY KEY (owner_user_id, contribution_date)
);

CREATE TABLE IF NOT EXISTS github_workspace_activity (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_event_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('PUSH', 'COMMIT', 'PULL_REQUEST', 'ISSUE', 'ISSUE_COMMENT', 'PR_REVIEW', 'RELEASE', 'STAR', 'FORK')),
  action text NOT NULL,
  repository_full_name text,
  occurred_at timestamptz NOT NULL,
  html_url text NOT NULL CHECK (html_url ~ '^https://(?:www\.)?github\.com/'),
  metadata_safe jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata_safe) = 'object'),
  PRIMARY KEY (owner_user_id, provider_event_id)
);

CREATE TABLE IF NOT EXISTS github_workspace_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('MEZIP', 'GITHUB_GIST', 'REPOSITORY_FILE', 'MANUAL')),
  source_url text CHECK (source_url IS NULL OR source_url ~ '^https://(?:www\.)?github\.com/'),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  language text NOT NULL CHECK (length(language) BETWEEN 1 AND 60),
  content_ciphertext bytea NOT NULL,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (cardinality(tags) <= 20),
  favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS github_developer_tasks (
  id text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('GITHUB_ISSUE', 'GITHUB_PR', 'GITHUB_PROJECT', 'MEZIP_INTERNAL')),
  source_id text,
  repository_full_name text,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 1000),
  description_ciphertext bytea,
  status text NOT NULL CHECK (status IN ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE')),
  priority text NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
  labels text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (cardinality(labels) <= 50),
  assignee_login text,
  due_at timestamptz,
  linked_issue integer,
  linked_pull_request integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, id),
  UNIQUE (owner_user_id, source, source_id)
);

CREATE TABLE IF NOT EXISTS github_workspace_idempotency (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_key text NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  resource_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (owner_user_id, scope_key)
);

CREATE TABLE IF NOT EXISTS github_workspace_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('SYNCING', 'SUCCESS', 'PARTIAL', 'ERROR', 'RATE_LIMITED', 'AUTH_REQUIRED')),
  cursor_before text,
  cursor_after text,
  repositories_seen integer NOT NULL DEFAULT 0 CHECK (repositories_seen >= 0),
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY (owner_user_id, connection_id) REFERENCES github_workspace_connections(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS github_workspace_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id uuid,
  action text NOT NULL CHECK (action IN ('CONNECTION_STARTED', 'CONNECTED', 'DISCONNECTED', 'SYNC_STARTED', 'SYNC_COMPLETED', 'SYNC_FAILED', 'SNIPPET_CREATED', 'SNIPPET_UPDATED', 'SNIPPET_DELETED', 'TASK_STATUS_UPDATED')),
  status text NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
  metadata_safe jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata_safe) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_user_id, connection_id) REFERENCES github_workspace_connections(owner_user_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS github_workspace_repo_owner_updated_idx ON github_workspace_repositories (owner_user_id, provider_updated_at DESC);
CREATE INDEX IF NOT EXISTS github_workspace_issue_owner_updated_idx ON github_workspace_issues (owner_user_id, provider_updated_at DESC);
CREATE INDEX IF NOT EXISTS github_workspace_pr_owner_updated_idx ON github_workspace_pull_requests (owner_user_id, provider_updated_at DESC);
CREATE INDEX IF NOT EXISTS github_workspace_activity_owner_time_idx ON github_workspace_activity (owner_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS github_workspace_task_owner_status_idx ON github_developer_tasks (owner_user_id, status, updated_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'github_workspace_connections',
    'github_workspace_credentials',
    'github_workspace_owner_snapshots',
    'github_workspace_oauth_states',
    'github_workspace_repositories',
    'github_workspace_issues',
    'github_workspace_pull_requests',
    'github_workspace_contribution_days',
    'github_workspace_activity',
    'github_workspace_snippets',
    'github_developer_tasks',
    'github_workspace_idempotency',
    'github_workspace_sync_runs',
    'github_workspace_audit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

-- Intentionally no consumer policy. The trusted service role performs
-- owner-scoped queries and must be explicitly granted by deployment tooling.
REVOKE ALL ON TABLE
  github_workspace_connections,
  github_workspace_credentials,
  github_workspace_owner_snapshots,
  github_workspace_oauth_states,
  github_workspace_repositories,
  github_workspace_issues,
  github_workspace_pull_requests,
  github_workspace_contribution_days,
  github_workspace_activity,
  github_workspace_snippets,
  github_developer_tasks,
  github_workspace_idempotency,
  github_workspace_sync_runs,
  github_workspace_audit_events
FROM PUBLIC;

COMMIT;
