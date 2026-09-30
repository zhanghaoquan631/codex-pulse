-- ME.zip Phase 1 identity/auth extension.
-- Additive and migration-safe: this migration extends the existing `users`
-- table and never creates provider-specific user tables. Apply through the
-- reviewed migration runner after 001_initial_schema.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE mezip_auth_provider AS ENUM ('WECHAT', 'PHONE', 'EMAIL', 'GOOGLE', 'APPLE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE mezip_otp_purpose AS ENUM ('SIGN_IN', 'LINK_IDENTITY', 'RECOVERY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE mezip_otp_status AS ENUM ('PENDING', 'CONSUMED', 'EXPIRED', 'LOCKED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE mezip_session_status AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE mezip_account_deletion_status AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE mezip_email_delivery_status AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE mezip_refresh_token_status AS ENUM ('ACTIVE', 'USED', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- One user can have many verified identities. Email/phone values are stored as
-- a keyed digest and a display hint; raw OTP destinations are never persisted.
CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  provider mezip_auth_provider NOT NULL,
  subject_hash text NOT NULL,
  subject_hint text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  verified_at timestamptz,
  last_used_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject_hash)
);
CREATE INDEX IF NOT EXISTS auth_identities_user_idx ON auth_identities(user_id, status);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider mezip_auth_provider NOT NULL CHECK (provider IN ('PHONE', 'EMAIL')),
  purpose mezip_otp_purpose NOT NULL DEFAULT 'SIGN_IN',
  user_id uuid REFERENCES users(id),
  destination_hash text NOT NULL,
  destination_hint text NOT NULL,
  code_hash text NOT NULL,
  code_salt text NOT NULL,
  status mezip_otp_status NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  expires_at timestamptz NOT NULL,
  resend_available_at timestamptz NOT NULL,
  consumed_at timestamptz,
  requester_ip_hash text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_challenges_destination_idx ON otp_challenges(provider, destination_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS otp_challenges_user_idx ON otp_challenges(user_id, created_at DESC);

-- Refresh tokens are represented only by keyed digests. A rotated token row is
-- retained as USED so replay can revoke the whole device session.
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  device_id uuid REFERENCES devices(id),
  platform text NOT NULL,
  device_label text,
  refresh_token_hash text NOT NULL UNIQUE,
  previous_refresh_token_hash text,
  status mezip_session_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id, status, last_seen_at DESC);

-- Keep a one-way record for every rotation, not only the current token. A
-- replay of any previously used token can therefore revoke its device session.
CREATE TABLE IF NOT EXISTS session_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  status mezip_refresh_token_status NOT NULL DEFAULT 'ACTIVE',
  issued_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS session_refresh_tokens_session_idx ON session_refresh_tokens(session_id, status, issued_at DESC);

CREATE TABLE IF NOT EXISTS consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  accepted_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consent_records_user_idx ON consent_records(user_id, accepted_at DESC);

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  status mezip_account_deletion_status NOT NULL DEFAULT 'REQUESTED',
  reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_for timestamptz,
  processing_started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS account_deletion_requests_user_idx ON account_deletion_requests(user_id, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_open_user_idx
  ON account_deletion_requests(user_id)
  WHERE status IN ('REQUESTED', 'PROCESSING');

CREATE TABLE IF NOT EXISTS email_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  otp_challenge_id uuid REFERENCES otp_challenges(id),
  provider_message_id text,
  status mezip_email_delivery_status NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  raw_event jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS email_delivery_events_challenge_idx ON email_delivery_events(otp_challenge_id, event_at DESC);

-- Reserved Benefits architecture. These tables are intentionally additive: they do not
-- replace plans/prices and cannot widen owner or Founder snapshot scope.
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS benefit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  benefit_type text NOT NULL DEFAULT 'CAPABILITY',
  capability text NOT NULL CHECK (capability IN (
    'ARCHIVE_PRIVATE', 'MEDIA_BASIC', 'TIMELINE_PRIVATE', 'HISTORY_PRIVATE',
    'FITNESS_PRIVATE', 'MOVEMENT_BASIC', 'AI_USAGE_BASIC', 'STATS_BASIC',
    'PROFILE_SELF', 'DATA_EXPORT', 'COMMUNITY_READ', 'COMMUNITY_POST',
    'COMMUNITY_COMMENT', 'COMMUNITY_GROUP', 'FOUNDER_DM', 'FOUNDER_PRIORITY_INBOX',
    'FOUNDER_PRO_FEED', 'VIBE_CODING', 'CODE_HUB', 'SOURCE_DOWNLOAD',
    'RELEASE_DOWNLOAD', 'ADVANCED_ANALYTICS', 'MEDIA_STORAGE_PLUS'
  )),
  -- `entitlement` is a future-compatible alias for capability-specific grants;
  -- keep it nullable while the Phase 1 resolver uses `capability` as its code.
  entitlement text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  reason text,
  operator_id uuid REFERENCES users(id),
  source text NOT NULL CHECK (source IN ('GIFT', 'SINGLE_BENEFIT', 'CAMPAIGN', 'TEMPORARY', 'GRAY_ROLLOUT', 'FOUNDER', 'PROMO', 'TRIAL')),
  campaign_id uuid REFERENCES campaigns(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  revoked_at timestamptz,
  idempotency_key text NOT NULL UNIQUE,
  audit_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS benefit_grants_user_window_idx ON benefit_grants(user_id, capability, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  capability text NOT NULL CHECK (capability IN (
    'ARCHIVE_PRIVATE', 'MEDIA_BASIC', 'TIMELINE_PRIVATE', 'HISTORY_PRIVATE',
    'FITNESS_PRIVATE', 'MOVEMENT_BASIC', 'AI_USAGE_BASIC', 'STATS_BASIC',
    'PROFILE_SELF', 'DATA_EXPORT', 'COMMUNITY_READ', 'COMMUNITY_POST',
    'COMMUNITY_COMMENT', 'COMMUNITY_GROUP', 'FOUNDER_DM', 'FOUNDER_PRIORITY_INBOX',
    'FOUNDER_PRO_FEED', 'VIBE_CODING', 'CODE_HUB', 'SOURCE_DOWNLOAD',
    'RELEASE_DOWNLOAD', 'ADVANCED_ANALYTICS', 'MEDIA_STORAGE_PLUS'
  )),
  campaign_id uuid REFERENCES campaigns(id),
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'EXPIRED')),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES coupons(id),
  user_id uuid NOT NULL REFERENCES users(id),
  benefit_grant_id uuid REFERENCES benefit_grants(id),
  idempotency_key text NOT NULL UNIQUE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, user_id)
);

ALTER TABLE auth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE benefit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY auth_identities_owner_policy ON auth_identities
    USING (user_id = current_setting('mezip.principal_id', true)::uuid)
    WITH CHECK (user_id = current_setting('mezip.principal_id', true)::uuid);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY benefit_grants_owner_policy ON benefit_grants
    USING (user_id = current_setting('mezip.principal_id', true)::uuid)
    WITH CHECK (user_id = current_setting('mezip.principal_id', true)::uuid);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY redemptions_owner_policy ON redemptions
    USING (user_id = current_setting('mezip.principal_id', true)::uuid)
    WITH CHECK (user_id = current_setting('mezip.principal_id', true)::uuid);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY user_sessions_owner_policy ON user_sessions
    USING (user_id = current_setting('mezip.principal_id', true)::uuid)
    WITH CHECK (user_id = current_setting('mezip.principal_id', true)::uuid);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY session_refresh_tokens_owner_policy ON session_refresh_tokens
    USING (EXISTS (
      SELECT 1 FROM user_sessions
      WHERE user_sessions.id = session_refresh_tokens.session_id
        AND user_sessions.user_id = current_setting('mezip.principal_id', true)::uuid
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM user_sessions
      WHERE user_sessions.id = session_refresh_tokens.session_id
        AND user_sessions.user_id = current_setting('mezip.principal_id', true)::uuid
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY consent_records_owner_policy ON consent_records
    USING (user_id = current_setting('mezip.principal_id', true)::uuid)
    WITH CHECK (user_id = current_setting('mezip.principal_id', true)::uuid);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY account_deletion_requests_owner_policy ON account_deletion_requests
    USING (user_id = current_setting('mezip.principal_id', true)::uuid)
    WITH CHECK (user_id = current_setting('mezip.principal_id', true)::uuid);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
