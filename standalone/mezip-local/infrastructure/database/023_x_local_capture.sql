-- ME.zip X Local Capture — additive owner-scoped action layer.
-- This stores explicit user actions and metadata only; it never stores cookies,
-- passwords, OAuth tokens, private X responses, or scraped page bodies.
BEGIN;

CREATE TABLE IF NOT EXISTS x_capture_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'X' CHECK (platform = 'X'),
  action_type text NOT NULL CHECK (action_type IN ('like','unlike','bookmark','unbookmark','opened','viewed','copied_link','share_to_mezip','manual_save','add_note')),
  post_url text NOT NULL CHECK (post_url ~ '^https://(www\.)?(x\.com|twitter\.com)/'),
  post_id text,
  author_handle text,
  page_title text,
  captured_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('X_OFFICIAL_API','LOCAL_CAPTURE','MANUAL_IMPORT','SHARE_EXTENSION')),
  device text,
  browser text,
  note text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tags) = 'array'),
  sync_status text NOT NULL CHECK (sync_status IN ('LOCAL_ONLY','PENDING_ENRICHMENT','ENRICHED','FAILED','NOT_REQUIRED')),
  event_fingerprint text NOT NULL CHECK (event_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, event_fingerprint)
);

CREATE TABLE IF NOT EXISTS x_content_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_url text NOT NULL CHECK (post_url ~ '^https://(www\.)?(x\.com|twitter\.com)/'),
  post_id text,
  author_handle text,
  page_title text,
  text_excerpt text,
  media jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(media) = 'array'),
  official_data_status text NOT NULL CHECK (official_data_status IN ('UNAVAILABLE','PENDING','AVAILABLE','FAILED')),
  official_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, post_url)
);

CREATE TABLE IF NOT EXISTS x_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capture_event_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  provider text NOT NULL DEFAULT 'X' CHECK (provider = 'X'),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, capture_event_id) REFERENCES x_capture_events(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS x_capture_settings (
  owner_user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  capture_likes boolean NOT NULL DEFAULT true,
  capture_bookmarks boolean NOT NULL DEFAULT true,
  capture_views boolean NOT NULL DEFAULT true,
  capture_shared_links boolean NOT NULL DEFAULT true,
  save_page_metadata boolean NOT NULL DEFAULT true,
  auto_sync boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS x_capture_owner_time_idx ON x_capture_events (owner_user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS x_capture_owner_action_time_idx ON x_capture_events (owner_user_id, action_type, captured_at DESC);
CREATE INDEX IF NOT EXISTS x_capture_owner_url_idx ON x_capture_events (owner_user_id, post_url);
CREATE INDEX IF NOT EXISTS x_sync_jobs_owner_created_idx ON x_sync_jobs (owner_user_id, created_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['x_capture_events','x_content_cache','x_sync_jobs','x_capture_settings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

-- Consumer roles receive no raw-table policies. The owner-scoped service boundary
-- must bind the transaction principal and apply owner predicates before reading.
COMMIT;
