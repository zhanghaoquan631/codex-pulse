-- ME.zip Phase 13 — official social connector and curated external archive foundation.
-- Additive only. No scraping, cookie/session import, raw OAuth token, provider
-- response body, or copied third-party media is stored by this schema.
BEGIN;

CREATE TABLE IF NOT EXISTS external_social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('X','DOUYIN','MANUAL_LINK')),
  external_account_id text NOT NULL CHECK (length(external_account_id) BETWEEN 1 AND 300),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 500),
  username text,
  avatar_reference text,
  status text NOT NULL CHECK (status IN ('CONNECTED','EXPIRED','REAUTH_REQUIRED','REVOKED','DISCONNECTED','ERROR')),
  connected_at timestamptz,
  last_synced_at timestamptz,
  consent_version text NOT NULL CHECK (length(consent_version) BETWEEN 1 AND 100),
  requested_scopes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(requested_scopes) = 'array'),
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(capabilities) = 'array'),
  auto_sync boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (provider, external_account_id)
);

CREATE TABLE IF NOT EXISTS social_provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('X','DOUYIN')),
  ciphertext bytea NOT NULL,
  key_reference text NOT NULL CHECK (key_reference ~ '^(vault|kms|secret)://'),
  key_version integer NOT NULL CHECK (key_version >= 1),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  UNIQUE (owner_user_id, account_id),
  FOREIGN KEY (owner_user_id, account_id) REFERENCES external_social_accounts(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_connector_capabilities (
  provider text NOT NULL CHECK (provider IN ('X','DOUYIN','MANUAL_LINK')),
  capability text NOT NULL CHECK (capability IN ('PROFILE_READ','POST_READ','MEDIA_READ','PUBLISH','LIKES_READ','BOOKMARKS_READ','FAVORITES_READ','COLLECTION_READ','ANALYTICS_READ')),
  status text NOT NULL CHECK (status IN ('SUPPORTED','UNSUPPORTED','NOT_VERIFIED')),
  credential_required boolean NOT NULL DEFAULT true,
  notes text NOT NULL CHECK (length(notes) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, capability)
);

CREATE TABLE IF NOT EXISTS social_oauth_states (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('X','DOUYIN')),
  redirect_uri text NOT NULL,
  code_challenge text,
  consent_version text NOT NULL,
  requested_scopes jsonb NOT NULL CHECK (jsonb_typeof(requested_scopes) = 'array'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE TABLE IF NOT EXISTS social_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('X','DOUYIN','MANUAL_LINK')),
  type text NOT NULL CHECK (type IN ('INITIAL','INCREMENTAL','MANUAL')),
  status text NOT NULL CHECK (status IN ('QUEUED','RUNNING','SUCCESS','PARTIAL','FAILED','CANCELLED','RATE_LIMITED')),
  cursor text,
  started_at timestamptz,
  completed_at timestamptz,
  items_seen integer NOT NULL DEFAULT 0 CHECK (items_seen >= 0),
  items_imported integer NOT NULL DEFAULT 0 CHECK (items_imported >= 0),
  items_updated integer NOT NULL DEFAULT 0 CHECK (items_updated >= 0),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  error_code text,
  retry_after_seconds integer CHECK (retry_after_seconds IS NULL OR retry_after_seconds >= 0),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, idempotency_key),
  FOREIGN KEY (owner_user_id, account_id) REFERENCES external_social_accounts(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_sync_cursors (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  provider_cursor text,
  last_synced_at timestamptz,
  next_sync_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, account_id),
  FOREIGN KEY (owner_user_id, account_id) REFERENCES external_social_accounts(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_archive_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('X','DOUYIN','MANUAL_LINK')),
  external_account_id text,
  external_content_id text,
  content_type text NOT NULL CHECK (content_type IN ('POST','VIDEO','IMAGE','LINK','THREAD','PROFILE_REFERENCE','MANUAL_SAVE')),
  canonical_url text NOT NULL CHECK (canonical_url ~ '^https?://'),
  text_excerpt text,
  published_at timestamptz,
  saved_at timestamptz NOT NULL DEFAULT now(),
  sync_source text NOT NULL CHECK (sync_source IN ('OFFICIAL_API','MANUAL_LINK','USER_IMPORT','PUBLISHED_SNAPSHOT')),
  visibility text NOT NULL CHECK (visibility IN ('PRIVATE','COMMUNITY','GROUP','PUBLIC')) DEFAULT 'PRIVATE',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  content_hash text CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  content_status text NOT NULL CHECK (content_status IN ('AVAILABLE','SOURCE_DELETED','SOURCE_PRIVATE','SOURCE_UNAVAILABLE','UNKNOWN')) DEFAULT 'UNKNOWN',
  personal_note text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tags) = 'array'),
  is_founder_curated boolean NOT NULL DEFAULT false,
  founder_audience text CHECK (founder_audience IS NULL OR founder_audience IN ('PUBLIC','FREE','GO','PLUS','PRO','PRO_MAX')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, provider, external_account_id, external_content_id)
);

CREATE TABLE IF NOT EXISTS social_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text,
  visibility text NOT NULL CHECK (visibility IN ('PRIVATE','PUBLIC')) DEFAULT 'PRIVATE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS social_collection_items (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id uuid NOT NULL,
  archive_item_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, collection_id, archive_item_id),
  FOREIGN KEY (owner_user_id, collection_id) REFERENCES social_collections(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, archive_item_id) REFERENCES social_archive_items(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archive_item_id uuid NOT NULL,
  target text NOT NULL CHECK (target IN ('COMMUNITY','GROUP','PROFILE','PUBLIC')),
  visibility text NOT NULL CHECK (visibility IN ('COMMUNITY','GROUP','PUBLIC')),
  status text NOT NULL CHECK (status IN ('PENDING','PUBLISHED','FAILED','HIDDEN')),
  snapshot_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, archive_item_id) REFERENCES social_archive_items(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_external_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  archive_item_id uuid NOT NULL,
  account_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('X','DOUYIN')),
  status text NOT NULL CHECK (status IN ('PENDING','PUBLISHED','FAILED','NOT_SUPPORTED')),
  provider_post_id text,
  canonical_url text,
  published_at timestamptz,
  error_code text,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, archive_item_id) REFERENCES social_archive_items(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, account_id) REFERENCES external_social_accounts(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_connector_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  provider text CHECK (provider IS NULL OR provider IN ('X','DOUYIN','MANUAL_LINK')),
  action text NOT NULL,
  status text NOT NULL CHECK (status IN ('SUCCESS','FAILED')),
  request_id text,
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  error_class text,
  rate_limit_metadata jsonb CHECK (rate_limit_metadata IS NULL OR jsonb_typeof(rate_limit_metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_archive_owner_saved_idx ON social_archive_items (owner_user_id, saved_at DESC);
CREATE INDEX IF NOT EXISTS social_archive_owner_provider_idx ON social_archive_items (owner_user_id, provider, saved_at DESC);
CREATE INDEX IF NOT EXISTS social_jobs_owner_created_idx ON social_import_jobs (owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS social_events_owner_occurred_idx ON social_connector_events (owner_user_id, occurred_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'external_social_accounts', 'social_provider_credentials', 'social_connector_capabilities',
    'social_oauth_states', 'social_import_jobs', 'social_sync_cursors', 'social_archive_items',
    'social_collections', 'social_collection_items', 'social_publish_jobs',
    'social_external_publications', 'social_connector_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

-- Consumer roles receive no raw-table policies. The reviewed owner-scoped
-- repository/service role is the only production path and must be granted
-- explicitly during deployment rehearsal.
COMMIT;
