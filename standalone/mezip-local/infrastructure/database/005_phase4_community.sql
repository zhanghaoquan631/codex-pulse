-- ME.zip Phase 4 Community persistence.
--
-- This migration is additive and is intentionally not a deployment script.
-- Apply it only after 001_initial_schema.sql, 002_auth_identity_sessions.sql,
-- 003_phase3_archive.sql, and 004_root_access_channels.sql have been reviewed
-- and applied by the database owner.  Consumer clients never set the
-- transaction-local settings used by the policies below.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Keep Founder audience orthogonal to ordinary visibility.  The ordinary
-- visibility column below never stores a membership plan code.
CREATE TABLE IF NOT EXISTS published_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entry_id uuid NOT NULL REFERENCES life_entries(id),
  owner_id uuid NOT NULL REFERENCES users(id),
  source_revision integer NOT NULL CHECK (source_revision > 0),
  selected_field_keys text[] NOT NULL DEFAULT '{}',
  selected_media_ids uuid[] NOT NULL DEFAULT '{}',
  selected_content jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(selected_content) = 'object'),
  visibility text NOT NULL DEFAULT 'SNAPSHOT' CHECK (visibility IN (
    'SNAPSHOT', 'PRIVATE', 'COMMUNITY', 'GROUP', 'DIRECT_SHARE', 'PUBLIC'
  )),
  founder_audience text CHECK (founder_audience IS NULL OR founder_audience IN (
    'FOUNDER_PUBLIC', 'FOUNDER_FREE', 'FOUNDER_GO', 'FOUNDER_PLUS',
    'FOUNDER_PRO', 'FOUNDER_PRO_MAX'
  )),
  status text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED', 'REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK ((status = 'PUBLISHED' AND revoked_at IS NULL) OR
         (status = 'REVOKED' AND revoked_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS published_snapshots_owner_time_idx
  ON published_snapshots (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS published_snapshots_source_revision_idx
  ON published_snapshots (source_entry_id, source_revision DESC);

CREATE OR REPLACE FUNCTION mezip_guard_published_snapshot_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'REVOKED' AND NEW.status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'a revoked Published Snapshot cannot be restored; publish a new version'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.source_entry_id IS DISTINCT FROM OLD.source_entry_id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.source_revision IS DISTINCT FROM OLD.source_revision
     OR NEW.selected_field_keys IS DISTINCT FROM OLD.selected_field_keys
     OR NEW.selected_media_ids IS DISTINCT FROM OLD.selected_media_ids
     OR NEW.selected_content IS DISTINCT FROM OLD.selected_content
     OR NEW.visibility IS DISTINCT FROM OLD.visibility
     OR NEW.founder_audience IS DISTINCT FROM OLD.founder_audience
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Published Snapshots are immutable; create a new snapshot instead'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'PUBLISHED' AND NEW.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'a published snapshot cannot have revoked_at'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  CREATE TRIGGER published_snapshots_immutable
    BEFORE UPDATE ON published_snapshots
    FOR EACH ROW EXECUTE FUNCTION mezip_guard_published_snapshot_immutable();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The Phase 0 `community_posts` table is retained as a compatibility table.
-- These columns make its publication and moderation boundary explicit without
-- replacing the existing table or mutating private archive rows.
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS published_snapshot_id uuid;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS group_id uuid;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS channel_id uuid;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS activity_id uuid;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS founder_audience text;
-- The Phase 0 compatibility column is still NOT NULL. Give new Phase 4
-- posts a neutral channel value while the typed channel_id carries routing.
ALTER TABLE community_posts ALTER COLUMN channel SET DEFAULT 'community';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_posts_published_snapshot_fk'
  ) THEN
    ALTER TABLE community_posts
      ADD CONSTRAINT community_posts_published_snapshot_fk
      FOREIGN KEY (published_snapshot_id) REFERENCES published_snapshots(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_posts_group_fk'
  ) AND to_regclass('community_groups') IS NOT NULL THEN
    ALTER TABLE community_posts
      ADD CONSTRAINT community_posts_group_fk FOREIGN KEY (group_id) REFERENCES community_groups(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_posts_channel_fk'
  ) THEN
    ALTER TABLE community_posts
      ADD CONSTRAINT community_posts_channel_fk FOREIGN KEY (channel_id) REFERENCES channels(id);
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE community_posts DROP CONSTRAINT IF EXISTS community_posts_visibility_check;
  ALTER TABLE community_posts DROP CONSTRAINT IF EXISTS community_posts_visibility_chk;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_posts_ordinary_visibility_check'
  ) THEN
    ALTER TABLE community_posts ADD CONSTRAINT community_posts_ordinary_visibility_check
      CHECK (visibility IN ('PRIVATE', 'COMMUNITY', 'GROUP', 'DIRECT_SHARE', 'PUBLIC'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_posts_status_check'
  ) THEN
    ALTER TABLE community_posts ADD CONSTRAINT community_posts_status_check
      CHECK (status IN ('DRAFT', 'PUBLISHED', 'HIDDEN', 'REMOVED', 'DELETED'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_posts_founder_audience_check'
  ) THEN
    ALTER TABLE community_posts ADD CONSTRAINT community_posts_founder_audience_check
      CHECK (founder_audience IS NULL OR founder_audience IN (
        'FOUNDER_PUBLIC', 'FOUNDER_FREE', 'FOUNDER_GO', 'FOUNDER_PLUS',
        'FOUNDER_PRO', 'FOUNDER_PRO_MAX'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS community_posts_feed_idx
  ON community_posts (visibility, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS community_posts_group_idx
  ON community_posts (group_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS community_posts_channel_idx
  ON community_posts (channel_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS community_posts_snapshot_idx
  ON community_posts (published_snapshot_id);

-- One row per direct-share recipient keeps recipient visibility explicit and
-- avoids placing recipient lists in an opaque request/body field.
CREATE TABLE IF NOT EXISTS community_post_recipients (
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, recipient_user_id)
);

CREATE OR REPLACE FUNCTION mezip_validate_direct_share_recipient()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  post_visibility text;
  post_author uuid;
BEGIN
  SELECT visibility, author_id INTO post_visibility, post_author
    FROM community_posts WHERE id = NEW.post_id;
  IF post_visibility IS DISTINCT FROM 'DIRECT_SHARE' THEN
    RAISE EXCEPTION 'recipients are only valid for DIRECT_SHARE posts' USING ERRCODE = '23514';
  END IF;
  IF NEW.recipient_user_id IS NOT DISTINCT FROM post_author THEN
    RAISE EXCEPTION 'a DIRECT_SHARE post cannot target its author' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  CREATE TRIGGER community_post_recipient_visibility_guard
    BEFORE INSERT OR UPDATE ON community_post_recipients
    FOR EACH ROW EXECUTE FUNCTION mezip_validate_direct_share_recipient();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS post_reactions (
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type text NOT NULL DEFAULT 'LIKE' CHECK (reaction_type IN ('LIKE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (post_id, user_id, reaction_type)
);
CREATE INDEX IF NOT EXISTS post_reactions_user_time_idx
  ON post_reactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_posts (
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS saved_posts_user_time_idx
  ON saved_posts (user_id, created_at DESC);

ALTER TABLE comments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE comments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PUBLISHED';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_status_check') THEN
    ALTER TABLE comments ADD CONSTRAINT comments_status_check
      CHECK (status IN ('PUBLISHED', 'HIDDEN', 'REMOVED', 'DELETED'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS comments_post_time_idx ON comments (post_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS comments_parent_time_idx ON comments (parent_id, created_at ASC, id ASC);

-- Canonical Phase 4 names are user_follows/user_blocks in the contract.  The
-- Phase 0 `follows`/`blocks` relations are equivalent and remain authoritative;
-- add the cursor indexes and policies below instead of copying their rows.
CREATE INDEX IF NOT EXISTS follows_followed_time_idx ON follows (followed_id, created_at DESC);
CREATE INDEX IF NOT EXISTS blocks_blocked_time_idx ON blocks (blocked_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text,
  avatar_media_id uuid,
  bio text,
  profile_visibility text NOT NULL DEFAULT 'PUBLIC' CHECK (profile_visibility IN ('PRIVATE', 'PUBLIC')),
  follow_permission text NOT NULL DEFAULT 'EVERYONE' CHECK (follow_permission IN ('EVERYONE', 'NOBODY')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_profiles_visibility_idx
  ON community_profiles (profile_visibility, updated_at DESC);

CREATE TABLE IF NOT EXISTS community_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  description text,
  avatar_media_id uuid,
  cover_media_id uuid,
  visibility text NOT NULL CHECK (visibility IN ('PUBLIC', 'PRIVATE', 'INVITE_ONLY')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS community_groups_discovery_idx
  ON community_groups (visibility, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS community_groups_owner_idx
  ON community_groups (owner_id, status, created_at DESC);

-- The table may already exist in an earlier Phase 4 rehearsal with a narrower
-- status check. Keep legacy SUSPENDED rows readable, while allowing the
-- service's canonical soft-delete state.
DO $$
BEGIN
  ALTER TABLE community_groups DROP CONSTRAINT IF EXISTS community_groups_status_check;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_groups_status_check'
  ) THEN
    ALTER TABLE community_groups ADD CONSTRAINT community_groups_status_check
      CHECK (status IN ('ACTIVE', 'ARCHIVED', 'SUSPENDED', 'DELETED'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_posts_group_fk'
  ) THEN
    ALTER TABLE community_posts
      ADD CONSTRAINT community_posts_group_fk
      FOREIGN KEY (group_id) REFERENCES community_groups(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS group_memberships (
  group_id uuid NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'MUTED', 'BANNED')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING', 'INVITED', 'ACTIVE', 'LEFT', 'REMOVED', 'BANNED')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  invited_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id),
  CHECK (left_at IS NULL OR left_at >= joined_at),
  CHECK (role <> 'OWNER' OR status = 'ACTIVE')
);
CREATE INDEX IF NOT EXISTS group_memberships_user_idx
  ON group_memberships (user_id, status, joined_at DESC);
CREATE INDEX IF NOT EXISTS group_memberships_group_idx
  ON group_memberships (group_id, status, joined_at ASC);

CREATE TABLE IF NOT EXISTS group_posts (
  post_id uuid PRIMARY KEY REFERENCES community_posts(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, post_id)
);
CREATE INDEX IF NOT EXISTS group_posts_group_time_idx
  ON group_posts (group_id, created_at DESC, post_id DESC);

CREATE OR REPLACE FUNCTION mezip_validate_community_post_snapshot_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  snapshot_owner uuid;
BEGIN
  IF NEW.published_snapshot_id IS NOT NULL THEN
    SELECT owner_id INTO snapshot_owner
      FROM published_snapshots WHERE id = NEW.published_snapshot_id;
    IF snapshot_owner IS NULL OR snapshot_owner IS DISTINCT FROM NEW.author_id THEN
      RAISE EXCEPTION 'a Community post may reference only its author''s Published Snapshot'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  CREATE TRIGGER community_posts_snapshot_owner_guard
    BEFORE INSERT OR UPDATE OF author_id, published_snapshot_id ON community_posts
    FOR EACH ROW EXECUTE FUNCTION mezip_validate_community_post_snapshot_owner();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id),
  group_id uuid REFERENCES community_groups(id),
  channel_id uuid REFERENCES channels(id),
  kind text NOT NULL CHECK (kind IN ('ONLINE', 'OFFLINE', 'WORKSHOP', 'MEETUP', 'CHALLENGE', 'OTHER')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  timezone text NOT NULL,
  location_text text,
  online_url text,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  visibility text NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PRIVATE', 'COMMUNITY', 'GROUP', 'DIRECT_SHARE', 'PUBLIC')),
  founder_audience text CHECK (founder_audience IS NULL OR founder_audience IN (
    'FOUNDER_PUBLIC', 'FOUNDER_FREE', 'FOUNDER_GO', 'FOUNDER_PLUS',
    'FOUNDER_PRO', 'FOUNDER_PRO_MAX'
  )),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at IS NULL OR end_at >= start_at)
);
CREATE INDEX IF NOT EXISTS activities_discovery_idx
  ON activities (visibility, status, start_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS activities_creator_idx
  ON activities (creator_id, status, start_at DESC);

-- Align the durable check constraints with the typed service contract. The
-- older rehearsal values remain accepted for existing rows; new clients use
-- ONLINE/OFFLINE/COMMUNITY/FOUNDER/GROUP and DELETED for soft removal.
DO $$
BEGIN
  ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_kind_check;
  ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_status_check;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activities_kind_check'
  ) THEN
    ALTER TABLE activities ADD CONSTRAINT activities_kind_check
      CHECK (kind IN (
        'ONLINE', 'OFFLINE', 'COMMUNITY', 'FOUNDER', 'GROUP',
        'WORKSHOP', 'MEETUP', 'CHALLENGE', 'OTHER'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activities_status_check'
  ) THEN
    ALTER TABLE activities ADD CONSTRAINT activities_status_check
      CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED', 'DELETED'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS activity_registrations (
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED', 'WAITLISTED')),
  registered_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  PRIMARY KEY (activity_id, user_id),
  CHECK ((status = 'CANCELLED' AND cancelled_at IS NOT NULL) OR
         (status <> 'CANCELLED' AND cancelled_at IS NULL))
);
CREATE INDEX IF NOT EXISTS activity_registrations_user_idx
  ON activity_registrations (user_id, status, registered_at DESC);
CREATE INDEX IF NOT EXISTS activity_registrations_activity_idx
  ON activity_registrations (activity_id, status, registered_at ASC);

-- The lock in this function makes capacity admission atomic.  Callers must
-- execute it in the same transaction as the registration response.
CREATE OR REPLACE FUNCTION mezip_register_activity(
  candidate_activity_id uuid,
  candidate_user_id uuid
)
RETURNS activity_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  activity_row activities%ROWTYPE;
  registration_row activity_registrations%ROWTYPE;
  active_count integer;
BEGIN
  IF candidate_user_id IS DISTINCT FROM mezip_setting_uuid('mezip.principal_id')
     AND NOT mezip_admin_has_capability('ROOT_MANAGE_MEMBERSHIP') THEN
    RAISE EXCEPTION 'activity registration principal mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO activity_row FROM activities WHERE id = candidate_activity_id FOR UPDATE;
  IF NOT FOUND OR activity_row.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'activity unavailable' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO registration_row
    FROM activity_registrations
    WHERE activity_id = candidate_activity_id AND user_id = candidate_user_id
    FOR UPDATE;
  IF FOUND AND registration_row.status = 'ACTIVE' THEN
    RETURN registration_row;
  END IF;
  IF activity_row.capacity IS NOT NULL THEN
    SELECT count(*) INTO active_count
      FROM activity_registrations
      WHERE activity_id = candidate_activity_id AND status = 'ACTIVE';
    IF active_count >= activity_row.capacity THEN
      RAISE EXCEPTION 'activity capacity reached' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  INSERT INTO activity_registrations (activity_id, user_id, status, registered_at, cancelled_at)
    VALUES (candidate_activity_id, candidate_user_id, 'ACTIVE', now(), NULL)
    ON CONFLICT (activity_id, user_id) DO UPDATE
      SET status = 'ACTIVE', registered_at = now(), cancelled_at = NULL
    RETURNING * INTO registration_row;
  RETURN registration_row;
END;
$$;

CREATE TABLE IF NOT EXISTS community_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id),
  notification_type text NOT NULL CHECK (notification_type IN (
    'REACTION', 'COMMENT', 'REPLY', 'FOLLOW', 'GROUP_INVITE', 'GROUP_APPROVED',
    'ACTIVITY_UPDATE', 'MODERATION', 'SYSTEM'
  )),
  resource_type text,
  resource_id uuid,
  summary text NOT NULL CHECK (length(summary) <= 500),
  status text NOT NULL DEFAULT 'UNREAD' CHECK (status IN ('UNREAD', 'READ')),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS community_notifications_recipient_idx
  ON community_notifications (recipient_user_id, status, created_at DESC, id DESC);

-- Reports retain the reporter only in the protected table.  Existing reports
-- are extended rather than copied so existing moderation integrations remain
-- valid.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_target_type_check') THEN
    ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
      CHECK (target_type IN ('POST', 'COMMENT', 'USER', 'GROUP', 'CHANNEL', 'ACTIVITY'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS reports_status_time_idx ON reports (status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS reports_target_idx ON reports (target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES reports(id),
  target_type text NOT NULL CHECK (target_type IN ('POST', 'COMMENT', 'USER', 'GROUP', 'CHANNEL', 'ACTIVITY')),
  target_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWING', 'ACTIONED', 'DISMISSED')),
  action text CHECK (action IS NULL OR action IN (
    'HIDE_CONTENT', 'REMOVE_CONTENT', 'WARN_USER', 'SUSPEND_USER',
    'BAN_USER', 'RESTORE_CONTENT'
  )),
  actor_admin_id uuid REFERENCES admin_identities(id),
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS moderation_cases_open_report_idx
  ON moderation_cases (report_id) WHERE status IN ('OPEN', 'REVIEWING');
CREATE INDEX IF NOT EXISTS moderation_cases_status_time_idx
  ON moderation_cases (status, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS community_idempotency_keys (
  principal_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation text NOT NULL,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 256),
  request_digest text NOT NULL,
  result_type text,
  result_id uuid,
  response_status integer NOT NULL DEFAULT 200,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (principal_user_id, operation, idempotency_key)
);
CREATE INDEX IF NOT EXISTS community_idempotency_expiry_idx
  ON community_idempotency_keys (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS community_snapshot_media_links (
  snapshot_id uuid NOT NULL REFERENCES published_snapshots(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES archive_media_assets(id),
  ordinal smallint NOT NULL CHECK (ordinal >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_id, media_id),
  UNIQUE (snapshot_id, ordinal)
);

-- 004 creates channel_posts before Founder audience enforcement was added.
-- Add the nullable policy column here so the replacement RLS below is valid
-- on both fresh and already-initialized databases.
ALTER TABLE channel_posts ADD COLUMN IF NOT EXISTS founder_audience text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_posts_founder_audience_check'
  ) THEN
    ALTER TABLE channel_posts ADD CONSTRAINT channel_posts_founder_audience_check
      CHECK (founder_audience IS NULL OR founder_audience IN (
        'FOUNDER_PUBLIC', 'FOUNDER_FREE', 'FOUNDER_GO', 'FOUNDER_PLUS',
        'FOUNDER_PRO', 'FOUNDER_PRO_MAX'
      ));
  END IF;
END $$;

-- 004's channel foundation predates the Phase 4 typed channel lifecycle.
-- Add the missing soft-delete fields additively so the service projection and
-- RLS can distinguish archived/deleted channels without replacing rows.
ALTER TYPE mezip_channel_membership_status ADD VALUE IF NOT EXISTS 'BANNED';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE channels ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
DO $$
BEGIN
  ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_status_check;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channels_status_check'
  ) THEN
    ALTER TABLE channels ADD CONSTRAINT channels_status_check
      CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETED'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS channels_status_idx ON channels (status, created_at DESC);

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
      AND c.status = 'ACTIVE'
      AND c.deleted_at IS NULL
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
    JOIN channels c ON c.id = cm.channel_id
    WHERE cm.channel_id = candidate_channel_id
      AND cm.user_id = mezip_setting_uuid('mezip.principal_id')
      AND cm.status = 'ACTIVE'
      AND cm.role <> 'BANNED'
      AND c.status = 'ACTIVE'
      AND c.deleted_at IS NULL
      AND c.archived_at IS NULL
  );
$$;

-- Founder audience is evaluated from the authenticated principal's active
-- subscription/explicit entitlement, never from a client-supplied plan field.
-- PUBLIC/FREE are the documented baseline audiences; paid audiences require
-- the corresponding active plan or entitlement grant.
CREATE OR REPLACE FUNCTION mezip_founder_audience_allowed(candidate_audience text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  principal_id uuid := mezip_setting_uuid('mezip.principal_id');
  plan_rank integer := 0;
  required_rank integer;
BEGIN
  IF candidate_audience IS NULL OR candidate_audience IN ('FOUNDER_PUBLIC', 'FOUNDER_FREE') THEN
    RETURN true;
  END IF;
  IF principal_id IS NULL THEN
    RETURN false;
  END IF;
  required_rank := CASE candidate_audience
    WHEN 'FOUNDER_GO' THEN 1
    WHEN 'FOUNDER_PLUS' THEN 2
    WHEN 'FOUNDER_PRO' THEN 3
    WHEN 'FOUNDER_PRO_MAX' THEN 4
    ELSE 99
  END;
  SELECT COALESCE(MAX(CASE s.plan_code
    WHEN 'FREE' THEN 0
    WHEN 'GO' THEN 1
    WHEN 'PLUS' THEN 2
    WHEN 'PRO' THEN 3
    WHEN 'PRO_MAX' THEN 4
    ELSE 0
  END), 0)
  INTO plan_rank
  FROM subscriptions s
  WHERE s.owner_id = principal_id
    AND s.status = 'ACTIVE'
    AND s.starts_at <= now()
    AND s.ends_at > now();
  IF plan_rank >= required_rank THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM entitlements e
    WHERE e.owner_id = principal_id
      AND e.code = candidate_audience
      AND e.valid_from <= now()
      AND (e.valid_until IS NULL OR e.valid_until > now())
      AND e.revoked_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION mezip_capability_allowed(candidate_capability text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  principal_id uuid := mezip_setting_uuid('mezip.principal_id');
  plan_rank integer := 0;
  required_rank integer;
BEGIN
  IF principal_id IS NULL THEN
    RETURN false;
  END IF;
  IF candidate_capability = 'COMMUNITY_READ' THEN
    RETURN true;
  END IF;
  required_rank := CASE candidate_capability
    WHEN 'COMMUNITY_INTERACT' THEN 1
    WHEN 'COMMUNITY_PUBLISH' THEN 1
    WHEN 'COMMUNITY_COMMENT' THEN 1
    WHEN 'COMMUNITY_FOLLOW' THEN 1
    WHEN 'COMMUNITY_SAVE' THEN 1
    WHEN 'COMMUNITY_POST' THEN 1
    WHEN 'COMMUNITY_GROUP' THEN 1
    WHEN 'GROUP_JOIN' THEN 1
    WHEN 'ACTIVITY_JOIN' THEN 1
    ELSE 99
  END;
  SELECT COALESCE(MAX(CASE s.plan_code
    WHEN 'FREE' THEN 0
    WHEN 'GO' THEN 1
    WHEN 'PLUS' THEN 2
    WHEN 'PRO' THEN 3
    WHEN 'PRO_MAX' THEN 4
    ELSE 0
  END), 0)
  INTO plan_rank
  FROM subscriptions s
  WHERE s.owner_id = principal_id
    AND s.status = 'ACTIVE'
    AND s.starts_at <= now()
    AND s.ends_at > now();
  RETURN plan_rank >= required_rank OR EXISTS (
    SELECT 1 FROM entitlements e
    WHERE e.owner_id = principal_id
      AND e.code = candidate_capability
      AND e.valid_from <= now()
      AND (e.valid_until IS NULL OR e.valid_until > now())
      AND e.revoked_at IS NULL
  );
END;
$$;

-- Safe, SECURITY DEFINER membership helpers avoid recursive RLS policy joins.
CREATE OR REPLACE FUNCTION mezip_group_is_public(candidate_group_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_groups g
    WHERE g.id = candidate_group_id AND g.status = 'ACTIVE' AND g.visibility = 'PUBLIC'
  );
$$;

CREATE OR REPLACE FUNCTION mezip_group_member(candidate_group_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_memberships gm
    WHERE gm.group_id = candidate_group_id
      AND gm.user_id = mezip_setting_uuid('mezip.principal_id')
      AND gm.status = 'ACTIVE'
      AND gm.role <> 'BANNED'
  );
$$;

CREATE OR REPLACE FUNCTION mezip_post_recipient(candidate_post_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_post_recipients r
    WHERE r.post_id = candidate_post_id
      AND r.recipient_user_id = mezip_setting_uuid('mezip.principal_id')
  );
$$;

-- Tenant policies.  A missing/invalid principal setting yields no ordinary
-- rows; Root reads use the separately authenticated Admin capability helper.
ALTER TABLE published_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_post_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_snapshot_media_links ENABLE ROW LEVEL SECURITY;

-- Re-running this additive migration must replace, rather than silently keep,
-- an earlier permissive policy definition. All drops occur in the migration
-- transaction and are immediately followed by the definitions below.
DROP POLICY IF EXISTS published_snapshots_owner_or_delivered_read ON published_snapshots;
DROP POLICY IF EXISTS published_snapshots_owner_insert ON published_snapshots;
DROP POLICY IF EXISTS community_posts_visible_read ON community_posts;
DROP POLICY IF EXISTS community_posts_author_or_root_write ON community_posts;
DROP POLICY IF EXISTS community_post_recipients_participant_read ON community_post_recipients;
DROP POLICY IF EXISTS community_post_recipients_author_write ON community_post_recipients;
DROP POLICY IF EXISTS post_reactions_participant_policy ON post_reactions;
DROP POLICY IF EXISTS saved_posts_owner_policy ON saved_posts;
DROP POLICY IF EXISTS comments_visible_policy ON comments;
DROP POLICY IF EXISTS comments_author_write_policy ON comments;
DROP POLICY IF EXISTS follows_participant_policy ON follows;
DROP POLICY IF EXISTS blocks_participant_policy ON blocks;
DROP POLICY IF EXISTS community_profiles_read_policy ON community_profiles;
DROP POLICY IF EXISTS community_profiles_owner_write_policy ON community_profiles;
DROP POLICY IF EXISTS community_groups_read_policy ON community_groups;
DROP POLICY IF EXISTS community_groups_owner_write_policy ON community_groups;
DROP POLICY IF EXISTS group_memberships_participant_policy ON group_memberships;
DROP POLICY IF EXISTS group_posts_read_policy ON group_posts;
DROP POLICY IF EXISTS group_posts_write_policy ON group_posts;
DROP POLICY IF EXISTS activities_read_policy ON activities;
DROP POLICY IF EXISTS activities_creator_write_policy ON activities;
DROP POLICY IF EXISTS activity_registrations_owner_read_write ON activity_registrations;
DROP POLICY IF EXISTS community_notifications_recipient_policy ON community_notifications;
DROP POLICY IF EXISTS reports_reporter_or_root_policy ON reports;
DROP POLICY IF EXISTS moderation_cases_root_policy ON moderation_cases;
DROP POLICY IF EXISTS community_idempotency_owner_policy ON community_idempotency_keys;
DROP POLICY IF EXISTS community_snapshot_media_owner_policy ON community_snapshot_media_links;

DO $$
BEGIN
  CREATE POLICY published_snapshots_owner_or_delivered_read ON published_snapshots
    FOR SELECT USING (
      owner_id = mezip_setting_uuid('mezip.principal_id')
      OR (status = 'PUBLISHED'
          AND mezip_founder_audience_allowed(founder_audience)
          AND (
            (visibility = 'PUBLIC' AND mezip_capability_allowed('COMMUNITY_READ'))
            OR (visibility = 'COMMUNITY' AND (
              mezip_capability_allowed('COMMUNITY_INTERACT')
              OR founder_audience IN ('FOUNDER_PUBLIC', 'FOUNDER_FREE')
            ))
            OR (visibility = 'GROUP' AND EXISTS (
              SELECT 1 FROM community_posts p
              WHERE p.published_snapshot_id = published_snapshots.id
                AND p.group_id IS NOT NULL
                AND mezip_group_member(p.group_id)
                AND mezip_capability_allowed('GROUP_JOIN')
            ))
            OR (visibility = 'DIRECT_SHARE' AND EXISTS (
              SELECT 1 FROM community_posts p
              WHERE p.published_snapshot_id = published_snapshots.id
                AND mezip_post_recipient(p.id)
                AND mezip_capability_allowed('COMMUNITY_INTERACT')
            ))
          ))
      OR mezip_admin_has_capability('ROOT_READ_USER_DATA')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY published_snapshots_owner_insert ON published_snapshots
    FOR INSERT WITH CHECK (owner_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MANAGE_CHANNELS'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY community_posts_visible_read ON community_posts
    FOR SELECT USING (
      status IN ('PUBLISHED', 'DRAFT') AND deleted_at IS NULL
      AND mezip_founder_audience_allowed(founder_audience)
      AND (
        author_id = mezip_setting_uuid('mezip.principal_id')
        OR (visibility = 'PUBLIC' AND mezip_capability_allowed('COMMUNITY_READ'))
        OR (visibility = 'COMMUNITY' AND (
          mezip_capability_allowed('COMMUNITY_INTERACT')
          OR founder_audience IN ('FOUNDER_PUBLIC', 'FOUNDER_FREE')
        ))
        OR (visibility = 'GROUP' AND group_id IS NOT NULL AND mezip_group_member(group_id)
            AND mezip_capability_allowed('GROUP_JOIN'))
        OR (visibility = 'DIRECT_SHARE' AND mezip_post_recipient(id)
            AND mezip_capability_allowed('COMMUNITY_INTERACT'))
        OR (channel_id IS NOT NULL AND mezip_channel_is_public(channel_id)
            AND mezip_capability_allowed('COMMUNITY_INTERACT'))
        OR (channel_id IS NOT NULL AND mezip_channel_member(channel_id)
            AND mezip_capability_allowed('COMMUNITY_INTERACT'))
        OR mezip_admin_has_capability('ROOT_READ_USER_DATA')
      )
    );
  CREATE POLICY community_posts_author_or_root_write ON community_posts
    USING (author_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MODIFY_USER_DATA'))
    WITH CHECK (author_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MODIFY_USER_DATA'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY community_post_recipients_participant_read ON community_post_recipients
    FOR SELECT USING (
      recipient_user_id = mezip_setting_uuid('mezip.principal_id')
      OR EXISTS (SELECT 1 FROM community_posts p
        WHERE p.id = post_id AND p.author_id = mezip_setting_uuid('mezip.principal_id'))
      OR mezip_admin_has_capability('ROOT_READ_USER_DATA')
    );
  CREATE POLICY community_post_recipients_author_write ON community_post_recipients
    USING (EXISTS (SELECT 1 FROM community_posts p
      WHERE p.id = post_id AND p.author_id = mezip_setting_uuid('mezip.principal_id')))
    WITH CHECK (EXISTS (SELECT 1 FROM community_posts p
      WHERE p.id = post_id AND p.author_id = mezip_setting_uuid('mezip.principal_id')));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY post_reactions_participant_policy ON post_reactions
    USING (user_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_READ_USER_DATA'))
    WITH CHECK (user_id = mezip_setting_uuid('mezip.principal_id'));
  CREATE POLICY saved_posts_owner_policy ON saved_posts
    USING (user_id = mezip_setting_uuid('mezip.principal_id'))
    WITH CHECK (user_id = mezip_setting_uuid('mezip.principal_id'));
  CREATE POLICY comments_visible_policy ON comments
    FOR SELECT USING (
      author_id = mezip_setting_uuid('mezip.principal_id')
      OR EXISTS (SELECT 1 FROM community_posts p
        WHERE p.id = post_id AND p.status = 'PUBLISHED' AND p.deleted_at IS NULL
          AND mezip_founder_audience_allowed(p.founder_audience)
          AND (p.visibility = 'PUBLIC' AND mezip_capability_allowed('COMMUNITY_READ')
            OR (p.visibility = 'COMMUNITY' AND (
              mezip_capability_allowed('COMMUNITY_INTERACT')
              OR p.founder_audience IN ('FOUNDER_PUBLIC', 'FOUNDER_FREE')
            ))
            OR p.author_id = mezip_setting_uuid('mezip.principal_id')
            OR (p.group_id IS NOT NULL AND mezip_group_member(p.group_id)
                AND mezip_capability_allowed('GROUP_JOIN'))
            OR (p.channel_id IS NOT NULL AND mezip_channel_member(p.channel_id)
                AND mezip_capability_allowed('COMMUNITY_INTERACT'))
            OR (p.visibility = 'DIRECT_SHARE' AND mezip_post_recipient(p.id)
                AND mezip_capability_allowed('COMMUNITY_INTERACT'))))
      OR mezip_admin_has_capability('ROOT_READ_USER_DATA')
    );
  CREATE POLICY comments_author_write_policy ON comments
    USING (author_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MODIFY_USER_DATA'))
    WITH CHECK (author_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MODIFY_USER_DATA'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY follows_participant_policy ON follows
    USING (follower_id = mezip_setting_uuid('mezip.principal_id')
      OR followed_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_READ_USER_DATA'))
    WITH CHECK (follower_id = mezip_setting_uuid('mezip.principal_id'));
  CREATE POLICY blocks_participant_policy ON blocks
    USING (blocker_id = mezip_setting_uuid('mezip.principal_id')
      OR blocked_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_READ_USER_DATA'))
    WITH CHECK (blocker_id = mezip_setting_uuid('mezip.principal_id'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY community_profiles_read_policy ON community_profiles
    FOR SELECT USING (profile_visibility = 'PUBLIC'
      OR user_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_READ_USER_DATA'));
  CREATE POLICY community_profiles_owner_write_policy ON community_profiles
    USING (user_id = mezip_setting_uuid('mezip.principal_id'))
    WITH CHECK (user_id = mezip_setting_uuid('mezip.principal_id'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY community_groups_read_policy ON community_groups
      FOR SELECT USING (status = 'ACTIVE' AND (
        (visibility = 'PUBLIC' AND mezip_capability_allowed('GROUP_JOIN'))
        OR owner_id = mezip_setting_uuid('mezip.principal_id')
        OR mezip_group_member(id) OR mezip_admin_has_capability('ROOT_READ_USER_DATA')));
  CREATE POLICY community_groups_owner_write_policy ON community_groups
    USING (owner_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MODIFY_USER_DATA'))
    WITH CHECK (owner_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MODIFY_USER_DATA'));
  CREATE POLICY group_memberships_participant_policy ON group_memberships
    USING (user_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_group_member(group_id)
      OR mezip_admin_has_capability('ROOT_READ_USER_DATA'))
    WITH CHECK (user_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_group_member(group_id)
      OR mezip_admin_has_capability('ROOT_MANAGE_MEMBERSHIP'));
    CREATE POLICY group_posts_read_policy ON group_posts
      FOR SELECT USING (mezip_group_member(group_id)
        OR (mezip_capability_allowed('GROUP_JOIN') AND EXISTS (
          SELECT 1 FROM community_groups g WHERE g.id = group_id AND g.visibility = 'PUBLIC'))
        OR mezip_admin_has_capability('ROOT_READ_USER_DATA'));
  CREATE POLICY group_posts_write_policy ON group_posts
    USING (EXISTS (SELECT 1 FROM community_posts p
      WHERE p.id = post_id AND p.author_id = mezip_setting_uuid('mezip.principal_id'))
      OR mezip_admin_has_capability('ROOT_MODIFY_USER_DATA'))
    WITH CHECK (mezip_group_member(group_id)
      OR mezip_admin_has_capability('ROOT_MODIFY_USER_DATA'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY activities_read_policy ON activities
    FOR SELECT USING (
      creator_id = mezip_setting_uuid('mezip.principal_id')
      OR (status = 'PUBLISHED' AND mezip_founder_audience_allowed(founder_audience) AND (
        (visibility = 'PUBLIC' AND mezip_capability_allowed('COMMUNITY_READ'))
        OR (visibility = 'COMMUNITY' AND (
          mezip_capability_allowed('COMMUNITY_INTERACT')
          OR founder_audience IN ('FOUNDER_PUBLIC', 'FOUNDER_FREE')
        ))
        OR (group_id IS NOT NULL AND mezip_group_member(group_id)
            AND mezip_capability_allowed('GROUP_JOIN'))
        OR (channel_id IS NOT NULL AND mezip_channel_member(channel_id)
            AND mezip_capability_allowed('COMMUNITY_INTERACT'))
      ))
      OR mezip_admin_has_capability('ROOT_READ_USER_DATA'));
  CREATE POLICY activities_creator_write_policy ON activities
    USING (creator_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MODIFY_USER_DATA'))
    WITH CHECK (creator_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MODIFY_USER_DATA'));
  CREATE POLICY activity_registrations_owner_read_write ON activity_registrations
    USING (user_id = mezip_setting_uuid('mezip.principal_id')
      OR EXISTS (SELECT 1 FROM activities a
        WHERE a.id = activity_id AND a.creator_id = mezip_setting_uuid('mezip.principal_id'))
      OR mezip_admin_has_capability('ROOT_READ_USER_DATA'))
    WITH CHECK (user_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_MANAGE_MEMBERSHIP'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY community_notifications_recipient_policy ON community_notifications
    USING (recipient_user_id = mezip_setting_uuid('mezip.principal_id'))
    WITH CHECK (recipient_user_id = mezip_setting_uuid('mezip.principal_id'));
  CREATE POLICY reports_reporter_or_root_policy ON reports
    USING (reporter_id = mezip_setting_uuid('mezip.principal_id')
      OR mezip_admin_has_capability('ROOT_READ_USER_DATA'))
    WITH CHECK (reporter_id = mezip_setting_uuid('mezip.principal_id'));
  CREATE POLICY moderation_cases_root_policy ON moderation_cases
    USING (mezip_admin_has_capability('ROOT_READ_USER_DATA'))
    WITH CHECK (mezip_admin_has_capability('ROOT_MODIFY_USER_DATA'));
  CREATE POLICY community_idempotency_owner_policy ON community_idempotency_keys
    USING (principal_user_id = mezip_setting_uuid('mezip.principal_id'))
    WITH CHECK (principal_user_id = mezip_setting_uuid('mezip.principal_id'));
  CREATE POLICY community_snapshot_media_owner_policy ON community_snapshot_media_links
    USING (EXISTS (SELECT 1 FROM published_snapshots s
      WHERE s.id = snapshot_id AND (s.owner_id = mezip_setting_uuid('mezip.principal_id')
        OR mezip_admin_has_capability('ROOT_READ_USER_DATA'))))
    WITH CHECK (EXISTS (SELECT 1 FROM published_snapshots s
      WHERE s.id = snapshot_id AND (s.owner_id = mezip_setting_uuid('mezip.principal_id')
        OR mezip_admin_has_capability('ROOT_MANAGE_CHANNELS'))));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tighten the Phase 3 channel policies with the same Founder-audience gate.
-- Policies are permissive in PostgreSQL, so the compatibility policies from
-- 004 are replaced by name rather than supplemented with an ineffective OR.
DO $$
BEGIN
  IF to_regclass('channels') IS NOT NULL THEN
    DROP POLICY IF EXISTS channels_read_visible ON channels;
    CREATE POLICY channels_read_visible ON channels
      FOR SELECT USING (
        owner_id = mezip_setting_uuid('mezip.principal_id')
        OR mezip_admin_has_capability('ROOT_READ_USER_DATA')
        OR (mezip_founder_audience_allowed(founder_audience) AND (
          (
            (visibility = 'PUBLIC' AND mezip_capability_allowed('COMMUNITY_READ'))
            OR (visibility = 'COMMUNITY' AND (
              mezip_capability_allowed('COMMUNITY_INTERACT')
              OR founder_audience IN ('FOUNDER_PUBLIC', 'FOUNDER_FREE')
            ))
            OR mezip_channel_member(id)
          )
        ))
      );
  END IF;
  IF to_regclass('channel_snapshots') IS NOT NULL THEN
    DROP POLICY IF EXISTS channel_snapshots_read_visible ON channel_snapshots;
      CREATE POLICY channel_snapshots_read_visible ON channel_snapshots
      FOR SELECT USING (
        (source_owner_id = mezip_setting_uuid('mezip.principal_id') AND status IN ('PUBLISHED', 'REVOKED'))
        OR mezip_admin_has_capability('ROOT_READ_USER_DATA')
        OR (status = 'PUBLISHED' AND revoked_at IS NULL
          AND mezip_founder_audience_allowed(founder_audience) AND (
          (
            (mezip_channel_is_public(channel_id) AND mezip_capability_allowed('COMMUNITY_READ'))
            OR (NOT mezip_channel_is_public(channel_id) AND mezip_channel_member(channel_id))
            OR (mezip_channel_is_public(channel_id) AND (
              mezip_capability_allowed('COMMUNITY_INTERACT')
              OR founder_audience IN ('FOUNDER_PUBLIC', 'FOUNDER_FREE')
            ))
          )
        ))
      );
  END IF;
  IF to_regclass('channel_posts') IS NOT NULL THEN
    DROP POLICY IF EXISTS channel_posts_read_visible ON channel_posts;
      CREATE POLICY channel_posts_read_visible ON channel_posts
      FOR SELECT USING (
        author_id = mezip_setting_uuid('mezip.principal_id')
        OR mezip_admin_has_capability('ROOT_READ_USER_DATA')
        OR (
          deleted_at IS NULL
          AND moderation_status = 'VISIBLE'
          AND mezip_founder_audience_allowed(founder_audience)
          AND (
            (mezip_channel_is_public(channel_id) AND mezip_capability_allowed('COMMUNITY_READ'))
            OR (NOT mezip_channel_is_public(channel_id) AND mezip_channel_member(channel_id))
            OR (mezip_channel_is_public(channel_id) AND (
              mezip_capability_allowed('COMMUNITY_INTERACT')
              OR founder_audience IN ('FOUNDER_PUBLIC', 'FOUNDER_FREE')
            ))
          )
        )
      );
  END IF;
END $$;

-- A single audit/event row may be written by the service after a successful
-- mutation; this migration deliberately does not add a second messaging or
-- realtime subsystem.
