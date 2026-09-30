-- ME.zip Phase 10 — Creator Lab / Code Hub / safe workspace foundation.
-- Additive only. Consumer tables are FORCE RLS with no direct consumer policy;
-- the reviewed owner-scoped service/repository is the only application path.
-- This migration does not enable host shell execution or persist provider tokens.

BEGIN;

CREATE TABLE IF NOT EXISTS creator_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  project_type text NOT NULL CHECK (project_type IN ('WEB', 'MINI_PROGRAM', 'SCRIPT', 'LIBRARY', 'DESIGN_CODE', 'OTHER')),
  visibility text NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'UNLISTED', 'PUBLISHED')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'TRASHED', 'DELETED')),
  default_branch text NOT NULL DEFAULT 'main' CHECK (default_branch ~ '^[A-Za-z0-9._/-]{1,120}$'),
  workspace_version bigint NOT NULL DEFAULT 1 CHECK (workspace_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz,
  UNIQUE (owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS creator_project_members (
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER', 'EDITOR', 'VIEWER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, member_user_id)
);

CREATE TABLE IF NOT EXISTS code_repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('LOCAL', 'GITHUB', 'IMPORTED_ZIP', 'TEMPLATE')),
  provider text NOT NULL DEFAULT 'NONE' CHECK (provider IN ('NONE', 'GITHUB')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  full_name text,
  default_branch text NOT NULL DEFAULT 'main',
  status text NOT NULL DEFAULT 'CONNECTED' CHECK (status IN ('CONNECTED', 'DISCONNECTED', 'IMPORTING', 'FAILED')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS repository_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('GITHUB')),
  account_label text NOT NULL CHECK (length(account_label) BETWEEN 1 AND 120),
  authorization_reference_hash text NOT NULL CHECK (authorization_reference_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'CONNECTED' CHECK (status IN ('CONNECTED', 'REVOKED', 'PENDING')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS workspace_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  path text NOT NULL CHECK (length(path) BETWEEN 1 AND 512 AND path !~ '(^|/)(\.\.?|\.env|id_rsa|id_ed25519|credentials?|secrets?)(/|$)' AND path !~ '[\\\\]'),
  kind text NOT NULL CHECK (kind IN ('FILE', 'FOLDER')),
  language text,
  size_bytes bigint NOT NULL DEFAULT 0 CHECK (size_bytes >= 0 AND size_bytes <= 1000000),
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  content_ciphertext text,
  content_key_reference text,
  encryption_algorithm text,
  encryption_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, project_id, path),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  workspace_version bigint NOT NULL CHECK (workspace_version >= 1),
  reason text NOT NULL CHECK (reason IN ('AI_APPLY', 'IMPORT', 'BULK_EDIT', 'DELETE', 'MANUAL')),
  file_count integer NOT NULL CHECK (file_count >= 0),
  manifest_checksum text NOT NULL CHECK (manifest_checksum ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('CREATE', 'UPDATE', 'RENAME', 'MOVE', 'DELETE')),
  path text NOT NULL,
  next_path text,
  old_checksum text CHECK (old_checksum IS NULL OR old_checksum ~ '^[a-f0-9]{64}$'),
  new_checksum text CHECK (new_checksum IS NULL OR new_checksum ~ '^[a-f0-9]{64}$'),
  content_ciphertext text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS git_commits_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  branch text NOT NULL,
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 240),
  changed_paths text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS github_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_label text NOT NULL,
  authorization_reference_hash text NOT NULL CHECK (authorization_reference_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('CONNECTED', 'REVOKED', 'PENDING')),
  connected_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS github_repository_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL REFERENCES code_repositories(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES github_connections(id) ON DELETE RESTRICT,
  full_name text NOT NULL CHECK (full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, repository_id) REFERENCES code_repositories(owner_user_id, id),
  FOREIGN KEY (owner_user_id, connection_id) REFERENCES github_connections(owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS creator_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  version text NOT NULL CHECK (version ~ '^v?[0-9]+\\.[0-9]+\\.[0-9]+$'),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'YANKED')),
  source_commit_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, project_id, version),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS release_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES creator_releases(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 240),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  content_type text NOT NULL,
  storage_reference text,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, release_id) REFERENCES creator_releases(owner_user_id, id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS project_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format = 'ZIP'),
  status text NOT NULL CHECK (status IN ('READY', 'EXPIRED', 'FAILED')),
  manifest_checksum text NOT NULL CHECK (manifest_checksum ~ '^[a-f0-9]{64}$'),
  file_count integer NOT NULL CHECK (file_count >= 0),
  storage_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_code_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  scope_paths text[] NOT NULL,
  workspace_version bigint NOT NULL CHECK (workspace_version >= 1),
  status text NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_code_change_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES ai_code_requests(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  workspace_version bigint NOT NULL CHECK (workspace_version >= 1),
  status text NOT NULL CHECK (status IN ('PROPOSED', 'APPLIED', 'REJECTED', 'ROLLED_BACK', 'CONFLICTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  rolled_back_at timestamptz,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, request_id) REFERENCES ai_code_requests(owner_user_id, id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS ai_code_change_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  change_set_id uuid NOT NULL REFERENCES ai_code_change_sets(id) ON DELETE CASCADE,
  path text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('CREATE', 'UPDATE', 'RENAME', 'MOVE', 'DELETE')),
  next_path text,
  expected_checksum text CHECK (expected_checksum IS NULL OR expected_checksum ~ '^[a-f0-9]{64}$'),
  content_ciphertext text,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, change_set_id) REFERENCES ai_code_change_sets(owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS project_settings (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  ai_coding_enabled boolean NOT NULL DEFAULT true,
  export_enabled boolean NOT NULL DEFAULT true,
  default_scope text NOT NULL DEFAULT 'CURRENT_FILE',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, project_id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id)
);

CREATE INDEX IF NOT EXISTS creator_projects_owner_updated_idx ON creator_projects (owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS workspace_files_project_path_idx ON workspace_files (owner_user_id, project_id, path);
CREATE INDEX IF NOT EXISTS creator_releases_project_created_idx ON creator_releases (owner_user_id, project_id, created_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'creator_projects', 'creator_project_members', 'code_repositories',
    'repository_connections', 'workspace_files', 'workspace_snapshots',
    'workspace_changes', 'git_commits_metadata', 'github_connections',
    'github_repository_links', 'creator_releases', 'release_assets',
    'project_exports', 'ai_code_requests', 'ai_code_change_sets',
    'ai_code_change_files', 'project_settings'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

-- No consumer CREATE POLICY is intentional. A reviewed server role/repository
-- must set the authenticated owner context and expose only projections.
COMMIT;
