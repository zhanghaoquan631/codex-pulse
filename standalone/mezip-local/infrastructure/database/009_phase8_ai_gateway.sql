-- ME.zip Phase 8 — Unified AI Gateway foundation.
--
-- This migration records only server-authorized registry, invocation and
-- metering metadata. It deliberately does not introduce a plaintext provider
-- key, a consumer-selectable owner/role, automatic Archive/Message/Media
-- retrieval, or a client-side entitlement source. Provider integrations and
-- production key-management are composed by trusted server code only.

BEGIN;

-- Keep the Root vocabulary additive. ROOT_BULK_EXPORT remains deliberately
-- unseeded; ROOT_MANAGE_AI_GATEWAY is distinct from any customer plan.
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
    'ROOT_VIEW_AUDIT',
    'ROOT_MANAGE_AI_GATEWAY'
  ));

INSERT INTO admin_capabilities (admin_identity_id, code, granted_by_admin_id)
SELECT ai.id, 'ROOT_MANAGE_AI_GATEWAY', ai.id
FROM admin_identities ai
WHERE ai.admin_type = 'ORIGINAL_DEVELOPER_ROOT'
ON CONFLICT (admin_identity_id, code) DO NOTHING;

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
      'ROOT_VIEW_AUDIT',
      'ROOT_MANAGE_AI_GATEWAY'
    ]::text[]) AS capability(capability_code)
    ON CONFLICT (admin_identity_id, code) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION mezip_seed_root_capabilities() FROM PUBLIC;

-- Provider and model registry. A row only describes a reviewed integration;
-- it never contains an API key, base URL with credentials, or provider SDK
-- secret. Registry changes are reachable only through the separate Root API.
CREATE TABLE IF NOT EXISTS ai_gateway_providers (
  code text PRIMARY KEY CHECK (code IN (
    'LOCAL', 'OPENAI', 'OPENAI_COMPATIBLE', 'ANTHROPIC', 'GOOGLE', 'CUSTOM'
  )),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  adapter_type text NOT NULL CHECK (adapter_type IN (
    'LOCAL_DETERMINISTIC', 'OPENAI_OFFICIAL', 'OPENAI_COMPATIBLE',
    'ANTHROPIC_OFFICIAL', 'GOOGLE_OFFICIAL', 'CUSTOM_SERVER'
  )),
  -- A managed configuration reference only. It is not a secret and is never
  -- returned from consumer registry routes.
  api_base_reference text CHECK (api_base_reference IS NULL OR length(btrim(api_base_reference)) BETWEEN 1 AND 500),
  supports_dynamic_models boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN (
    'ACTIVE', 'DEGRADED', 'DISABLED', 'UNAVAILABLE', 'CONFIG_REQUIRED', 'DEPRECATED'
  )),
  availability text NOT NULL CHECK (availability IN (
    'LOCAL_DEVELOPMENT', 'AVAILABLE', 'NOT_CONFIGURED', 'DISABLED', 'UNAVAILABLE'
  )),
  health text NOT NULL CHECK (health IN ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNHEALTHY')),
  credential_modes text[] NOT NULL CHECK (
    cardinality(credential_modes) > 0
    AND credential_modes <@ ARRAY['SYSTEM', 'BYOK', 'NONE']::text[]
  ),
  local_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((code = 'LOCAL') = local_only)
);

CREATE TABLE IF NOT EXISTS ai_gateway_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9_.-]{1,119}$'),
  provider_code text NOT NULL REFERENCES ai_gateway_providers(code) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  status text NOT NULL CHECK (status IN (
    'ACTIVE', 'DEGRADED', 'DISABLED', 'UNAVAILABLE', 'CONFIG_REQUIRED', 'DEPRECATED'
  )),
  availability text NOT NULL CHECK (availability IN (
    'LOCAL_DEVELOPMENT', 'AVAILABLE', 'NOT_CONFIGURED', 'DISABLED', 'UNAVAILABLE'
  )),
  health text NOT NULL CHECK (health IN ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNHEALTHY')),
  context_window integer CHECK (context_window IS NULL OR context_window >= 0),
  max_input_tokens integer NOT NULL CHECK (max_input_tokens >= 0),
  max_output_tokens integer NOT NULL CHECK (max_output_tokens >= 0),
  supports_streaming boolean NOT NULL DEFAULT false,
  pricing_metadata jsonb,
  release_metadata jsonb,
  deprecated_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_gateway_models_provider_status_idx
  ON ai_gateway_models (provider_code, status, code);

CREATE TABLE IF NOT EXISTS ai_gateway_capabilities (
  code text PRIMARY KEY CHECK (code IN (
    'CHAT_COMPLETION', 'TEXT_GENERATION', 'TEXT', 'VISION', 'CODE',
    'REASONING', 'IMAGE_GENERATION', 'AUDIO_INPUT', 'AUDIO_OUTPUT',
    'TOOL_CALLING', 'STRUCTURED_OUTPUT', 'STREAMING', 'EMBEDDING'
  )),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  status text NOT NULL CHECK (status IN (
    'ACTIVE', 'DEGRADED', 'DISABLED', 'UNAVAILABLE', 'CONFIG_REQUIRED', 'DEPRECATED'
  )),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 1_000),
  input_modalities text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (
    input_modalities <@ ARRAY['TEXT', 'IMAGE', 'AUDIO', 'EMBEDDING']::text[]
  ),
  output_modalities text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (
    output_modalities <@ ARRAY['TEXT', 'IMAGE', 'AUDIO', 'EMBEDDING']::text[]
  ),
  requires_explicit_tool_grant boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_gateway_model_capabilities (
  model_id uuid NOT NULL REFERENCES ai_gateway_models(id) ON DELETE CASCADE,
  capability_code text NOT NULL REFERENCES ai_gateway_capabilities(code) ON DELETE RESTRICT,
  PRIMARY KEY (model_id, capability_code)
);

-- A separate availability history prevents a temporary provider/model issue
-- from erasing a registry row used by an existing private conversation.
CREATE TABLE IF NOT EXISTS ai_gateway_model_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES ai_gateway_models(id) ON DELETE CASCADE,
  availability text NOT NULL CHECK (availability IN (
    'LOCAL_DEVELOPMENT', 'AVAILABLE', 'NOT_CONFIGURED', 'DISABLED', 'UNAVAILABLE'
  )),
  health text NOT NULL CHECK (health IN ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNHEALTHY')),
  checked_at timestamptz NOT NULL DEFAULT now(),
  reason_code text
);
CREATE INDEX IF NOT EXISTS ai_gateway_model_availability_model_time_idx
  ON ai_gateway_model_availability (model_id, checked_at DESC);

-- Credential references are server-side identifiers only. `secret_reference`
-- is a managed-secret locator, not a secret value and must never be projected
-- by a consumer or Admin list endpoint.
CREATE TABLE IF NOT EXISTS ai_gateway_system_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL UNIQUE REFERENCES ai_gateway_providers(code) ON DELETE CASCADE,
  secret_reference text NOT NULL CHECK (length(btrim(secret_reference)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'CONFIG_REQUIRED' CHECK (status IN ('ACTIVE', 'CONFIG_REQUIRED', 'REVOKED')),
  configured_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL))
);

-- User-supplied keys are accepted only as a client-encrypted envelope. There
-- is intentionally no plaintext/key/token/value column in this table.
CREATE TABLE IF NOT EXISTS ai_gateway_user_byok_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_code text NOT NULL REFERENCES ai_gateway_providers(code) ON DELETE RESTRICT,
  encryption_algorithm text NOT NULL CHECK (encryption_algorithm IN ('RSA-OAEP-256', 'X25519-AES-GCM')),
  key_id text NOT NULL CHECK (key_id ~ '^[A-Za-z0-9_.-]{1,120}$'),
  encrypted_envelope text NOT NULL CHECK (length(encrypted_envelope) BETWEEN 32 AND 65536),
  fingerprint text CHECK (fingerprint IS NULL OR fingerprint ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'CONFIGURED' CHECK (status IN ('CONFIGURED', 'REVOKED')),
  configured_at timestamptz NOT NULL DEFAULT now(),
  last_validated_at timestamptz,
  validation_status text NOT NULL DEFAULT 'UNKNOWN' CHECK (validation_status IN (
    'UNKNOWN', 'VALID', 'INVALID', 'EXPIRED_OR_REVOKED'
  )),
  revoked_at timestamptz,
  UNIQUE (user_id, provider_code),
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ai_gateway_byok_owner_status_idx
  ON ai_gateway_user_byok_credentials (user_id, status, provider_code);

-- The user-visible conversation is intentionally metadata-only in Phase 8.
-- It does not create a bridge to human Messaging and does not enable RAG.
CREATE TABLE IF NOT EXISTS ai_gateway_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text CHECK (title IS NULL OR length(btrim(title)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK ((status = 'DELETED') = (deleted_at IS NOT NULL))
);

-- Defaults are owner-scoped registry references only; they never select a
-- secret, cost, entitlement, or other user's Provider/Model state.
CREATE TABLE IF NOT EXISTS ai_gateway_user_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_provider_code text REFERENCES ai_gateway_providers(code) ON DELETE SET NULL,
  default_model_id uuid REFERENCES ai_gateway_models(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_gateway_conversations_owner_updated_idx
  ON ai_gateway_conversations (user_id, updated_at DESC);

-- Invocation rows carry no prompt or provider raw response. Explicitly saved
-- message content, if a later owner-approved persistence feature uses it,
-- belongs in the encrypted content table below rather than an API projection.
CREATE TABLE IF NOT EXISTS ai_gateway_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES ai_gateway_conversations(id) ON DELETE SET NULL,
  provider_code text NOT NULL REFERENCES ai_gateway_providers(code) ON DELETE RESTRICT,
  model_id uuid NOT NULL REFERENCES ai_gateway_models(id) ON DELETE RESTRICT,
  capability_code text NOT NULL REFERENCES ai_gateway_capabilities(code) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'STREAMING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REJECTED')),
  context_scope text NOT NULL DEFAULT 'NONE' CHECK (context_scope = 'NONE'),
  input_message_count integer NOT NULL CHECK (input_message_count BETWEEN 0 AND 64),
  input_character_count integer NOT NULL CHECK (input_character_count >= 0),
  fallback_used boolean NOT NULL DEFAULT false,
  fallback_from_model_code text,
  fallback_reason_code text,
  finish_reason text CHECK (finish_reason IS NULL OR finish_reason IN ('STOP', 'LENGTH', 'CANCELLED', 'ERROR')),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  CHECK (NOT fallback_used OR fallback_from_model_code IS NOT NULL),
  CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL) OR status <> 'CANCELLED')
);
CREATE INDEX IF NOT EXISTS ai_gateway_invocations_owner_created_idx
  ON ai_gateway_invocations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_gateway_invocations_conversation_idx
  ON ai_gateway_invocations (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_gateway_invocation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invocation_id uuid NOT NULL REFERENCES ai_gateway_invocations(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  event_type text NOT NULL CHECK (event_type IN ('INVOCATION_CREATED', 'STATUS_CHANGED', 'OUTPUT_DELTA', 'COMPLETED', 'FAILED', 'CANCELLED')),
  status text NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'STREAMING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REJECTED')),
  -- A text delta is not stored here: persisted output requires an explicit
  -- encrypted message policy and is not part of this foundation migration.
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invocation_id, sequence)
);

CREATE TABLE IF NOT EXISTS ai_gateway_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invocation_id uuid NOT NULL UNIQUE REFERENCES ai_gateway_invocations(id) ON DELETE CASCADE,
  input_tokens integer NOT NULL CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL CHECK (output_tokens >= 0),
  total_tokens integer NOT NULL CHECK (total_tokens = input_tokens + output_tokens),
  cost_fen bigint NOT NULL CHECK (cost_fen >= 0),
  currency text NOT NULL DEFAULT 'CNY' CHECK (currency = 'CNY'),
  metered_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_gateway_usage_ledger_owner_time_idx
  ON ai_gateway_usage_ledger (user_id, metered_at DESC);

-- Encrypted user-visible message content is a reserved, opt-in persistence
-- seam. The current service does not write it and no consumer route reads it.
CREATE TABLE IF NOT EXISTS ai_gateway_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_gateway_conversations(id) ON DELETE CASCADE,
  invocation_id uuid REFERENCES ai_gateway_invocations(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('USER', 'ASSISTANT', 'SYSTEM')),
  content_encrypted_envelope text NOT NULL CHECK (length(content_encrypted_envelope) BETWEEN 32 AND 262144),
  encryption_key_id text NOT NULL CHECK (encryption_key_id ~ '^[A-Za-z0-9_.-]{1,120}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_gateway_messages_conversation_created_idx
  ON ai_gateway_messages (conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS ai_gateway_provider_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL REFERENCES ai_gateway_providers(code) ON DELETE CASCADE,
  availability text NOT NULL CHECK (availability IN ('LOCAL_DEVELOPMENT', 'AVAILABLE', 'NOT_CONFIGURED', 'DISABLED', 'UNAVAILABLE')),
  health text NOT NULL CHECK (health IN ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNHEALTHY')),
  circuit_open_until timestamptz,
  checked_at timestamptz NOT NULL DEFAULT now(),
  checked_by_admin_identity_id uuid REFERENCES admin_identities(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ai_gateway_provider_health_provider_time_idx
  ON ai_gateway_provider_health (provider_code, checked_at DESC);

-- There are no executable tools in Phase 8. This table makes the deny-by-
-- default policy explicit for future server-allowlisted tools.
CREATE TABLE IF NOT EXISTS ai_gateway_tool_registry (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z0-9][A-Z0-9_.-]{1,119}$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'DISABLED' CHECK (status IN ('DISABLED', 'ACTIVE', 'DEPRECATED')),
  requires_entitlement text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'DISABLED')
);

CREATE TABLE IF NOT EXISTS ai_gateway_invocation_tool_policies (
  invocation_id uuid PRIMARY KEY REFERENCES ai_gateway_invocations(id) ON DELETE CASCADE,
  execution text NOT NULL DEFAULT 'DISABLED' CHECK (execution = 'DISABLED'),
  allowed_tool_codes text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (cardinality(allowed_tool_codes) = 0)
);

-- Policy metadata is server-only. Phase 8 seeds a deny-by-default posture;
-- no consumer input can widen retry/fallback/context/tool constraints.
CREATE TABLE IF NOT EXISTS ai_gateway_policies (
  policy_key text PRIMARY KEY CHECK (policy_key IN (
    'DEFAULT_EXECUTION', 'DEFAULT_FALLBACK', 'DEFAULT_CONTEXT', 'DEFAULT_TOOLS'
  )),
  policy_value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_gateway_idempotency (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('INVOCATION_CREATE', 'INVOCATION_CANCEL', 'CONVERSATION_CREATE', 'CONVERSATION_DELETE', 'BYOK_CONFIGURE', 'BYOK_REVOKE')),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{8,200}$'),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  resource_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation, idempotency_key)
);

-- Separate append-only Root maintenance trail. It never records secrets,
-- envelopes, prompts, provider raw errors, or a target user's AI content.
CREATE TABLE IF NOT EXISTS ai_gateway_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_identity_id uuid NOT NULL REFERENCES admin_identities(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN (
    'PROVIDER_ENABLED', 'PROVIDER_DISABLED', 'MODEL_ENABLED', 'MODEL_DISABLED',
    'MODEL_SYNC', 'PROVIDER_HEALTH_READ', 'SYSTEM_CREDENTIAL_CHANGED',
    'SYSTEM_CREDENTIAL_STATUS_READ'
  )),
  provider_code text NOT NULL REFERENCES ai_gateway_providers(code) ON DELETE RESTRICT,
  model_code text,
  reason_optional text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid,
  environment text,
  request_id text
);
CREATE INDEX IF NOT EXISTS ai_gateway_admin_audit_actor_time_idx
  ON ai_gateway_admin_audit (actor_user_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION mezip_guard_ai_gateway_admin_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'ai_gateway_admin_audit is append-only' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION mezip_guard_ai_gateway_admin_audit() FROM PUBLIC;
DROP TRIGGER IF EXISTS ai_gateway_admin_audit_no_mutation ON ai_gateway_admin_audit;
CREATE TRIGGER ai_gateway_admin_audit_no_mutation
  BEFORE UPDATE OR DELETE OR TRUNCATE ON ai_gateway_admin_audit
  FOR EACH STATEMENT EXECUTE FUNCTION mezip_guard_ai_gateway_admin_audit();

INSERT INTO ai_gateway_providers (code, display_name, adapter_type, supports_dynamic_models, status, availability, health, credential_modes, local_only) VALUES
  ('LOCAL', 'Local development adapter', 'LOCAL_DETERMINISTIC', false, 'ACTIVE', 'LOCAL_DEVELOPMENT', 'HEALTHY', ARRAY['NONE']::text[], true),
  ('OPENAI', 'OpenAI', 'OPENAI_OFFICIAL', true, 'DISABLED', 'NOT_CONFIGURED', 'UNKNOWN', ARRAY['SYSTEM', 'BYOK']::text[], false),
  ('OPENAI_COMPATIBLE', 'OpenAI-compatible endpoint', 'OPENAI_COMPATIBLE', false, 'DISABLED', 'NOT_CONFIGURED', 'UNKNOWN', ARRAY['SYSTEM', 'BYOK']::text[], false),
  ('ANTHROPIC', 'Anthropic', 'ANTHROPIC_OFFICIAL', true, 'DISABLED', 'NOT_CONFIGURED', 'UNKNOWN', ARRAY['SYSTEM', 'BYOK']::text[], false),
  ('GOOGLE', 'Google', 'GOOGLE_OFFICIAL', true, 'DISABLED', 'NOT_CONFIGURED', 'UNKNOWN', ARRAY['SYSTEM', 'BYOK']::text[], false),
  ('CUSTOM', 'Custom provider', 'CUSTOM_SERVER', false, 'DISABLED', 'NOT_CONFIGURED', 'UNKNOWN', ARRAY['SYSTEM', 'BYOK']::text[], false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO ai_gateway_capabilities (code, display_name, status, description, input_modalities, output_modalities, requires_explicit_tool_grant) VALUES
  ('CHAT_COMPLETION', 'Chat completion', 'ACTIVE', 'Conversational text completion.', ARRAY['TEXT']::text[], ARRAY['TEXT']::text[], false),
  ('TEXT_GENERATION', 'Text generation', 'ACTIVE', 'General text generation.', ARRAY['TEXT']::text[], ARRAY['TEXT']::text[], false),
  ('TEXT', 'Text', 'ACTIVE', 'Text input and output support.', ARRAY['TEXT']::text[], ARRAY['TEXT']::text[], false),
  ('VISION', 'Vision', 'DISABLED', 'Future image understanding capability.', ARRAY['IMAGE']::text[], ARRAY['TEXT']::text[], false),
  ('CODE', 'Code', 'DISABLED', 'Future code generation capability.', ARRAY['TEXT']::text[], ARRAY['TEXT']::text[], false),
  ('REASONING', 'Reasoning', 'DISABLED', 'Future reasoning capability.', ARRAY['TEXT']::text[], ARRAY['TEXT']::text[], false),
  ('IMAGE_GENERATION', 'Image generation', 'DISABLED', 'Future image generation capability.', ARRAY['TEXT']::text[], ARRAY['IMAGE']::text[], false),
  ('AUDIO_INPUT', 'Audio input', 'DISABLED', 'Future audio understanding capability.', ARRAY['AUDIO']::text[], ARRAY['TEXT']::text[], false),
  ('AUDIO_OUTPUT', 'Audio output', 'DISABLED', 'Future audio generation capability.', ARRAY['TEXT']::text[], ARRAY['AUDIO']::text[], false),
  ('TOOL_CALLING', 'Tool calling', 'DISABLED', 'Server-allowlisted tool calling only.', ARRAY['TEXT']::text[], ARRAY['TEXT']::text[], true),
  ('STRUCTURED_OUTPUT', 'Structured output', 'ACTIVE', 'Structured text output.', ARRAY['TEXT']::text[], ARRAY['TEXT']::text[], false),
  ('STREAMING', 'Streaming output', 'ACTIVE', 'Incremental output event stream.', ARRAY['TEXT']::text[], ARRAY['TEXT']::text[], false),
  ('EMBEDDING', 'Embedding', 'DISABLED', 'Future embedding capability.', ARRAY['TEXT']::text[], ARRAY['EMBEDDING']::text[], false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO ai_gateway_models (
  code, provider_code, display_name, status, availability, health,
  context_window, max_input_tokens, max_output_tokens, supports_streaming,
  pricing_metadata, release_metadata, last_synced_at
) VALUES
  ('LOCAL_ECHO_V1', 'LOCAL', 'Local development model', 'ACTIVE', 'LOCAL_DEVELOPMENT', 'HEALTHY', 8192, 8192, 512, true, '{"currency":"CNY","costFen":0}'::jsonb, '{"channel":"LOCAL_DEVELOPMENT"}'::jsonb, now()),
  ('OPENAI_CHAT_V1', 'OPENAI', 'OpenAI chat (not configured)', 'DISABLED', 'NOT_CONFIGURED', 'UNKNOWN', NULL, 0, 0, false, NULL, NULL, now()),
  ('OPENAI_COMPATIBLE_CHAT_V1', 'OPENAI_COMPATIBLE', 'OpenAI-compatible chat (not configured)', 'DISABLED', 'NOT_CONFIGURED', 'UNKNOWN', NULL, 0, 0, false, NULL, NULL, now()),
  ('ANTHROPIC_CHAT_V1', 'ANTHROPIC', 'Anthropic chat (not configured)', 'DISABLED', 'NOT_CONFIGURED', 'UNKNOWN', NULL, 0, 0, false, NULL, NULL, now()),
  ('GOOGLE_CHAT_V1', 'GOOGLE', 'Google chat (not configured)', 'DISABLED', 'NOT_CONFIGURED', 'UNKNOWN', NULL, 0, 0, false, NULL, NULL, now()),
  ('CUSTOM_CHAT_V1', 'CUSTOM', 'Custom provider chat (not configured)', 'DISABLED', 'NOT_CONFIGURED', 'UNKNOWN', NULL, 0, 0, false, NULL, NULL, now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO ai_gateway_model_capabilities (model_id, capability_code)
SELECT model.id, capability.code
FROM ai_gateway_models model
JOIN ai_gateway_capabilities capability ON capability.code = ANY(ARRAY[
  'CHAT_COMPLETION', 'TEXT_GENERATION', 'TEXT', 'STRUCTURED_OUTPUT', 'STREAMING'
]::text[])
WHERE model.code = 'LOCAL_ECHO_V1'
ON CONFLICT DO NOTHING;

INSERT INTO ai_gateway_policies (policy_key, policy_value) VALUES
  ('DEFAULT_EXECUTION', '{"maxAttempts":2,"timeoutPolicy":"SERVER_BOUNDED"}'::jsonb),
  ('DEFAULT_FALLBACK', '{"enabled":false,"requiresExplicitServerPolicy":true}'::jsonb),
  ('DEFAULT_CONTEXT', '{"allowedScopes":["NONE"]}'::jsonb),
  ('DEFAULT_TOOLS', '{"execution":"DISABLED","allowedToolCodes":[]}'::jsonb)
ON CONFLICT (policy_key) DO NOTHING;

-- No direct consumer SQL policies. The trusted service derives the owner from
-- its authenticated principal and maps internal rows into safe DTOs. FORCE
-- RLS keeps a table owner from accidentally bypassing this discipline.
ALTER TABLE ai_gateway_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_providers FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_models FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_capabilities FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_model_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_model_capabilities FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_model_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_model_availability FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_system_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_system_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_user_byok_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_user_byok_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_user_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_invocations FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_invocation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_invocation_events FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_usage_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_provider_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_provider_health FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_tool_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_tool_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_invocation_tool_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_invocation_tool_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_idempotency FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_admin_audit FORCE ROW LEVEL SECURITY;

COMMIT;
