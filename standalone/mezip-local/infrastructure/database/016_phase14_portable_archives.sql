-- ME.zip Phase 14 — Portable .mezip exports, imports, backups and legacy foundation.
-- Additive only. Raw archive payloads belong in reviewed object storage; these
-- tables retain owner-scoped metadata, jobs, checksums and audit references.
-- Consumer roles receive no raw-table policy. A trusted service role/adapter is
-- required in production and must be rehearsed separately.
BEGIN;

CREATE TABLE IF NOT EXISTS archive_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archive_id uuid NOT NULL UNIQUE,
  export_type text NOT NULL CHECK (export_type IN ('FULL_ARCHIVE','YEAR_ARCHIVE','CUSTOM_RANGE','SELECTED_MODULES')),
  status text NOT NULL CHECK (status IN ('QUEUED','COLLECTING','PACKAGING','VERIFYING','READY','FAILED','CANCELLED','EXPIRED')),
  requested_sections jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(requested_sections) = 'array'),
  date_range jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(date_range) = 'object'),
  include_media boolean NOT NULL DEFAULT false,
  include_trash boolean NOT NULL DEFAULT false,
  encryption_mode text NOT NULL CHECK (encryption_mode IN ('NONE','PASSWORD_AES_256_GCM')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  schema_version text NOT NULL DEFAULT 'mezip.archive.v1',
  checksum_sha256 text,
  object_reference text,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  UNIQUE (owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS archive_export_sections (
  export_id uuid NOT NULL REFERENCES archive_exports(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section text NOT NULL,
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  checksum_sha256 text,
  PRIMARY KEY (owner_user_id, export_id, section),
  FOREIGN KEY (owner_user_id, export_id) REFERENCES archive_exports(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS archive_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archive_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('QUEUED','VERIFYING','PREVIEW_READY','IMPORTING','READY','FAILED','CANCELLED')),
  schema_version text NOT NULL,
  integrity_status text NOT NULL CHECK (integrity_status IN ('VERIFIED','INTEGRITY_FAILED')),
  selected_sections jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(selected_sections) = 'array'),
  conflict_resolution text NOT NULL DEFAULT 'SKIP' CHECK (conflict_resolution IN ('SKIP','CREATE_COPY','REPLACE','MERGE')),
  conflict_count integer NOT NULL DEFAULT 0 CHECK (conflict_count >= 0),
  restored_counts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(restored_counts) = 'object'),
  object_reference text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS archive_import_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  import_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('DUPLICATE','REVISION_CONFLICT','NATURAL_KEY_CONFLICT','UNSUPPORTED')),
  section text NOT NULL,
  portable_id text NOT NULL,
  existing_id text,
  summary text NOT NULL CHECK (length(summary) <= 2000),
  suggested_resolution text NOT NULL CHECK (suggested_resolution IN ('SKIP','CREATE_COPY','REPLACE','MERGE')),
  resolved boolean NOT NULL DEFAULT false,
  resolution text,
  UNIQUE (owner_user_id, import_id, id),
  FOREIGN KEY (owner_user_id, import_id) REFERENCES archive_imports(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS archive_restore_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  import_id uuid NOT NULL,
  backup_id uuid,
  status text NOT NULL CHECK (status IN ('QUEUED','RESTORING','READY','FAILED','CANCELLED')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  checkpoint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, import_id) REFERENCES archive_imports(owner_user_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS archive_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archive_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('USER_EXPORT','SYSTEM_BACKUP','PRE_RESTORE')),
  status text NOT NULL CHECK (status IN ('READY','FAILED','EXPIRED')),
  object_reference text,
  checksum_sha256 text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes >= 0),
  retention_days integer NOT NULL CHECK (retention_days BETWEEN 1 AND 3650),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE (owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS archive_versions (
  schema_version text PRIMARY KEY,
  migrator_name text NOT NULL,
  supported boolean NOT NULL DEFAULT true,
  released_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO archive_versions(schema_version, migrator_name) VALUES ('mezip.archive.v1', 'identity-v1') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS archive_download_tokens (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  export_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose = 'DOWNLOAD'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  FOREIGN KEY (owner_user_id, export_id) REFERENCES archive_exports(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS annual_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 1970 AND 9999),
  status text NOT NULL CHECK (status IN ('DRAFT','GENERATING','READY','FAILED')),
  archive_id uuid,
  statistics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(statistics) = 'object'),
  media_overview jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(media_overview) = 'object'),
  ai_insight_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, year),
  UNIQUE (owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS annual_archive_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  annual_archive_id uuid NOT NULL,
  source_type text NOT NULL,
  source_portable_id text NOT NULL,
  rank integer NOT NULL CHECK (rank >= 0),
  label text NOT NULL CHECK (length(label) <= 500),
  FOREIGN KEY (owner_user_id, annual_archive_id) REFERENCES annual_archives(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS legacy_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('DRAFT','ACTIVE','REVOKED')),
  scope jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(scope) = 'array'),
  trigger_mode text NOT NULL DEFAULT 'MANUAL_REVIEW_ONLY' CHECK (trigger_mode = 'MANUAL_REVIEW_ONLY'),
  legal_review_required boolean NOT NULL DEFAULT true,
  auto_release_enabled boolean NOT NULL DEFAULT false CHECK (auto_release_enabled = false),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS legacy_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  contact_reference text NOT NULL CHECK (length(contact_reference) BETWEEN 1 AND 500),
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS legacy_scope_rules (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL,
  section text NOT NULL,
  include_trash boolean NOT NULL DEFAULT false,
  include_media boolean NOT NULL DEFAULT false,
  PRIMARY KEY (owner_user_id, plan_id, section),
  FOREIGN KEY (owner_user_id, plan_id) REFERENCES legacy_plans(owner_user_id, id) ON DELETE CASCADE
);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['archive_exports','archive_export_sections','archive_imports','archive_import_conflicts','archive_restore_jobs','archive_backups','archive_versions','archive_download_tokens','annual_archives','annual_archive_highlights','legacy_plans','legacy_recipients','legacy_scope_rules'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

COMMIT;
