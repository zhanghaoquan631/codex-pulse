-- ME.zip Phase 11 — isolated sandbox runtime persistence boundary.
-- Additive only. Runtime providers own execution; this schema stores opaque
-- state, metadata and redacted logs, never host credentials or host mounts.
BEGIN;

CREATE TABLE IF NOT EXISTS sandbox_runtimes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('MOCK','LOCAL_CONTAINER','REMOTE_CONTAINER','MICROVM','MANAGED')),
  status text NOT NULL CHECK (status IN ('CREATING','READY','RUNNING','STOPPING','STOPPED','FAILED','EXPIRED','DESTROYED')),
  runtime_image text NOT NULL CHECK (length(runtime_image) BETWEEN 1 AND 160),
  network_mode text NOT NULL CHECK (network_mode IN ('DENY_ALL','REGISTRY_ONLY','ALLOWLIST')),
  allowed_hosts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allowed_hosts) = 'array'),
  allowed_ports jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allowed_ports) = 'array'),
  filesystem_root text NOT NULL DEFAULT '/workspace' CHECK (filesystem_root = '/workspace'),
  host_mounts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (host_mounts = '[]'::jsonb),
  privileged boolean NOT NULL DEFAULT false CHECK (privileged = false),
  host_network boolean NOT NULL DEFAULT false CHECK (host_network = false),
  host_pid boolean NOT NULL DEFAULT false CHECK (host_pid = false),
  host_ipc boolean NOT NULL DEFAULT false CHECK (host_ipc = false),
  docker_socket boolean NOT NULL DEFAULT false CHECK (docker_socket = false),
  runtime_user text NOT NULL DEFAULT 'sandbox',
  linux_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (linux_capabilities = '[]'::jsonb),
  security_profile text NOT NULL DEFAULT 'PLATFORM_DEFAULT' CHECK (security_profile IN ('PLATFORM_DEFAULT','SECCOMP_DEFAULT','APPARMOR_DEFAULT')),
  linux_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (linux_capabilities = '[]'::jsonb),
  security_profile text NOT NULL DEFAULT 'PLATFORM_DEFAULT' CHECK (security_profile IN ('PLATFORM_DEFAULT','SECCOMP_DEFAULT','APPARMOR_DEFAULT')),
  cpu_millis integer NOT NULL CHECK (cpu_millis BETWEEN 1 AND 4000),
  memory_bytes bigint NOT NULL CHECK (memory_bytes > 0),
  disk_bytes bigint NOT NULL CHECK (disk_bytes > 0),
  process_limit integer NOT NULL CHECK (process_limit BETWEEN 1 AND 256),
  command_timeout_ms integer NOT NULL CHECK (command_timeout_ms BETWEEN 100 AND 300000),
  idle_timeout_ms integer NOT NULL CHECK (idle_timeout_ms > 0),
  max_lifetime_ms integer NOT NULL CHECK (max_lifetime_ms > 0),
  max_log_bytes integer NOT NULL CHECK (max_log_bytes BETWEEN 1024 AND 10485760),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  stopped_at timestamptz,
  expires_at timestamptz NOT NULL,
  current_task_id uuid,
  preview_id uuid,
  ephemeral boolean NOT NULL DEFAULT true CHECK (ephemeral = true),
  cleanup_at timestamptz NOT NULL,
  recovery_state text NOT NULL DEFAULT 'HEALTHY' CHECK (recovery_state IN ('HEALTHY','STALE','RECOVERING','LOST')),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sandbox_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  runtime_id uuid NOT NULL REFERENCES sandbox_runtimes(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  task_type text NOT NULL CHECK (task_type IN ('INSTALL','BUILD','TEST','LINT','TYPECHECK','DEV_SERVER','COMMAND','PREVIEW')),
  command_safe_metadata text NOT NULL CHECK (length(command_safe_metadata) BETWEEN 1 AND 256),
  status text NOT NULL CHECK (status IN ('QUEUED','RUNNING','SUCCESS','FAILED','CANCELLED','TIMED_OUT')),
  started_at timestamptz,
  completed_at timestamptz,
  exit_code integer,
  duration_ms integer,
  timeout_ms integer NOT NULL CHECK (timeout_ms BETWEEN 100 AND 300000),
  log_bytes integer NOT NULL DEFAULT 0 CHECK (log_bytes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, runtime_id) REFERENCES sandbox_runtimes(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sandbox_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  runtime_id uuid NOT NULL REFERENCES sandbox_runtimes(id) ON DELETE CASCADE,
  task_id uuid,
  stream text NOT NULL CHECK (stream IN ('STDOUT','STDERR','SYSTEM')),
  redacted_text text NOT NULL CHECK (length(redacted_text) <= 10485760),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  truncated boolean NOT NULL DEFAULT false,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, runtime_id) REFERENCES sandbox_runtimes(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, task_id) REFERENCES sandbox_tasks(owner_user_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sandbox_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  runtime_id uuid NOT NULL REFERENCES sandbox_runtimes(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES sandbox_tasks(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  status text NOT NULL CHECK (status IN ('STARTING','RUNNING','STOPPING','EXITED','FAILED')),
  exit_code integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, runtime_id) REFERENCES sandbox_runtimes(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, task_id) REFERENCES sandbox_tasks(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sandbox_ports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  runtime_id uuid NOT NULL REFERENCES sandbox_runtimes(id) ON DELETE CASCADE,
  internal_port integer NOT NULL CHECK (internal_port BETWEEN 1 AND 65535),
  protocol text NOT NULL CHECK (protocol IN ('HTTP','HTTPS','WS')),
  status text NOT NULL CHECK (status IN ('RESERVED','EXPOSED','RELEASED')),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, runtime_id, internal_port),
  FOREIGN KEY (owner_user_id, runtime_id) REFERENCES sandbox_runtimes(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sandbox_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  runtime_id uuid NOT NULL REFERENCES sandbox_runtimes(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  port_id uuid NOT NULL REFERENCES sandbox_ports(id) ON DELETE CASCADE,
  access text NOT NULL DEFAULT 'PRIVATE' CHECK (access = 'PRIVATE'),
  origin text NOT NULL CHECK (origin ~ '^https://'),
  expires_at timestamptz NOT NULL,
  csp text NOT NULL,
  status text NOT NULL CHECK (status IN ('STARTING','READY','STOPPED','EXPIRED')),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, runtime_id) REFERENCES sandbox_runtimes(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, port_id) REFERENCES sandbox_ports(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sandbox_workspace_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  runtime_id uuid NOT NULL REFERENCES sandbox_runtimes(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  path text NOT NULL CHECK (path ~ '^/workspace(?:/[A-Za-z0-9._-]+)*$'),
  operation text NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE','RENAME')),
  before_checksum text,
  after_checksum text,
  status text NOT NULL CHECK (status IN ('DETECTED','REVIEWED','APPLIED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, runtime_id) REFERENCES sandbox_runtimes(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sandbox_usage (
  runtime_id uuid PRIMARY KEY REFERENCES sandbox_runtimes(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cpu_millis bigint NOT NULL DEFAULT 0 CHECK (cpu_millis >= 0),
  memory_bytes bigint NOT NULL DEFAULT 0 CHECK (memory_bytes >= 0),
  disk_bytes bigint NOT NULL DEFAULT 0 CHECK (disk_bytes >= 0),
  runtime_seconds bigint NOT NULL DEFAULT 0 CHECK (runtime_seconds >= 0),
  build_seconds bigint NOT NULL DEFAULT 0 CHECK (build_seconds >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_user_id, runtime_id) REFERENCES sandbox_runtimes(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sandbox_terminal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  runtime_id uuid NOT NULL REFERENCES sandbox_runtimes(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('OPENING','OPEN','CLOSING','CLOSED','FAILED')),
  working_directory text NOT NULL DEFAULT '/workspace' CHECK (working_directory = '/workspace'),
  columns integer NOT NULL CHECK (columns BETWEEN 20 AND 400),
  rows integer NOT NULL CHECK (rows BETWEEN 5 AND 200),
  input_retention text NOT NULL DEFAULT 'NONE' CHECK (input_retention = 'NONE'),
  started_at timestamptz NOT NULL DEFAULT now(),
  stopped_at timestamptz,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, runtime_id) REFERENCES sandbox_runtimes(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sandbox_environment_variables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  runtime_id uuid NOT NULL REFERENCES sandbox_runtimes(id) ON DELETE CASCADE,
  variable_key text NOT NULL CHECK (variable_key ~ '^[A-Z][A-Z0-9_]{0,127}$'),
  kind text NOT NULL CHECK (kind IN ('PUBLIC','SECRET_REFERENCE')),
  secret_reference text,
  status text NOT NULL CHECK (status IN ('PENDING','INJECTED','REVOKED')),
  expires_at timestamptz,
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, runtime_id, variable_key),
  FOREIGN KEY (owner_user_id, runtime_id) REFERENCES sandbox_runtimes(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sandbox_runtime_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  runtime_id uuid NOT NULL REFERENCES sandbox_runtimes(id) ON DELETE CASCADE,
  scopes jsonb NOT NULL CHECK (jsonb_typeof(scopes) = 'array'),
  token_reference_hash text NOT NULL CHECK (token_reference_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
  expires_at timestamptz NOT NULL,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, runtime_id) REFERENCES sandbox_runtimes(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sandbox_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  runtime_id uuid NOT NULL REFERENCES sandbox_runtimes(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES sandbox_tasks(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 256),
  relative_path text NOT NULL CHECK (relative_path !~ '(^|/)\.\.(/|$)'),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  content_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('READY','EXPIRED','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, runtime_id) REFERENCES sandbox_runtimes(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, task_id) REFERENCES sandbox_tasks(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sandbox_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  runtime_id uuid NOT NULL REFERENCES sandbox_runtimes(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES sandbox_tasks(id) ON DELETE CASCADE,
  severity text NOT NULL CHECK (severity IN ('ERROR','WARNING','INFO')),
  message text NOT NULL CHECK (length(message) <= 1024),
  path text,
  line integer,
  column_number integer,
  diagnostic_code text,
  source text NOT NULL CHECK (source IN ('BUILD','TEST','LINT','TYPECHECK','RUNTIME')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, runtime_id) REFERENCES sandbox_runtimes(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, task_id) REFERENCES sandbox_tasks(owner_user_id, id) ON DELETE CASCADE
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['sandbox_runtimes','sandbox_tasks','sandbox_logs','sandbox_processes','sandbox_ports','sandbox_previews','sandbox_workspace_changes','sandbox_usage','sandbox_terminal_sessions','sandbox_environment_variables','sandbox_runtime_tokens','sandbox_artifacts','sandbox_problems'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

COMMIT;
