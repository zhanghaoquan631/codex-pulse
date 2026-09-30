-- ME.zip Phase 12 — safe project publishing and deployment foundation.
-- Additive only. This migration stores immutable build metadata and redacted
-- provider state; it never stores source plaintext, raw preview tokens, raw
-- secret values, provider credentials, or host/container control handles.
BEGIN;

CREATE TABLE IF NOT EXISTS deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('PREVIEW','PRODUCTION')),
  provider text NOT NULL CHECK (provider IN ('MOCK_STATIC','STATIC_WEB','MANAGED_WEB','CONTAINER_RUNTIME')),
  source_type text NOT NULL CHECK (source_type IN ('COMMIT','RELEASE','SNAPSHOT')),
  source_revision text NOT NULL CHECK (length(source_revision) BETWEEN 1 AND 256),
  release_id uuid,
  build_artifact_id uuid,
  status text NOT NULL CHECK (status IN ('QUEUED','BUILDING','READY_TO_DEPLOY','DEPLOYING','LIVE','FAILED','CANCELLED','ROLLED_BACK','SUPERSEDED','DELETING','DELETED')),
  url text,
  actor text NOT NULL CHECK (actor IN ('USER','SYSTEM','AI_ASSISTED','ADMIN')),
  provider_deployment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_class text,
  error_message text CHECK (error_message IS NULL OR length(error_message) <= 2000),
  superseded_by_deployment_id uuid,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deployment_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  deployment_id uuid NOT NULL,
  source_revision text NOT NULL CHECK (length(source_revision) BETWEEN 1 AND 256),
  build_id text NOT NULL CHECK (length(build_id) BETWEEN 1 AND 256),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(manifest) = 'object'),
  status text NOT NULL CHECK (status IN ('READY','EXPIRED','DELETED')),
  storage_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, deployment_id) REFERENCES deployments(owner_user_id, id) ON DELETE CASCADE
);

ALTER TABLE deployments
  ADD CONSTRAINT deployments_artifact_owner_fk
  FOREIGN KEY (owner_user_id, build_artifact_id) REFERENCES deployment_artifacts(owner_user_id, id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS deployment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deployment_id uuid NOT NULL,
  phase text NOT NULL CHECK (phase IN ('BUILD','DEPLOY','RUNTIME')),
  level text NOT NULL CHECK (level IN ('INFO','WARN','ERROR')),
  redacted_message text NOT NULL CHECK (length(redacted_message) <= 2000),
  sequence integer NOT NULL CHECK (sequence >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, deployment_id, sequence),
  FOREIGN KEY (owner_user_id, deployment_id) REFERENCES deployments(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deployment_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deployment_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','PASS','FAIL')),
  url text,
  checked_at timestamptz,
  error_class text,
  redacted_error_message text CHECK (redacted_error_message IS NULL OR length(redacted_error_message) <= 1000),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, deployment_id) REFERENCES deployments(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS preview_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  deployment_id uuid NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('PRIVATE','LINK_ONLY','PUBLIC')),
  token_hash text CHECK (token_hash IS NULL OR token_hash ~ '^[a-f0-9]{64}$'),
  password_hash text,
  password_protected boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, deployment_id) REFERENCES deployments(owner_user_id, id) ON DELETE CASCADE,
  CHECK (visibility <> 'LINK_ONLY' OR token_hash IS NOT NULL),
  CHECK (password_protected = false OR password_hash IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS custom_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  hostname text NOT NULL CHECK (hostname = lower(hostname) AND hostname !~ '[^a-z0-9.-]' AND hostname !~ '\.\.'),
  status text NOT NULL CHECK (status IN ('PENDING_VERIFICATION','VERIFIED','CONFIGURING','ACTIVE','FAILED','DISCONNECTED')),
  verification_method text NOT NULL CHECK (verification_method IN ('DNS_TXT','DNS_CNAME')),
  verification_token_hash text NOT NULL CHECK (verification_token_hash ~ '^[a-f0-9]{64}$'),
  dns_record jsonb NOT NULL CHECK (jsonb_typeof(dns_record) = 'object'),
  verified_at timestamptz,
  tls_status text NOT NULL CHECK (tls_status IN ('PENDING','ISSUING','ACTIVE','FAILED','RENEWAL_REQUIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hostname),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deployment_environment_configs (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('PREVIEW','PRODUCTION')),
  public_env jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(public_env) = 'object'),
  secret_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(secret_refs) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, project_id, environment),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deployment_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('PREVIEW','PRODUCTION')),
  name text NOT NULL CHECK (name ~ '^[A-Z_][A-Z0-9_]{0,63}$'),
  secret_reference text NOT NULL CHECK (secret_reference ~ '^(vault|secret)://'),
  secret_version integer NOT NULL CHECK (secret_version >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, project_id, environment, name),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deployment_usage (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  build_seconds bigint NOT NULL DEFAULT 0 CHECK (build_seconds >= 0),
  artifact_bytes bigint NOT NULL DEFAULT 0 CHECK (artifact_bytes >= 0),
  deployment_count bigint NOT NULL DEFAULT 0 CHECK (deployment_count >= 0),
  preview_minutes bigint NOT NULL DEFAULT 0 CHECK (preview_minutes >= 0),
  bandwidth_bytes bigint NOT NULL DEFAULT 0 CHECK (bandwidth_bytes >= 0),
  runtime_seconds bigint NOT NULL DEFAULT 0 CHECK (runtime_seconds >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, project_id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_publish_settings (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  project_visibility text NOT NULL CHECK (project_visibility IN ('PRIVATE','UNLISTED','PUBLISHED')),
  source_visibility text NOT NULL CHECK (source_visibility IN ('PRIVATE','SELECTED_RELEASE','PUBLIC')),
  download_visibility text NOT NULL CHECK (download_visibility IN ('PRIVATE','SELECTED_RELEASE','PUBLIC')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, project_id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_publications (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  project_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  screenshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  demo_url text,
  readme text,
  release_id uuid,
  creator_display_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, project_id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deployment_provider_configs (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('MOCK_STATIC','STATIC_WEB','MANAGED_WEB','CONTAINER_RUNTIME')),
  config_reference text,
  status text NOT NULL CHECK (status IN ('CONFIGURED','DISABLED','FAILED')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, project_id, provider),
  CHECK (config_reference IS NULL OR config_reference ~ '^(vault|secret|config)://'),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS deployments_project_created_idx ON deployments (owner_user_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS preview_shares_token_idx ON preview_shares (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS custom_domains_hostname_idx ON custom_domains (hostname);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'deployments', 'deployment_artifacts', 'deployment_logs',
    'deployment_health_checks', 'preview_shares', 'custom_domains',
    'deployment_environment_configs', 'deployment_secrets', 'deployment_usage',
    'project_publish_settings', 'project_publications', 'deployment_provider_configs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

-- No consumer policies are intentional. Only the reviewed owner-scoped
-- deployment repository/service role may read these tables.
COMMIT;
