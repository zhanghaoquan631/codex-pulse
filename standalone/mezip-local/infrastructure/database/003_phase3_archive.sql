-- ME.zip Phase 3 Personal Life Archive.
-- Additive migration.  The Phase 0/1 tables remain available for legacy
-- adapters; these tables carry the stricter revision, ownership and offline
-- contracts used by the Phase 3 archive service.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE mezip_archive_entry_kind AS ENUM ('TEXT', 'PHOTO', 'VIDEO', 'MIXED', 'NOTE', 'MEMORY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE mezip_archive_entry_status AS ENUM ('DRAFT', 'ACTIVE', 'TRASHED', 'DELETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE mezip_archive_revision_source AS ENUM ('ONLINE', 'OFFLINE', 'IMPORT', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE mezip_archive_media_status AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'QUARANTINED', 'DELETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE mezip_archive_step_source AS ENUM ('MANUAL', 'WECHAT', 'APPLE_HEALTH', 'ANDROID_HEALTH', 'IMPORT', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS life_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  -- `kind` remains the cross-domain timeline discriminator from Phase 0;
  -- `life_type` carries the concrete Life Archive content type.
  kind mezip_record_kind NOT NULL DEFAULT 'LIFE',
  life_type mezip_archive_entry_kind,
  title text,
  body text,
  occurred_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Etc/UTC',
  record_source text NOT NULL DEFAULT 'MANUAL',
  device_id text,
  location jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  mood text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status mezip_archive_entry_status NOT NULL DEFAULT 'ACTIVE',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  server_received_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (
    length(coalesce(body, '') || coalesce(title, '')) > 0
    OR coalesce(life_type IN ('PHOTO', 'VIDEO', 'MIXED'), false)
  )
);
CREATE INDEX IF NOT EXISTS life_entries_owner_occurred_idx ON life_entries(owner_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS life_entries_owner_status_idx ON life_entries(owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS life_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES life_entries(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id),
  revision integer NOT NULL CHECK (revision > 0),
  source mezip_archive_revision_source NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, revision)
);
CREATE INDEX IF NOT EXISTS life_revisions_owner_entry_idx ON life_revisions(owner_id, entry_id, revision DESC);

CREATE TABLE IF NOT EXISTS life_published_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entry_id uuid NOT NULL REFERENCES life_entries(id),
  owner_id uuid NOT NULL REFERENCES users(id),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  selected_content jsonb NOT NULL,
  visibility text NOT NULL DEFAULT 'SNAPSHOT' CHECK (visibility IN ('PRIVATE', 'SNAPSHOT', 'COMMUNITY', 'GROUP', 'DIRECT_SHARE', 'PUBLIC')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS life_snapshots_owner_idx ON life_published_snapshots(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS life_ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entry_id uuid NOT NULL REFERENCES life_entries(id),
  owner_id uuid NOT NULL REFERENCES users(id),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  output_type text NOT NULL DEFAULT 'AI_GENERATED' CHECK (output_type = 'AI_GENERATED'),
  provider text NOT NULL,
  model text NOT NULL,
  insight jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS life_ai_insights_owner_entry_idx ON life_ai_insights(owner_id, source_entry_id, created_at DESC);

CREATE TABLE IF NOT EXISTS archive_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  server_received_at timestamptz NOT NULL DEFAULT now(),
  timezone text NOT NULL DEFAULT 'Etc/UTC',
  UNIQUE (owner_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS archive_timeline_owner_occurred_idx ON archive_timeline_events(owner_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS archive_history_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  subject text,
  period text,
  content text,
  reflection text,
  tags text[] NOT NULL DEFAULT '{}',
  studied_at timestamptz NOT NULL,
  category text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  status mezip_archive_entry_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS archive_history_owner_studied_idx ON archive_history_entries(owner_id, studied_at DESC);

CREATE TABLE IF NOT EXISTS archive_fitness_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  session_type text NOT NULL CHECK (session_type IN ('STRENGTH', 'CARDIO', 'RUNNING', 'WALKING', 'CYCLING', 'OTHER')),
  occurred_at timestamptz NOT NULL,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  distance_metres integer CHECK (distance_metres IS NULL OR distance_metres >= 0),
  exercises jsonb NOT NULL DEFAULT '[]'::jsonb,
  body_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  status mezip_archive_entry_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS archive_fitness_owner_occurred_idx ON archive_fitness_sessions(owner_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS archive_body_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  measured_at timestamptz NOT NULL,
  weight_grams integer CHECK (weight_grams IS NULL OR weight_grams >= 0),
  body_fat_basis_points integer CHECK (body_fat_basis_points IS NULL OR body_fat_basis_points >= 0),
  waist_millimetres integer CHECK (waist_millimetres IS NULL OR waist_millimetres >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS archive_body_metrics_owner_idx ON archive_body_metrics(owner_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS archive_step_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  day date NOT NULL,
  steps integer NOT NULL CHECK (steps >= 0),
  source mezip_archive_step_source NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, day)
);

CREATE TABLE IF NOT EXISTS archive_daily_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  day date NOT NULL,
  summary text,
  entry_ids uuid[] NOT NULL DEFAULT '{}',
  history_ids uuid[] NOT NULL DEFAULT '{}',
  fitness_ids uuid[] NOT NULL DEFAULT '{}',
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  status mezip_archive_entry_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, day)
);

CREATE TABLE IF NOT EXISTS archive_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  storage_key text NOT NULL UNIQUE,
  content_type text NOT NULL,
  extension text,
  bytes bigint NOT NULL CHECK (bytes >= 0),
  sha256 text,
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  duration_ms bigint CHECK (duration_ms IS NULL OR duration_ms >= 0),
  status mezip_archive_media_status NOT NULL DEFAULT 'UPLOADING',
  quarantine_reason text,
  scan_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  original_filename text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS archive_media_owner_idx ON archive_media_assets(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS archive_media_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  media_id uuid NOT NULL REFERENCES archive_media_assets(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, media_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS archive_storage_usage (
  owner_id uuid PRIMARY KEY REFERENCES users(id),
  used_bytes bigint NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  quota_bytes bigint NOT NULL DEFAULT 52428800 CHECK (quota_bytes >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS archive_offline_mutations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  client_mutation_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  operation text NOT NULL,
  payload jsonb NOT NULL,
  base_revision integer,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPLIED', 'CONFLICT', 'FAILED')),
  conflict_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, client_mutation_id)
);

CREATE TABLE IF NOT EXISTS archive_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  expected_revision integer NOT NULL,
  actual_revision integer NOT NULL,
  local_payload jsonb NOT NULL,
  server_payload jsonb NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS archive_idempotency_keys (
  owner_id uuid NOT NULL REFERENCES users(id),
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, operation, idempotency_key)
);

-- Every Phase 3 table is tenant-scoped.  The application must set
-- mezip.principal_id transaction-locally before querying or mutating data.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'life_entries','life_revisions','life_published_snapshots','life_ai_insights',
    'archive_timeline_events','archive_history_entries','archive_fitness_sessions',
    'archive_body_metrics','archive_step_records','archive_daily_packs',
    'archive_media_assets','archive_media_links','archive_storage_usage',
    'archive_offline_mutations','archive_conflicts','archive_idempotency_keys'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON %I USING (owner_id = current_setting(''mezip.principal_id'', true)::uuid) WITH CHECK (owner_id = current_setting(''mezip.principal_id'', true)::uuid)',
        table_name || '_owner_policy', table_name
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
