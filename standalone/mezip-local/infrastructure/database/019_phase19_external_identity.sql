-- ME.zip Phase 19 — Connected Apps and external identity.
-- This is additive. Auth login identities and provider credentials remain
-- separate from public external profile metadata.
BEGIN;

CREATE TABLE IF NOT EXISTS external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('X', 'CHATGPT', 'WECHAT', 'HONOR_OF_KINGS', 'GITHUB')),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 500),
  handle text,
  public_url text CHECK (public_url IS NULL OR public_url ~ '^https://'),
  avatar_url text CHECK (avatar_url IS NULL OR avatar_url ~ '^https://'),
  description text,
  visibility text NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'PUBLIC')),
  connection_status text NOT NULL CHECK (connection_status IN ('NOT_CONNECTED', 'LINK_ONLY', 'MANUAL_PROFILE', 'CONNECTED', 'REAUTH_REQUIRED', 'PROVIDER_UNAVAILABLE', 'UNSUPPORTED', 'PRODUCTION_PENDING')),
  provider_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(provider_capabilities) = 'array'),
  metadata_safe jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata_safe) = 'object'),
  -- A Media service object ID only. A public-profile query never projects it.
  qr_media_id uuid,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, provider)
);

CREATE TABLE IF NOT EXISTS external_identity_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identity_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('X', 'GITHUB')),
  provider_account_id text NOT NULL CHECK (length(provider_account_id) BETWEEN 1 AND 300),
  status text NOT NULL CHECK (status IN ('CONNECTED', 'REAUTH_REQUIRED', 'PROVIDER_UNAVAILABLE')),
  requested_scopes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(requested_scopes) = 'array'),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, identity_id),
  FOREIGN KEY (owner_user_id, identity_id) REFERENCES external_identities(owner_user_id, id) ON DELETE CASCADE
);

-- Encrypted value is never selected by consumer/public profile paths.
CREATE TABLE IF NOT EXISTS external_identity_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identity_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('X', 'GITHUB')),
  ciphertext bytea NOT NULL,
  key_reference text NOT NULL CHECK (key_reference ~ '^(?:vault|kms|secret)://'),
  key_version integer NOT NULL CHECK (key_version >= 1),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  UNIQUE (owner_user_id, identity_id),
  FOREIGN KEY (owner_user_id, identity_id) REFERENCES external_identities(owner_user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS external_identity_oauth_states (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('X', 'GITHUB')),
  redirect_uri text NOT NULL CHECK (redirect_uri ~ '^https://'),
  code_challenge text NOT NULL,
  -- The short-lived verifier is encrypted at rest by the server-side state
  -- repository. It never appears in a callback DTO, audit event or client.
  code_verifier_ciphertext bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE TABLE IF NOT EXISTS external_identity_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identity_id uuid,
  provider text CHECK (provider IS NULL OR provider IN ('X', 'CHATGPT', 'WECHAT', 'HONOR_OF_KINGS', 'GITHUB')),
  action text NOT NULL CHECK (action IN ('IDENTITY_CREATED', 'IDENTITY_UPDATED', 'IDENTITY_DELETED', 'VISIBILITY_CHANGED', 'IDENTITY_REORDERED', 'OAUTH_STARTED', 'OAUTH_COMPLETED', 'CONNECTION_DISCONNECTED', 'PROVIDER_REAUTH_REQUIRED')),
  status text NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_user_id, identity_id) REFERENCES external_identities(owner_user_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS external_identities_public_order_idx
  ON external_identities (owner_user_id, display_order)
  WHERE visibility = 'PUBLIC';
CREATE INDEX IF NOT EXISTS external_identity_audit_owner_time_idx
  ON external_identity_audit_events (owner_user_id, occurred_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'external_identities',
    'external_identity_connections',
    'external_identity_credentials',
    'external_identity_oauth_states',
    'external_identity_audit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

-- No direct consumer-table policies are installed. A reviewed server service
-- role must scope all mutable reads/writes by owner_user_id. Its public-profile
-- projection selects only `visibility = PUBLIC` and never reads credentials or
-- `qr_media_id`.
COMMIT;
