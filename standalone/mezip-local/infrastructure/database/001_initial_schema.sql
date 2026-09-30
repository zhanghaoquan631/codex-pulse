-- ME.zip initial logical schema. Do not apply to a production database from Phase 0.
-- Deployment must run this through a reviewed migration tool and set mezip.principal_id
-- transaction-locally for every tenant-scoped query.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE mezip_visibility AS ENUM ('PRIVATE', 'SNAPSHOT', 'COMMUNITY', 'GROUP', 'DIRECT_SHARE', 'PUBLIC');
CREATE TYPE mezip_record_kind AS ENUM ('LIFE', 'HISTORY', 'FITNESS', 'AI', 'MOVEMENT', 'ACHIEVEMENT', 'CREATOR');
CREATE TYPE mezip_plan_code AS ENUM ('FREE', 'GO', 'PLUS', 'PRO', 'PRO_MAX');
CREATE TYPE mezip_order_status AS ENUM ('CREATED', 'PENDING_PAYMENT', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDING', 'REFUNDED', 'CLOSED');
CREATE TYPE mezip_subscription_status AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED');
CREATE TYPE mezip_media_status AS ENUM ('UPLOAD', 'QUARANTINE', 'HASHED', 'SCANNING', 'APPROVED', 'REJECTED', 'PUBLISHED', 'DELETED');
CREATE TYPE mezip_conversation_kind AS ENUM ('DIRECT', 'GROUP');
CREATE TYPE mezip_message_request_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'BLOCKED');
CREATE TYPE mezip_member_role AS ENUM ('OWNER', 'ADMIN', 'MODERATOR', 'MEMBER', 'MUTED', 'BANNED');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle text UNIQUE,
  display_name text NOT NULL,
  locale text NOT NULL DEFAULT 'zh-CN',
  timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  platform text NOT NULL,
  display_name text NOT NULL,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_owner_id_idx ON devices(owner_id);

CREATE TABLE private_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  kind mezip_record_kind NOT NULL,
  visibility mezip_visibility NOT NULL DEFAULT 'PRIVATE' CHECK (visibility = 'PRIVATE'),
  title text,
  body text,
  occurred_at timestamptz NOT NULL,
  timezone text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX private_records_owner_occurred_idx ON private_records(owner_id, occurred_at DESC);

CREATE TABLE timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  kind mezip_record_kind NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  occurred_at timestamptz NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX timeline_events_owner_occurred_idx ON timeline_events(owner_id, occurred_at DESC);

CREATE TABLE ai_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES users(id),
  slug text NOT NULL,
  display_name text NOT NULL,
  recognition_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (owner_id, slug)
);

CREATE TABLE ai_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  service_id uuid NOT NULL REFERENCES ai_services(id),
  device_id uuid REFERENCES devices(id),
  platform text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  active_seconds integer NOT NULL CHECK (active_seconds >= 0),
  idle_seconds integer NOT NULL DEFAULT 0 CHECK (idle_seconds >= 0),
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at >= started_at)
);
CREATE INDEX ai_sessions_owner_started_idx ON ai_sessions(owner_id, started_at DESC);

CREATE TABLE history_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  private_record_id uuid UNIQUE REFERENCES private_records(id),
  book_title text,
  chapter text,
  dynasty text,
  people jsonb NOT NULL DEFAULT '[]'::jsonb,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  quotation text,
  reflection text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fitness_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  private_record_id uuid UNIQUE REFERENCES private_records(id),
  training_type text,
  body_parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  state_score smallint CHECK (state_score BETWEEN 1 AND 10),
  weight_grams integer CHECK (weight_grams IS NULL OR weight_grams >= 0),
  body_fat_basis_points integer CHECK (body_fat_basis_points IS NULL OR body_fat_basis_points >= 0),
  exercises jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  storage_key text NOT NULL UNIQUE,
  content_type text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes >= 0),
  sha256 text,
  status mezip_media_status NOT NULL DEFAULT 'UPLOAD',
  original_filename text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX media_assets_owner_id_idx ON media_assets(owner_id);

CREATE TABLE public_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_record_id uuid NOT NULL REFERENCES private_records(id),
  owner_id uuid NOT NULL REFERENCES users(id),
  selected_content jsonb NOT NULL,
  visibility mezip_visibility NOT NULL DEFAULT 'SNAPSHOT' CHECK (visibility = 'SNAPSHOT'),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX public_snapshots_owner_id_idx ON public_snapshots(owner_id);

CREATE TABLE community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users(id),
  snapshot_id uuid REFERENCES public_snapshots(id),
  body text,
  channel text NOT NULL,
  visibility mezip_visibility NOT NULL DEFAULT 'COMMUNITY' CHECK (visibility = 'COMMUNITY'),
  moderation_status text NOT NULL DEFAULT 'VISIBLE',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX community_posts_channel_created_idx ON community_posts(channel, created_at DESC);

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id),
  author_id uuid NOT NULL REFERENCES users(id),
  parent_id uuid REFERENCES comments(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE follows (
  follower_id uuid NOT NULL REFERENCES users(id),
  followed_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);

CREATE TABLE blocks (
  blocker_id uuid NOT NULL REFERENCES users(id),
  blocked_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind mezip_conversation_kind NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  last_sequence bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role mezip_member_role NOT NULL DEFAULT 'MEMBER',
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_sequence bigint NOT NULL DEFAULT 0,
  muted_until timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE message_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id),
  recipient_id uuid NOT NULL REFERENCES users(id),
  status mezip_message_request_status NOT NULL DEFAULT 'PENDING',
  decision_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, recipient_id),
  CHECK (requester_id <> recipient_id)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  sender_id uuid NOT NULL REFERENCES users(id),
  client_message_id uuid NOT NULL,
  sequence bigint NOT NULL,
  kind text NOT NULL,
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  reply_to_id uuid REFERENCES messages(id),
  quoted_message_id uuid REFERENCES messages(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  recalled_at timestamptz,
  UNIQUE (conversation_id, sequence),
  UNIQUE (sender_id, client_message_id)
);

CREATE TABLE message_receipts (
  message_id uuid NOT NULL REFERENCES messages(id),
  recipient_id uuid NOT NULL REFERENCES users(id),
  delivered_at timestamptz,
  read_at timestamptz,
  PRIMARY KEY (message_id, recipient_id)
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code mezip_plan_code NOT NULL,
  display_name text NOT NULL,
  amount_fen integer NOT NULL CHECK (amount_fen >= 0),
  currency char(3) NOT NULL DEFAULT 'CNY',
  duration_days integer CHECK (duration_days IS NULL OR duration_days > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  product_id uuid NOT NULL REFERENCES products(id),
  amount_fen integer NOT NULL CHECK (amount_fen >= 0),
  currency char(3) NOT NULL DEFAULT 'CNY',
  status mezip_order_status NOT NULL DEFAULT 'CREATED',
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, idempotency_key)
);
CREATE INDEX orders_owner_created_idx ON orders(owner_id, created_at DESC);

CREATE TABLE payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  provider text NOT NULL,
  provider_transaction_id text NOT NULL,
  amount_fen integer NOT NULL CHECK (amount_fen >= 0),
  raw_event jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_transaction_id)
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  amount_fen integer NOT NULL CHECK (amount_fen >= 0),
  provider_refund_id text UNIQUE,
  status text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  order_id uuid UNIQUE NOT NULL REFERENCES orders(id),
  plan_code mezip_plan_code NOT NULL,
  status mezip_subscription_status NOT NULL DEFAULT 'PENDING',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  subscription_id uuid REFERENCES subscriptions(id),
  code text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entitlements_owner_code_idx ON entitlements(owner_id, code, valid_until);

CREATE TABLE founder_contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id),
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  reason_code text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  reason text,
  request_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE break_glass_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id),
  case_reference text NOT NULL,
  reason text NOT NULL,
  scope jsonb NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  approved_by uuid REFERENCES users(id),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at)
);

CREATE TABLE feature_flags (
  key text PRIMARY KEY,
  description text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  targeting jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0
);

-- Phase 0 representative row-level policies. Add the equivalent policy to every
-- tenant-owned table before production migrations are accepted.
ALTER TABLE private_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY private_records_owner_policy ON private_records
  USING (owner_id = current_setting('mezip.principal_id', true)::uuid)
  WITH CHECK (owner_id = current_setting('mezip.principal_id', true)::uuid);

ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_sessions_owner_policy ON ai_sessions
  USING (owner_id = current_setting('mezip.principal_id', true)::uuid)
  WITH CHECK (owner_id = current_setting('mezip.principal_id', true)::uuid);

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY media_assets_owner_policy ON media_assets
  USING (owner_id = current_setting('mezip.principal_id', true)::uuid)
  WITH CHECK (owner_id = current_setting('mezip.principal_id', true)::uuid);
