-- ME.zip Phase 3 root-access and publication foundation.
--
-- This migration deliberately keeps platform administration separate from
-- consumer membership.  It adds the minimum server-side records needed by an
-- Admin Command Center, an append-only access trail, and explicit Channel
-- publication.  It does not recreate `benefit_grants` (that table is owned by
-- 002_auth_identity_sessions.sql).
--
-- The application must set the following transaction-local settings only after
-- authenticating an Admin Command Center session:
--   mezip.principal_id
--   mezip.admin_identity_id
--   mezip.admin_session_verified = 'true'
-- A browser/mobile client must never be allowed to set these values directly.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Existing Phase 3 installations used a provisional plan-coded visibility
-- check.  Replace it with the independent ordinary visibility vocabulary;
-- membership plans remain entitlement inputs and never become privacy states.
DO $$
BEGIN
  IF to_regclass('life_published_snapshots') IS NOT NULL THEN
    ALTER TABLE life_published_snapshots
      DROP CONSTRAINT IF EXISTS life_published_snapshots_visibility_check;
    -- A pre-foundation database may contain provisional plan-coded rows. Keep
    -- them in the non-delivered publication state before tightening the
    -- constraint; no plan code is retained as an ordinary visibility value.
    UPDATE life_published_snapshots
      SET visibility = 'SNAPSHOT'
      WHERE visibility IN ('FREE', 'GO', 'PLUS', 'PRO', 'PRO_MAX');
    ALTER TABLE life_published_snapshots
      ADD CONSTRAINT life_published_snapshots_visibility_check
      CHECK (visibility IN ('PRIVATE', 'SNAPSHOT', 'COMMUNITY', 'GROUP', 'DIRECT_SHARE', 'PUBLIC'));
  END IF;
END $$;

-- The root owner is provisioned out-of-band by the deployment owner. Keeping
-- it in a singleton server table prevents a consumer role field from creating
-- or transferring the only Original Developer Root identity.
CREATE TABLE IF NOT EXISTS root_owner_identity (
  singleton_id smallint PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  provisioned_at timestamptz NOT NULL DEFAULT now(),
  provisioned_by_user_id uuid REFERENCES users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE root_owner_identity ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE TYPE mezip_admin_type AS ENUM (
    'ORIGINAL_DEVELOPER_ROOT',
    'ADMIN',
    'MODERATOR',
    'SUPPORT'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE mezip_admin_identity_status AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE mezip_admin_access_action AS ENUM (
    'VIEW_USER',
    'READ_PROFILE',
    'READ_LIFE',
    'READ_TIMELINE',
    'READ_HISTORY',
    'READ_FITNESS',
    'READ_BODY_METRICS',
    'READ_STEPS',
    'READ_DAILY_PACK',
    'READ_MEDIA',
    'READ_AI_USAGE',
    'READ_DEVICES',
    'READ_COMMUNITY',
    'READ_CHANNEL',
    'READ_MEMBERSHIP',
    'READ_SECURITY_METADATA',
    'READ_MESSAGE',
    'EXPORT_USER_DATA',
    'ADMIN_REVISION',
    'DELETE_USER_DATA'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE mezip_admin_access_action ADD VALUE IF NOT EXISTS 'READ_AI_USAGE';
ALTER TYPE mezip_admin_access_action ADD VALUE IF NOT EXISTS 'READ_DEVICES';
ALTER TYPE mezip_visibility ADD VALUE IF NOT EXISTS 'GROUP';
ALTER TYPE mezip_visibility ADD VALUE IF NOT EXISTS 'DIRECT_SHARE';
ALTER TYPE mezip_visibility ADD VALUE IF NOT EXISTS 'PUBLIC';

DO $$
BEGIN
  CREATE TYPE mezip_admin_environment AS ENUM ('DEVELOPMENT', 'STAGING', 'PRODUCTION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE mezip_channel_type AS ENUM (
    'OFFICIAL',
    'COMMUNITY',
    'BETA',
    'FEEDBACK',
    'EVENT',
    'CREATOR',
    'DEVELOPER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE mezip_channel_membership_status AS ENUM ('INVITED', 'ACTIVE', 'LEFT', 'REMOVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE mezip_channel_membership_role AS ENUM ('OWNER', 'MODERATOR', 'MEMBER', 'MUTED', 'BANNED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE mezip_channel_snapshot_status AS ENUM ('PUBLISHED', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Admin identity is intentionally not represented by a membership plan or a
-- mutable client-side role field.  The partial unique index applies to all
-- statuses, so revoking a root does not silently permit a second root.
CREATE TABLE IF NOT EXISTS admin_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  admin_type mezip_admin_type NOT NULL,
  status mezip_admin_identity_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_authenticated_at timestamptz,
  created_by_user_id uuid REFERENCES users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, admin_type)
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_identities_single_root_idx
  ON admin_identities (admin_type)
  WHERE admin_type = 'ORIGINAL_DEVELOPER_ROOT';

CREATE INDEX IF NOT EXISTS admin_identities_user_status_idx
  ON admin_identities (user_id, status);

CREATE OR REPLACE FUNCTION mezip_guard_root_owner_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.admin_type = 'ORIGINAL_DEVELOPER_ROOT' THEN
    RAISE EXCEPTION 'ORIGINAL_DEVELOPER_ROOT identity cannot be deleted'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP <> 'DELETE'
     AND NEW.admin_type = 'ORIGINAL_DEVELOPER_ROOT'
     AND NOT EXISTS (
    SELECT 1 FROM root_owner_identity roi WHERE roi.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Original Developer Root must match the provisioned root_owner_identity'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.admin_type = 'ORIGINAL_DEVELOPER_ROOT'
     AND (NEW.admin_type IS DISTINCT FROM OLD.admin_type OR NEW.user_id IS DISTINCT FROM OLD.user_id)
  THEN
    RAISE EXCEPTION 'Original Developer Root identity cannot be transferred'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.admin_type IS DISTINCT FROM 'ORIGINAL_DEVELOPER_ROOT'
     AND NEW.admin_type = 'ORIGINAL_DEVELOPER_ROOT'
  THEN
    RAISE EXCEPTION 'An existing admin identity cannot be promoted to Original Developer Root'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  CREATE TRIGGER admin_identities_root_owner_guard
    BEFORE INSERT OR UPDATE OF admin_type, user_id ON admin_identities
    FOR EACH ROW EXECUTE FUNCTION mezip_guard_root_owner_identity();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER admin_identities_root_delete_guard
    BEFORE DELETE ON admin_identities
    FOR EACH ROW EXECUTE FUNCTION mezip_guard_root_owner_identity();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Capabilities are a separate relation so read, write, delete, export, and
-- channel/benefit administration can be granted independently.  The
-- ROOT_BULK_EXPORT row is intentionally not auto-seeded; it is a separately
-- enabled high-risk capability.
CREATE TABLE IF NOT EXISTS admin_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_identity_id uuid NOT NULL REFERENCES admin_identities(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code IN (
    'ROOT_READ_USER_DATA',
    'ROOT_READ_SENSITIVE_DATA',
    'ROOT_READ_PRIVATE_MESSAGES',
    'ROOT_MODIFY_USER_DATA',
    'ROOT_DELETE_USER_DATA',
    'ROOT_EXPORT_USER_DATA',
    'ROOT_BULK_EXPORT',
    'ROOT_MANAGE_CHANNELS',
    'ROOT_MANAGE_MEMBERSHIP',
    'ROOT_MANAGE_ENTITLEMENTS',
    'ROOT_MANAGE_BENEFITS',
    'ROOT_MANAGE_FEATURE_FLAGS',
    'ROOT_VIEW_AUDIT'
  )),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by_admin_id uuid REFERENCES admin_identities(id),
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (admin_identity_id, code),
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

CREATE INDEX IF NOT EXISTS admin_capabilities_active_idx
  ON admin_capabilities (admin_identity_id, code)
  WHERE revoked_at IS NULL;

-- Every root read/export/modification is an independently attributable event.
-- `timestamp` is quoted because it is also a PostgreSQL type keyword; it is
-- intentionally retained as the API-facing audit timestamp.
CREATE TABLE IF NOT EXISTS admin_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admin_identities(id),
  target_user_id uuid NOT NULL REFERENCES users(id),
  resource_type text NOT NULL CHECK (length(btrim(resource_type)) BETWEEN 1 AND 120),
  resource_id uuid,
  action mezip_admin_access_action NOT NULL,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL CHECK (length(btrim(session_id)) BETWEEN 1 AND 512),
  ip_context text,
  device_context text,
  environment mezip_admin_environment NOT NULL DEFAULT 'PRODUCTION',
  -- `reason_optional` is the contract name; `reason` remains a concise
  -- compatibility alias for existing service adapters.
  reason_optional text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE admin_access_audit
  ADD COLUMN IF NOT EXISTS reason_optional text;
ALTER TABLE admin_access_audit
  ADD COLUMN IF NOT EXISTS reason text;

CREATE INDEX IF NOT EXISTS admin_access_audit_target_time_idx
  ON admin_access_audit (target_user_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS admin_access_audit_admin_time_idx
  ON admin_access_audit (admin_id, "timestamp" DESC);

-- Channels never point at a private source directly.  A channel post may carry
-- a selected channel snapshot, while a direct body is an explicit community
-- post.  Founder audience is orthogonal to ordinary user privacy.
CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  type mezip_channel_type NOT NULL,
  slug text NOT NULL CHECK (length(btrim(slug)) BETWEEN 1 AND 120),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  description text,
  visibility text NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN (
    'PRIVATE', 'COMMUNITY', 'GROUP', 'DIRECT_SHARE', 'PUBLIC'
  )),
  founder_audience text CHECK (founder_audience IS NULL OR founder_audience IN (
    'FOUNDER_PUBLIC', 'FOUNDER_FREE', 'FOUNDER_GO', 'FOUNDER_PLUS',
    'FOUNDER_PRO', 'FOUNDER_PRO_MAX'
  )),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (owner_id, slug)
);

CREATE INDEX IF NOT EXISTS channels_visibility_idx ON channels (visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS channels_type_idx ON channels (type, created_at DESC);

CREATE TABLE IF NOT EXISTS channel_memberships (
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role mezip_channel_membership_role NOT NULL DEFAULT 'MEMBER',
  status mezip_channel_membership_status NOT NULL DEFAULT 'ACTIVE',
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  invited_by_user_id uuid REFERENCES users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (channel_id, user_id),
  CHECK (left_at IS NULL OR left_at >= joined_at),
  CHECK (status <> 'ACTIVE' OR left_at IS NULL),
  CHECK (status IN ('LEFT', 'REMOVED') OR role <> 'BANNED')
);

CREATE INDEX IF NOT EXISTS channel_memberships_user_idx
  ON channel_memberships (user_id, status, joined_at DESC);

CREATE TABLE IF NOT EXISTS channel_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  source_owner_id uuid NOT NULL REFERENCES users(id),
  source_record_id uuid NOT NULL,
  source_revision integer NOT NULL CHECK (source_revision > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  selected_content jsonb NOT NULL CHECK (jsonb_typeof(selected_content) = 'object'),
  visibility text NOT NULL CHECK (visibility IN ('COMMUNITY', 'GROUP', 'DIRECT_SHARE', 'PUBLIC')),
  founder_audience text CHECK (founder_audience IS NULL OR founder_audience IN (
    'FOUNDER_PUBLIC', 'FOUNDER_FREE', 'FOUNDER_GO', 'FOUNDER_PLUS',
    'FOUNDER_PRO', 'FOUNDER_PRO_MAX'
  )),
  published_by_user_id uuid REFERENCES users(id),
  published_by_admin_id uuid REFERENCES admin_identities(id),
  status mezip_channel_snapshot_status NOT NULL DEFAULT 'PUBLISHED',
  published_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (channel_id, source_record_id, version),
  CHECK (published_by_user_id IS NOT NULL OR published_by_admin_id IS NOT NULL),
  CHECK (revoked_at IS NULL OR revoked_at >= published_at),
  CHECK (
    (status = 'REVOKED' AND revoked_at IS NOT NULL)
    OR (status = 'PUBLISHED' AND revoked_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS channel_snapshots_channel_time_idx
  ON channel_snapshots (channel_id, published_at DESC);
CREATE INDEX IF NOT EXISTS channel_snapshots_source_idx
  ON channel_snapshots (source_owner_id, source_record_id, version DESC);

CREATE TABLE IF NOT EXISTS channel_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id),
  snapshot_id uuid REFERENCES channel_snapshots(id),
  body text,
  visibility text NOT NULL DEFAULT 'COMMUNITY' CHECK (visibility IN (
    'COMMUNITY', 'GROUP', 'DIRECT_SHARE', 'PUBLIC'
  )),
  moderation_status text NOT NULL DEFAULT 'VISIBLE' CHECK (moderation_status IN (
    'VISIBLE', 'PENDING', 'HIDDEN', 'REMOVED'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (snapshot_id IS NOT NULL OR length(btrim(coalesce(body, ''))) > 0)
);

CREATE INDEX IF NOT EXISTS channel_posts_channel_time_idx
  ON channel_posts (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS channel_posts_author_time_idx
  ON channel_posts (author_id, created_at DESC);

-- Small, SECURITY DEFINER helpers keep policy checks from recursively querying
-- the same RLS-protected tables.  The Admin API must establish the settings
-- transaction-locally after a stronger root/session authentication step.
CREATE OR REPLACE FUNCTION mezip_setting_uuid(setting_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  raw_value text;
BEGIN
  raw_value := NULLIF(current_setting(setting_name, true), '');
  IF raw_value IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN raw_value::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION mezip_current_admin_identity_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT mezip_setting_uuid('mezip.admin_identity_id');
$$;

CREATE OR REPLACE FUNCTION mezip_admin_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admin_identities ai
    WHERE ai.id = mezip_current_admin_identity_id()
      AND ai.admin_type = 'ORIGINAL_DEVELOPER_ROOT'
      AND ai.status = 'ACTIVE'
      AND current_setting('mezip.admin_session_verified', true) = 'true'
  );
$$;

CREATE OR REPLACE FUNCTION mezip_admin_has_capability(required_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT mezip_admin_is_active()
    AND EXISTS (
      SELECT 1
      FROM admin_capabilities ac
      WHERE ac.admin_identity_id = mezip_current_admin_identity_id()
        AND ac.code = required_capability
        AND ac.revoked_at IS NULL
    );
$$;

-- Ordinary ADMIN/MODERATOR/SUPPORT identities can never receive a ROOT_
-- capability, even if a privileged SQL caller accidentally targets the
-- capability table directly.  Root identity assignment remains a controlled
-- bootstrap concern; this trigger only enforces the separation invariant.
CREATE OR REPLACE FUNCTION mezip_guard_root_capability_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  identity_type mezip_admin_type;
BEGIN
  SELECT ai.admin_type INTO identity_type
  FROM admin_identities ai
  WHERE ai.id = NEW.admin_identity_id;
  IF NEW.code LIKE 'ROOT_%'
     AND identity_type IS DISTINCT FROM 'ORIGINAL_DEVELOPER_ROOT' THEN
    RAISE EXCEPTION 'ROOT capabilities may only be granted to ORIGINAL_DEVELOPER_ROOT'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  CREATE TRIGGER admin_capabilities_root_only
    BEFORE INSERT OR UPDATE OF admin_identity_id, code ON admin_capabilities
    FOR EACH ROW EXECUTE FUNCTION mezip_guard_root_capability_grant();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- A root identity is provisioned through controlled bootstrap, but once it is
-- provisioned it receives the independent capabilities needed by the Admin API.
-- This does not create a second root and does not grant root capabilities to
-- ADMIN/MODERATOR/SUPPORT identities.
CREATE OR REPLACE FUNCTION mezip_seed_root_capabilities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.admin_type = 'ORIGINAL_DEVELOPER_ROOT' THEN
    INSERT INTO admin_capabilities (admin_identity_id, code, granted_by_admin_id)
    SELECT NEW.id, capability.capability_code, NEW.id
    FROM unnest(ARRAY[
      'ROOT_READ_USER_DATA',
      'ROOT_READ_SENSITIVE_DATA',
      'ROOT_READ_PRIVATE_MESSAGES',
      'ROOT_MODIFY_USER_DATA',
      'ROOT_DELETE_USER_DATA',
      'ROOT_EXPORT_USER_DATA',
      'ROOT_MANAGE_CHANNELS',
      'ROOT_MANAGE_MEMBERSHIP',
      'ROOT_MANAGE_ENTITLEMENTS',
      'ROOT_MANAGE_BENEFITS',
      'ROOT_MANAGE_FEATURE_FLAGS',
      'ROOT_VIEW_AUDIT'
    ]::text[]) AS capability(capability_code)
    ON CONFLICT (admin_identity_id, code) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  CREATE TRIGGER admin_identities_seed_root_capabilities
    AFTER INSERT OR UPDATE OF admin_type ON admin_identities
    FOR EACH ROW EXECUTE FUNCTION mezip_seed_root_capabilities();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Access audit is append-oriented.  Revoking UPDATE/DELETE/TRUNCATE from
-- PUBLIC is defense in depth; the trigger also protects against table-owner
-- mistakes and accidental maintenance jobs.
CREATE OR REPLACE FUNCTION mezip_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin_access_audit is append-oriented; % is not permitted', TG_OP
    USING ERRCODE = '42501';
END;
$$;

DO $$
BEGIN
  CREATE TRIGGER admin_access_audit_no_update_delete
    BEFORE UPDATE OR DELETE ON admin_access_audit
    FOR EACH ROW EXECUTE FUNCTION mezip_reject_audit_mutation();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER admin_access_audit_no_truncate
    BEFORE TRUNCATE ON admin_access_audit
    FOR EACH STATEMENT EXECUTE FUNCTION mezip_reject_audit_mutation();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

REVOKE UPDATE, DELETE, TRUNCATE ON admin_access_audit FROM PUBLIC;

-- A published snapshot is immutable content.  Revocation is the only allowed
-- state transition; a new selected version must be inserted instead of
-- silently changing an existing community post.
CREATE OR REPLACE FUNCTION mezip_guard_channel_snapshot_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'REVOKED' AND NEW.status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'a revoked channel snapshot cannot be restored; publish a new version'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.channel_id IS DISTINCT FROM OLD.channel_id
     OR NEW.source_owner_id IS DISTINCT FROM OLD.source_owner_id
     OR NEW.source_record_id IS DISTINCT FROM OLD.source_record_id
     OR NEW.source_revision IS DISTINCT FROM OLD.source_revision
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.selected_content IS DISTINCT FROM OLD.selected_content
     OR NEW.visibility IS DISTINCT FROM OLD.visibility
     OR NEW.founder_audience IS DISTINCT FROM OLD.founder_audience
     OR NEW.published_by_user_id IS DISTINCT FROM OLD.published_by_user_id
     OR NEW.published_by_admin_id IS DISTINCT FROM OLD.published_by_admin_id
     OR NEW.published_at IS DISTINCT FROM OLD.published_at
  THEN
    RAISE EXCEPTION 'channel_snapshots are immutable; publish a new version'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mezip_validate_channel_snapshot_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- A consumer publication must originate from the same owner.  An Admin API
  -- publication is explicitly attributed to `published_by_admin_id` instead.
  IF NEW.published_by_admin_id IS NULL
     AND NEW.published_by_user_id IS DISTINCT FROM NEW.source_owner_id
  THEN
    RAISE EXCEPTION 'a user may publish only their own record snapshot'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  CREATE TRIGGER channel_snapshots_owner_publication_guard
    BEFORE INSERT OR UPDATE OF source_owner_id, published_by_user_id, published_by_admin_id
    ON channel_snapshots
    FOR EACH ROW EXECUTE FUNCTION mezip_validate_channel_snapshot_publication();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER channel_snapshots_immutable_content
    BEFORE UPDATE ON channel_snapshots
    FOR EACH ROW EXECUTE FUNCTION mezip_guard_channel_snapshot_update();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- A post carrying a snapshot must point to a snapshot in the same channel.
CREATE OR REPLACE FUNCTION mezip_validate_channel_post_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  snapshot_channel_id uuid;
BEGIN
  IF NEW.snapshot_id IS NOT NULL THEN
    SELECT cs.channel_id INTO snapshot_channel_id
    FROM channel_snapshots cs
    WHERE cs.id = NEW.snapshot_id;
    IF snapshot_channel_id IS NULL OR snapshot_channel_id <> NEW.channel_id THEN
      RAISE EXCEPTION 'channel post snapshot must belong to the same channel'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  CREATE TRIGGER channel_posts_snapshot_channel_check
    BEFORE INSERT OR UPDATE OF channel_id, snapshot_id ON channel_posts
    FOR EACH ROW EXECUTE FUNCTION mezip_validate_channel_post_snapshot();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION mezip_channel_is_public(candidate_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM channels c
    WHERE c.id = candidate_channel_id
      AND c.archived_at IS NULL
      AND c.visibility = 'PUBLIC'
  );
$$;

CREATE OR REPLACE FUNCTION mezip_channel_member(candidate_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM channel_memberships cm
    WHERE cm.channel_id = candidate_channel_id
      AND cm.user_id = mezip_setting_uuid('mezip.principal_id')
      AND cm.status = 'ACTIVE'
      AND cm.role <> 'BANNED'
  );
$$;

-- Admin identity/capability rows are only exposed through the Admin API
-- session.  There is deliberately no ordinary-user policy on these tables.
ALTER TABLE admin_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_access_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY admin_identities_self_or_root_read ON admin_identities
    FOR SELECT USING (
      id = mezip_current_admin_identity_id()
      OR mezip_admin_has_capability('ROOT_VIEW_AUDIT')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY admin_capabilities_self_or_root_read ON admin_capabilities
    FOR SELECT USING (
      admin_identity_id = mezip_current_admin_identity_id()
      OR mezip_admin_has_capability('ROOT_MANAGE_ENTITLEMENTS')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY admin_access_audit_insert_server_only ON admin_access_audit
    FOR INSERT WITH CHECK (
      mezip_admin_is_active()
      AND admin_id = mezip_current_admin_identity_id()
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY admin_access_audit_read_authorized ON admin_access_audit
    FOR SELECT USING (
      admin_id = mezip_current_admin_identity_id()
      OR mezip_admin_has_capability('ROOT_VIEW_AUDIT')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_posts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY channels_read_visible ON channels
    FOR SELECT USING (
      visibility = 'PUBLIC'
      OR owner_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_channel_member(id)
      OR mezip_admin_has_capability('ROOT_READ_USER_DATA')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY channels_owner_or_root_write ON channels
    USING (
      owner_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MANAGE_CHANNELS')
    )
    WITH CHECK (
      owner_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MANAGE_CHANNELS')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY channel_memberships_read_self_or_channel ON channel_memberships
    FOR SELECT USING (
      user_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_channel_member(channel_id)
      OR mezip_admin_has_capability('ROOT_READ_USER_DATA')
      OR EXISTS (
        SELECT 1 FROM channels c
        WHERE c.id = channel_memberships.channel_id
          AND c.owner_id = mezip_setting_uuid('mezip.principal_id')
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY channel_memberships_self_or_owner_write ON channel_memberships
    USING (
      user_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MANAGE_MEMBERSHIP')
      OR EXISTS (
        SELECT 1 FROM channels c
        WHERE c.id = channel_memberships.channel_id
          AND c.owner_id = mezip_setting_uuid('mezip.principal_id')
      )
    )
    WITH CHECK (
      user_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MANAGE_MEMBERSHIP')
      OR EXISTS (
        SELECT 1 FROM channels c
        WHERE c.id = channel_memberships.channel_id
          AND c.owner_id = mezip_setting_uuid('mezip.principal_id')
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY channel_snapshots_read_visible ON channel_snapshots
    FOR SELECT USING (
      mezip_channel_is_public(channel_id)
      OR mezip_channel_member(channel_id)
      OR source_owner_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_READ_USER_DATA')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY channel_snapshots_publish_explicitly ON channel_snapshots
    FOR INSERT WITH CHECK (
      source_owner_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MANAGE_CHANNELS')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY channel_snapshots_revoke_authorized ON channel_snapshots
    FOR UPDATE USING (
      source_owner_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MANAGE_CHANNELS')
    )
    WITH CHECK (
      source_owner_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MANAGE_CHANNELS')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY channel_posts_read_visible ON channel_posts
    FOR SELECT USING (
      mezip_channel_is_public(channel_id)
      OR mezip_channel_member(channel_id)
      OR author_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_READ_USER_DATA')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY channel_posts_explicit_author_write ON channel_posts
    USING (
      author_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MANAGE_CHANNELS')
    )
    WITH CHECK (
      author_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MANAGE_CHANNELS')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Extend the existing archive RLS with read-only root policies.  No root write
-- policy is added here: modification/deletion requires separate capabilities,
-- an Admin API reason, and an ADMIN_REVISION audit path.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'private_records',
    'ai_sessions',
    'life_entries',
    'life_revisions',
    'life_published_snapshots',
    'life_ai_insights',
    'archive_timeline_events',
    'archive_history_entries',
    'archive_fitness_sessions',
    'archive_step_records',
    'archive_daily_packs',
    'archive_media_links',
    'archive_storage_usage',
    'archive_offline_mutations',
    'archive_conflicts',
    'archive_idempotency_keys'
  ] LOOP
    IF to_regclass(table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
      BEGIN
        EXECUTE format(
          'CREATE POLICY %I ON %I FOR SELECT USING (mezip_admin_has_capability(''ROOT_READ_USER_DATA''))',
          table_name || '_root_read_policy', table_name
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['media_assets', 'archive_media_assets', 'archive_body_metrics'] LOOP
    IF to_regclass(table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
      BEGIN
        EXECUTE format(
          'CREATE POLICY %I ON %I FOR SELECT USING (mezip_admin_has_capability(''ROOT_READ_SENSITIVE_DATA''))',
          table_name || '_root_sensitive_read_policy', table_name
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('benefit_grants') IS NOT NULL THEN
    BEGIN
      CREATE POLICY benefit_grants_root_manage_policy ON benefit_grants
        FOR SELECT USING (mezip_admin_has_capability('ROOT_MANAGE_BENEFITS'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
