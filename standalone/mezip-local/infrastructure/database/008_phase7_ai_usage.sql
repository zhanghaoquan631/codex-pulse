-- ME.zip Phase 7 — privacy-first AI Usage tracking.
--
-- This schema intentionally has no column for prompts, responses, clipboard,
-- keyboard input, cookie/token material, DOM/page content, screenshots, raw
-- domains, or full URLs. All collector records are minimal usage metadata.

BEGIN;

-- Extend the existing Root capability vocabulary without changing the frozen
-- Phase 4 migration. This is a separate, audited metadata-read capability.
ALTER TABLE admin_capabilities
  DROP CONSTRAINT IF EXISTS admin_capabilities_code_check;
ALTER TABLE admin_capabilities
  ADD CONSTRAINT admin_capabilities_code_check CHECK (code IN (
    'ROOT_READ_USER_DATA',
    'ROOT_READ_SENSITIVE_DATA',
    'ROOT_READ_PRIVATE_MESSAGES',
    'ROOT_READ_AI_USAGE',
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
  ));

-- Existing provisioned Original Developer Root identities receive the new
-- separate capability. It remains impossible to grant any ROOT_* capability
-- to ordinary ADMIN/MODERATOR/SUPPORT identities due to the Phase 4 trigger.
INSERT INTO admin_capabilities (admin_identity_id, code, granted_by_admin_id)
SELECT ai.id, 'ROOT_READ_AI_USAGE', ai.id
FROM admin_identities ai
WHERE ai.admin_type = 'ORIGINAL_DEVELOPER_ROOT'
ON CONFLICT (admin_identity_id, code) DO NOTHING;

-- Keep the pre-existing root bootstrap trigger forward-compatible for a
-- freshly provisioned database as well as the already-provisioned case above.
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
      'ROOT_READ_AI_USAGE',
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

CREATE TABLE IF NOT EXISTS ai_usage_provider_registry (
  code text PRIMARY KEY CHECK (code IN ('OPENAI', 'ANTHROPIC', 'GOOGLE', 'MICROSOFT', 'OTHER')),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_usage_app_registry (
  code text PRIMARY KEY CHECK (code IN (
    'CHATGPT', 'CODEX', 'CLAUDE', 'CLAUDE_CODE', 'GEMINI', 'COPILOT',
    'CURSOR', 'PERPLEXITY', 'OTHER_AI'
  )),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  provider_code text NOT NULL REFERENCES ai_usage_provider_registry(code),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  allowed_device_types text[] NOT NULL DEFAULT ARRAY['WINDOWS_AGENT', 'BROWSER_EXTENSION']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(allowed_device_types) > 0),
  CHECK (allowed_device_types <@ ARRAY['WINDOWS_AGENT', 'BROWSER_EXTENSION']::text[])
);

INSERT INTO ai_usage_provider_registry (code, display_name) VALUES
  ('OPENAI', 'OpenAI'),
  ('ANTHROPIC', 'Anthropic'),
  ('GOOGLE', 'Google'),
  ('MICROSOFT', 'Microsoft'),
  ('OTHER', 'Other')
ON CONFLICT (code) DO NOTHING;

INSERT INTO ai_usage_app_registry (code, display_name, provider_code) VALUES
  ('CHATGPT', 'ChatGPT', 'OPENAI'),
  ('CODEX', 'Codex', 'OPENAI'),
  ('CLAUDE', 'Claude', 'ANTHROPIC'),
  ('CLAUDE_CODE', 'Claude Code', 'ANTHROPIC'),
  ('GEMINI', 'Gemini', 'GOOGLE'),
  ('COPILOT', 'GitHub Copilot', 'MICROSOFT'),
  ('CURSOR', 'Cursor', 'OTHER'),
  ('PERPLEXITY', 'Perplexity', 'OTHER'),
  ('OTHER_AI', 'Other AI', 'OTHER')
ON CONFLICT (code) DO NOTHING;

-- Default is opt-in disabled. `timezone` is an IANA name validated by the
-- service; day boundaries are always evaluated in this owner-controlled zone.
CREATE TABLE IF NOT EXISTS user_ai_usage_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  windows_agent_enabled boolean NOT NULL DEFAULT false,
  browser_extension_enabled boolean NOT NULL DEFAULT false,
  idle_threshold_seconds integer NOT NULL DEFAULT 180 CHECK (idle_threshold_seconds BETWEEN 30 AND 3600),
  timezone text NOT NULL DEFAULT 'UTC' CHECK (length(btrim(timezone)) BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A pairing code and a device credential are stored only as SHA-256 verifiers.
-- The plaintext values are issued once across an authenticated channel and are
-- never recoverable through database reads, API GETs, logs, or exports.
CREATE TABLE IF NOT EXISTS ai_usage_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_type text NOT NULL CHECK (device_type IN ('WINDOWS_AGENT', 'BROWSER_EXTENSION')),
  device_label text CHECK (device_label IS NULL OR length(btrim(device_label)) BETWEEN 1 AND 120),
  pairing_code_hash text NOT NULL CHECK (pairing_code_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'EXPIRED', 'REVOKED')),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ai_usage_pairings_user_expiry_idx ON ai_usage_pairings (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_type text NOT NULL CHECK (device_type IN ('WINDOWS_AGENT', 'BROWSER_EXTENSION')),
  label text CHECK (label IS NULL OR length(btrim(label)) BETWEEN 1 AND 120),
  credential_hash text NOT NULL UNIQUE CHECK (credential_hash ~ '^[a-f0-9]{64}$'),
  scopes text[] NOT NULL DEFAULT ARRAY['AI_USAGE_INGEST']::text[] CHECK (scopes = ARRAY['AI_USAGE_INGEST']::text[]),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  paired_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ai_usage_devices_user_status_idx ON ai_usage_devices (user_id, status, paired_at DESC);

-- Offline retries are keyed by the device itself, not a client-provided user.
-- The request fingerprint is a digest of the permitted metadata only.
CREATE TABLE IF NOT EXISTS ai_usage_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES ai_usage_devices(id) ON DELETE CASCADE,
  batch_id text NOT NULL CHECK (batch_id ~ '^[A-Za-z0-9_-]{8,200}$'),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  accepted_count integer NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  deduplicated_count integer NOT NULL DEFAULT 0 CHECK (deduplicated_count >= 0),
  -- Stored server-generated replay projection: UUIDs only, never activity
  -- content. This lets a durable retry return the exact original result.
  accepted_session_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  deduplicated_session_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, batch_id),
  CHECK (cardinality(accepted_session_ids) = accepted_count),
  CHECK (cardinality(deduplicated_session_ids) = deduplicated_count)
);

-- `activity_hash` is an opaque SHA-256 digest used only for precedence across
-- a user's collectors. It cannot be a raw URL/domain and is not returned by
-- consumer/root projections. The source priority check prevents a caller from
-- treating lower-priority Import/Manual data as authoritative collector data.
CREATE TABLE IF NOT EXISTS ai_usage_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id uuid REFERENCES ai_usage_devices(id) ON DELETE SET NULL,
  app_code text NOT NULL REFERENCES ai_usage_app_registry(code),
  provider_code text NOT NULL REFERENCES ai_usage_provider_registry(code),
  source text NOT NULL CHECK (source IN ('WINDOWS_AGENT', 'BROWSER_EXTENSION', 'MANUAL', 'MOBILE', 'IMPORT')),
  source_priority integer NOT NULL CHECK (source_priority IN (100, 200, 300, 400, 500)),
  platform text NOT NULL CHECK (platform IN ('WEB', 'WECHAT_MINIPROGRAM', 'WINDOWS', 'IOS', 'ANDROID', 'BROWSER_EXTENSION')),
  activity_hash text NOT NULL CHECK (activity_hash ~ '^sha256:[a-f0-9]{64}$'),
  client_event_id text NOT NULL CHECK (client_event_id ~ '^[A-Za-z0-9_-]{8,200}$'),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  active_seconds integer NOT NULL CHECK (active_seconds >= 0 AND active_seconds <= 86400),
  idle_seconds integer NOT NULL CHECK (idle_seconds >= 0 AND idle_seconds <= 86400),
  timezone text NOT NULL CHECK (length(btrim(timezone)) BETWEEN 1 AND 100),
  local_day date NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CORRECTED', 'DEDUPLICATED', 'DELETED')),
  corrected_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at > started_at),
  CHECK (ended_at <= started_at + interval '1 day'),
  CHECK (active_seconds + idle_seconds <= ceil(extract(epoch FROM (ended_at - started_at))) + 1),
  CHECK ((source = 'WINDOWS_AGENT' AND source_priority = 500 AND device_id IS NOT NULL AND platform = 'WINDOWS')
      OR (source = 'BROWSER_EXTENSION' AND source_priority = 400 AND device_id IS NOT NULL AND platform = 'BROWSER_EXTENSION')
      OR (source = 'MOBILE' AND source_priority = 300 AND device_id IS NULL AND platform IN ('WECHAT_MINIPROGRAM', 'IOS', 'ANDROID'))
      OR (source = 'MANUAL' AND source_priority = 200 AND device_id IS NULL)
      OR (source = 'IMPORT' AND source_priority = 100 AND device_id IS NULL)),
  CHECK ((status = 'CORRECTED') = (corrected_at IS NOT NULL)),
  CHECK ((status = 'DELETED') = (deleted_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ai_usage_sessions_owner_time_idx ON ai_usage_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_sessions_owner_day_idx ON ai_usage_sessions (user_id, local_day DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_sessions_device_client_event_unique
  ON ai_usage_sessions (device_id, client_event_id) WHERE device_id IS NOT NULL;

-- Exactly one canonical row per opaque activity digest is used for aggregate
-- accounting. Lower-precedence reports can remain as DEDUPLICATED evidence
-- without double counting a user's activity.
CREATE TABLE IF NOT EXISTS ai_usage_canonical_activities (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_hash text NOT NULL CHECK (activity_hash ~ '^sha256:[a-f0-9]{64}$'),
  canonical_session_id uuid NOT NULL REFERENCES ai_usage_sessions(id) ON DELETE CASCADE,
  source_priority integer NOT NULL CHECK (source_priority IN (100, 200, 300, 400, 500)),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity_hash),
  UNIQUE (canonical_session_id)
);

CREATE TABLE IF NOT EXISTS ai_usage_session_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES ai_usage_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_session_corrections_owner_idx ON ai_usage_session_corrections (user_id, created_at DESC);

-- Projection cache; all write paths must recompute from canonical sessions.
-- It contains only app/provider/day durations, never collector content.
CREATE TABLE IF NOT EXISTS ai_usage_daily_aggregates (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_day date NOT NULL,
  timezone text NOT NULL CHECK (length(btrim(timezone)) BETWEEN 1 AND 100),
  app_code text NOT NULL REFERENCES ai_usage_app_registry(code),
  provider_code text NOT NULL REFERENCES ai_usage_provider_registry(code),
  active_seconds bigint NOT NULL CHECK (active_seconds >= 0),
  idle_seconds bigint NOT NULL CHECK (idle_seconds >= 0),
  session_count integer NOT NULL CHECK (session_count >= 0),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, local_day, timezone, app_code, provider_code)
);

CREATE TABLE IF NOT EXISTS ai_usage_idempotency (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('MANUAL_SESSION', 'IMPORT_SESSION', 'DELETE_RANGE')),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{8,200}$'),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  result_ref uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation, idempotency_key)
);

-- There is deliberately no client-side SQL read path for this feature.
-- Paired-device verifier hashes, pairing hashes, client event ids, activity
-- digests, batch hashes and correction reasons are server-only. The trusted
-- API maps database rows to safe projections before responding, which also
-- prevents an ordinary consumer from selecting an opaque activity digest.
ALTER TABLE ai_usage_provider_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_provider_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_app_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_app_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE user_ai_usage_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ai_usage_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_pairings FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_canonical_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_canonical_activities FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_session_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_session_corrections FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_daily_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_daily_aggregates FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_idempotency FORCE ROW LEVEL SECURITY;

-- No RLS SELECT policy is installed for a direct consumer query. Every read
-- and mutation goes through the trusted server adapter, which derives owner
-- authority from its authenticated principal, applies the privacy projection,
-- enforces source precedence/idempotency, and performs Root audit writes.
-- This is intentionally stricter than granting a self-read policy on the raw
-- sessions table, where `activity_hash` and `client_event_id` also live.
DROP POLICY IF EXISTS ai_usage_preferences_owner_read ON user_ai_usage_preferences;
DROP POLICY IF EXISTS ai_usage_sessions_owner_read ON ai_usage_sessions;
DROP POLICY IF EXISTS ai_usage_daily_aggregates_owner_read ON ai_usage_daily_aggregates;

COMMIT;
