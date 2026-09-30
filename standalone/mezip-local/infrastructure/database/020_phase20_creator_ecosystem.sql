-- ME.zip Phase 20 — additive Creator Ecosystem completion.
-- The existing Phase 10 creator_projects/workspace/release tables remain the
-- canonical project, source and release records. These tables add profile,
-- publication, immutable snapshot, media and authorization metadata only.
-- All consumer-facing access must go through the owner-scoped service; no
-- consumer RLS policies are created for private/raw project data.

BEGIN;

CREATE TABLE IF NOT EXISTS creator_profiles (
  owner_user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE CHECK (username ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  avatar_media_id uuid,
  bio text,
  profile_visibility text NOT NULL DEFAULT 'PRIVATE' CHECK (profile_visibility IN ('PUBLIC', 'PRIVATE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (bio IS NULL OR length(bio) <= 1000)
);

CREATE TABLE IF NOT EXISTS creator_project_publication_settings (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  slug text,
  cover_media_id uuid,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (cardinality(tags) <= 20),
  technologies text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (cardinality(technologies) <= 30),
  lifecycle text NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle IN ('DRAFT', 'ACTIVE', 'PREVIEW_READY', 'RELEASE_READY', 'PUBLISHED', 'ARCHIVED')),
  project_visibility text NOT NULL DEFAULT 'PRIVATE' CHECK (project_visibility IN ('PRIVATE', 'UNLISTED', 'PUBLIC')),
  source_visibility text NOT NULL DEFAULT 'PRIVATE' CHECK (source_visibility IN ('PRIVATE', 'OWNER_ONLY', 'ENTITLEMENT_GATED', 'PUBLIC')),
  download_visibility text NOT NULL DEFAULT 'DISABLED' CHECK (download_visibility IN ('DISABLED', 'OWNER_ONLY', 'ENTITLEMENT_GATED', 'PUBLIC')),
  demo_visibility text NOT NULL DEFAULT 'DISABLED' CHECK (demo_visibility IN ('DISABLED', 'PRIVATE', 'ENTITLEMENT_GATED', 'PUBLIC')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, project_id),
  UNIQUE (slug),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE,
  CHECK (slug IS NULL OR slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE IF NOT EXISTS creator_project_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  media_id uuid NOT NULL,
  media_kind text NOT NULL CHECK (media_kind IN ('COVER', 'SCREENSHOT')),
  caption text,
  position integer NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE,
  CHECK (caption IS NULL OR length(caption) <= 320)
);
CREATE UNIQUE INDEX IF NOT EXISTS creator_project_one_cover_idx ON creator_project_media (owner_user_id, project_id) WHERE media_kind = 'COVER';

CREATE TABLE IF NOT EXISTS creator_published_project_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  release_id uuid,
  project_name text NOT NULL CHECK (length(project_name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  cover_media_id uuid,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  technologies text[] NOT NULL DEFAULT ARRAY[]::text[],
  screenshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  demo_status text NOT NULL CHECK (demo_status IN ('NOT_AVAILABLE', 'BUILDING', 'READY', 'FAILED', 'EXPIRED', 'DISABLED', 'ENTITLEMENT_REQUIRED')),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id, release_id) REFERENCES creator_releases(owner_user_id, id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS creator_project_download_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES release_assets(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS creator_project_stats (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  project_views bigint NOT NULL DEFAULT 0 CHECK (project_views >= 0),
  project_saves bigint NOT NULL DEFAULT 0 CHECK (project_saves >= 0),
  demo_opens bigint NOT NULL DEFAULT 0 CHECK (demo_opens >= 0),
  downloads bigint NOT NULL DEFAULT 0 CHECK (downloads >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, project_id),
  FOREIGN KEY (owner_user_id, project_id) REFERENCES creator_projects(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS creator_ecosystem_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  project_id uuid REFERENCES creator_projects(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('PROFILE_WRITE', 'PROJECT_METADATA_WRITE', 'PROJECT_PUBLISH', 'PROJECT_UNPUBLISH', 'SOURCE_READ', 'DOWNLOAD_GRANT', 'SAVE', 'FOLLOW', 'PROJECT_VIEW')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_public_project_discovery_idx ON creator_project_publication_settings (project_visibility, lifecycle, updated_at DESC);
CREATE INDEX IF NOT EXISTS creator_snapshot_project_published_idx ON creator_published_project_snapshots (owner_user_id, project_id, published_at DESC);
CREATE INDEX IF NOT EXISTS creator_download_grants_expiry_idx ON creator_project_download_grants (expires_at);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'creator_profiles', 'creator_project_publication_settings',
    'creator_project_media', 'creator_published_project_snapshots',
    'creator_project_download_grants', 'creator_project_stats',
    'creator_ecosystem_audit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

-- Production requires explicit service-role grants and a reviewed repository.
-- No direct consumer policy is intentional: source, token, stats and private
-- project metadata must not be queryable around the API authorization checks.

COMMIT;
