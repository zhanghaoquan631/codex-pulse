-- ME.zip Phase 6 — Membership, Entitlements, Benefits and Payments.
--
-- This migration extends the existing Phase 0/1 commerce truth (`products`,
-- `orders`, `subscriptions`, `entitlements`, `payment_transactions`,
-- `refunds`, `campaigns`, `benefit_grants`, `coupons`, `redemptions`) instead
-- of creating a second plan/subscription/payment source of truth. In the
-- application domain, `subscriptions` is the durable Membership relation.
-- The `memberships`, `membership_plans`, and `payments` views below are stable
-- semantic projections for future callers and reporting only.
--
-- Consumer sessions set only `mezip.principal_id` transaction-locally. Payment
-- callbacks, price catalog writes, and Membership Admin actions run through a
-- server role / separately authenticated Admin API. A client must never get a
-- role that can set admin context or insert paid/subscription rows directly.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TYPE mezip_order_status ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE mezip_subscription_status ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ---------------------------------------------------------------------------
-- Frozen server price catalog — all prices are integer CNY fen.
-- ---------------------------------------------------------------------------

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS renewal_mode text NOT NULL DEFAULT 'NON_AUTO_RENEWING_MONTHLY_PASS',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS products_membership_plan_code_unique
  ON products (code);

INSERT INTO products (code, display_name, amount_fen, currency, duration_days, active, renewal_mode)
VALUES
  ('FREE',    'FREE',                 0, 'CNY', NULL, true, 'NON_AUTO_RENEWING_MONTHLY_PASS'),
  ('GO',      'GO · 社区通行证',   1000, 'CNY', 30, true, 'NON_AUTO_RENEWING_MONTHLY_PASS'),
  ('PLUS',    'PLUS · 深度交流',  2000, 'CNY', 30, true, 'NON_AUTO_RENEWING_MONTHLY_PASS'),
  ('PRO',     'PRO · 创始人圈层', 4000, 'CNY', 30, true, 'NON_AUTO_RENEWING_MONTHLY_PASS'),
  ('PRO_MAX', 'PRO MAX · 创作者实验室', 8000, 'CNY', 30, true, 'NON_AUTO_RENEWING_MONTHLY_PASS')
ON CONFLICT (code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  amount_fen = EXCLUDED.amount_fen,
  currency = EXCLUDED.currency,
  duration_days = EXCLUDED.duration_days,
  active = EXCLUDED.active,
  renewal_mode = EXCLUDED.renewal_mode;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_membership_price_check;
ALTER TABLE products
  ADD CONSTRAINT products_membership_price_check
  CHECK (
    currency = 'CNY'
    AND amount_fen >= 0
    AND amount_fen = CASE code
      WHEN 'FREE' THEN 0
      WHEN 'GO' THEN 1000
      WHEN 'PLUS' THEN 2000
      WHEN 'PRO' THEN 4000
      WHEN 'PRO_MAX' THEN 8000
    END
  );

CREATE OR REPLACE VIEW membership_plans AS
SELECT
  p.id,
  p.code AS plan_code,
  p.display_name,
  p.amount_fen,
  p.currency,
  p.duration_days,
  p.renewal_mode,
  p.active
FROM products p
WHERE p.archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- Orders, Payment records and Refund foundation.
-- ---------------------------------------------------------------------------

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_no text,
  ADD COLUMN IF NOT EXISTS plan_code mezip_plan_code,
  ADD COLUMN IF NOT EXISTS base_amount_fen integer,
  ADD COLUMN IF NOT EXISTS discount_amount_fen integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payable_amount_fen integer,
  ADD COLUMN IF NOT EXISTS coupon_id uuid,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

UPDATE orders o
SET
  order_no = COALESCE(o.order_no, 'LEGACY-' || replace(o.id::text, '-', '')),
  plan_code = COALESCE(o.plan_code, p.code),
  base_amount_fen = COALESCE(o.base_amount_fen, o.amount_fen),
  discount_amount_fen = COALESCE(o.discount_amount_fen, 0),
  payable_amount_fen = COALESCE(o.payable_amount_fen, o.amount_fen),
  expires_at = COALESCE(o.expires_at, o.created_at + interval '30 minutes'),
  paid_at = CASE WHEN o.status IN ('PAID', 'FULFILLED', 'REFUNDING', 'REFUNDED') THEN COALESCE(o.paid_at, o.updated_at) ELSE o.paid_at END
FROM products p
WHERE p.id = o.product_id;

ALTER TABLE orders
  ALTER COLUMN order_no SET NOT NULL,
  ALTER COLUMN plan_code SET NOT NULL,
  ALTER COLUMN base_amount_fen SET NOT NULL,
  ALTER COLUMN payable_amount_fen SET NOT NULL;
ALTER TABLE orders
  ADD CONSTRAINT orders_coupon_fk FOREIGN KEY (coupon_id) REFERENCES coupons(id),
  ADD CONSTRAINT orders_provider_check CHECK (provider IS NULL OR provider IN ('WECHAT_PAY', 'ALIPAY', 'UNIONPAY', 'MOCK')),
  ADD CONSTRAINT orders_money_check CHECK (
    base_amount_fen >= 0
    AND discount_amount_fen >= 0
    AND payable_amount_fen >= 0
    AND payable_amount_fen = base_amount_fen - discount_amount_fen
    AND amount_fen = payable_amount_fen
  ),
  ADD CONSTRAINT orders_expiry_check CHECK (expires_at > created_at);
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_no_unique ON orders (order_no);
CREATE INDEX IF NOT EXISTS orders_owner_status_created_idx ON orders (owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_pending_expiry_idx ON orders (expires_at) WHERE status IN ('CREATED', 'PENDING_PAYMENT');

ALTER TABLE payment_transactions
  -- Pending checkout rows have a provider payment id but no provider
  -- transaction/callback timestamp until the verified callback arrives.
  ALTER COLUMN provider_transaction_id DROP NOT NULL,
  ALTER COLUMN verified_at DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS provider_payment_id text,
  ADD COLUMN IF NOT EXISTS currency char(3) NOT NULL DEFAULT 'CNY',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS raw_event_digest text;
-- Raw provider callbacks are intentionally not retained in the legacy JSONB
-- column. Callback verification persists a digest in `payment_events` only.
UPDATE payment_transactions
SET raw_event = '{}'::jsonb
WHERE raw_event <> '{}'::jsonb;
ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_provider_check CHECK (provider IN ('WECHAT_PAY', 'ALIPAY', 'UNIONPAY', 'MOCK')),
  ADD CONSTRAINT payment_transactions_status_check CHECK (status IN ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED')),
  ADD CONSTRAINT payment_transactions_currency_check CHECK (currency = 'CNY');
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_provider_payment_unique
  ON payment_transactions (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('WECHAT_PAY', 'ALIPAY', 'UNIONPAY', 'MOCK')),
  provider_transaction_id text NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id),
  amount_fen integer NOT NULL CHECK (amount_fen >= 0),
  currency char(3) NOT NULL DEFAULT 'CNY' CHECK (currency = 'CNY'),
  event_digest text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_transaction_id)
);
CREATE INDEX IF NOT EXISTS payment_events_order_idx ON payment_events (order_id, verified_at DESC);

-- All server mutation paths persist opaque idempotency receipts. The stored
-- JSON is a server-created response projection; it never contains payment
-- callback plaintext, credentials, or client authority claims.
CREATE TABLE IF NOT EXISTS membership_idempotency (
  scope_key text PRIMARY KEY,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS requested_by_user_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE refunds
  ADD CONSTRAINT refunds_provider_check CHECK (provider IS NULL OR provider IN ('WECHAT_PAY', 'ALIPAY', 'UNIONPAY', 'MOCK')),
  ADD CONSTRAINT refunds_status_check CHECK (status IN ('REQUESTED', 'PENDING', 'SUCCEEDED', 'FAILED'));
CREATE UNIQUE INDEX IF NOT EXISTS refunds_owner_idempotency_unique
  ON refunds (requested_by_user_id, idempotency_key)
  WHERE requested_by_user_id IS NOT NULL AND idempotency_key IS NOT NULL;

CREATE OR REPLACE VIEW payments AS
SELECT
  pt.id,
  pt.order_id,
  pt.provider,
  pt.provider_payment_id,
  pt.provider_transaction_id,
  pt.amount_fen,
  pt.currency,
  pt.status,
  pt.verified_at,
  pt.created_at,
  pt.updated_at
FROM payment_transactions pt;

-- ---------------------------------------------------------------------------
-- Membership domain. Existing `subscriptions` remains the canonical durable
-- relation; it is extended with source/audit metadata and projected as a view.
-- ---------------------------------------------------------------------------

ALTER TABLE subscriptions
  ALTER COLUMN order_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'PURCHASE',
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_source_check CHECK (source IN (
    'PURCHASE', 'TRIAL', 'COUPON', 'REDEMPTION', 'CAMPAIGN', 'ADMIN_GRANT',
    'INVITE_REWARD', 'FOUNDER_INTERNAL', 'SYSTEM'
  ));
CREATE INDEX IF NOT EXISTS subscriptions_owner_current_idx
  ON subscriptions (owner_id, status, starts_at, ends_at DESC);

CREATE OR REPLACE VIEW memberships AS
SELECT
  s.id,
  s.owner_id AS user_id,
  s.order_id,
  s.plan_code,
  s.status,
  s.source,
  s.source_reference,
  s.starts_at,
  s.ends_at AS expires_at,
  s.created_at,
  s.updated_at,
  s.revoked_at
FROM subscriptions s;

CREATE TABLE IF NOT EXISTS membership_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES subscriptions(id),
  user_id uuid NOT NULL REFERENCES users(id),
  event text NOT NULL CHECK (event IN ('CREATED', 'ACTIVATED', 'EXTENDED', 'EXPIRED', 'REVOKED', 'CANCELLED')),
  source text NOT NULL CHECK (source IN (
    'PURCHASE', 'TRIAL', 'COUPON', 'REDEMPTION', 'CAMPAIGN', 'ADMIN_GRANT',
    'INVITE_REWARD', 'FOUNDER_INTERNAL', 'SYSTEM'
  )),
  reason text,
  actor_user_id uuid REFERENCES users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS membership_history_user_occurred_idx ON membership_history (user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS plan_entitlements (
  plan_code mezip_plan_code NOT NULL,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_code, code)
);

INSERT INTO plan_entitlements (plan_code, code) VALUES
  ('FREE', 'ARCHIVE_PRIVATE'), ('FREE', 'MEDIA_BASIC'), ('FREE', 'TIMELINE_PRIVATE'),
  ('FREE', 'HISTORY_PRIVATE'), ('FREE', 'FITNESS_PRIVATE'), ('FREE', 'MOVEMENT_BASIC'),
  ('FREE', 'AI_USAGE_BASIC'), ('FREE', 'STATS_BASIC'), ('FREE', 'PROFILE_SELF'),
  ('FREE', 'DATA_EXPORT'), ('FREE', 'COMMUNITY_READ'),
  ('GO', 'COMMUNITY_POST'), ('GO', 'COMMUNITY_COMMENT'), ('GO', 'COMMUNITY_GROUP'),
  ('GO', 'COMMUNITY_INTERACT'), ('GO', 'COMMUNITY_PUBLISH'), ('GO', 'COMMUNITY_FOLLOW'),
  ('GO', 'COMMUNITY_SAVE'), ('GO', 'GROUP_JOIN'), ('GO', 'ACTIVITY_JOIN'),
  ('PLUS', 'FOUNDER_INBOX_ACCESS'), ('PLUS', 'FOUNDER_DM'),
  ('PRO', 'FOUNDER_PRIORITY_INBOX'), ('PRO', 'FOUNDER_PRO_FEED'),
  ('PRO', 'FOUNDER_CIRCLE_ACCESS'), ('PRO', 'FOUNDER_CONTACT_REQUEST'),
  ('PRO_MAX', 'CREATOR_LAB_ACCESS'), ('PRO_MAX', 'VIBE_CODING_ACCESS'),
  ('PRO_MAX', 'CODE_HUB_ACCESS'), ('PRO_MAX', 'CODE_DOWNLOAD_ACCESS'),
  ('PRO_MAX', 'FOUNDER_CURATED_SOCIAL_ACCESS'), ('PRO_MAX', 'VIBE_CODING'),
  ('PRO_MAX', 'CODE_HUB'), ('PRO_MAX', 'SOURCE_DOWNLOAD'), ('PRO_MAX', 'RELEASE_DOWNLOAD'),
  ('PRO_MAX', 'MEDIA_STORAGE_PLUS')
ON CONFLICT (plan_code, code) DO NOTHING;

ALTER TABLE entitlements
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MEMBERSHIP',
  ADD COLUMN IF NOT EXISTS benefit_grant_id uuid,
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Campaigns, coupons, secure redemption codes, and benefit grants.
-- ---------------------------------------------------------------------------

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'ALL_USERS',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE campaigns
  DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_status_check CHECK (status IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ENDED', 'CANCELLED')),
  ADD CONSTRAINT campaigns_audience_check CHECK (audience IN (
    'ALL_USERS', 'NEW_USERS', 'FREE_USERS', 'GO_USERS', 'PLUS_USERS', 'PRO_USERS',
    'PRO_MAX_USERS', 'SELECTED_USERS', 'INVITED_USERS'
  ));

-- An Admin defines campaign benefits once. Consumer claims reference only the
-- opaque campaign id; they cannot choose a benefit, target, amount, or plan.
CREATE TABLE IF NOT EXISTS campaign_benefit_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  benefit_type text NOT NULL CHECK (benefit_type IN (
    'MEMBERSHIP_DAYS', 'TEMP_ENTITLEMENT', 'STORAGE_BYTES', 'BADGE', 'FEATURE_ACCESS'
  )),
  capability text,
  membership_days integer,
  plan_code mezip_plan_code,
  storage_bytes bigint,
  badge_code text,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (benefit_type IN ('TEMP_ENTITLEMENT', 'FEATURE_ACCESS') AND capability IS NOT NULL)
    OR (benefit_type = 'MEMBERSHIP_DAYS' AND membership_days > 0 AND plan_code IS NOT NULL)
    OR (benefit_type = 'STORAGE_BYTES' AND storage_bytes > 0)
    OR (benefit_type = 'BADGE' AND badge_code IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS campaign_benefit_templates_campaign_idx
  ON campaign_benefit_templates (campaign_id);

-- Selected campaign audiences are opaque server-side assignments. They are
-- never included in a customer projection or written by a customer request.
CREATE TABLE IF NOT EXISTS campaign_targets (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);
CREATE INDEX IF NOT EXISTS campaign_targets_user_idx ON campaign_targets (user_id, campaign_id);

CREATE TABLE IF NOT EXISTS campaign_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  user_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id),
  UNIQUE (user_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS campaign_claim_benefit_grants (
  campaign_claim_id uuid NOT NULL REFERENCES campaign_claims(id) ON DELETE CASCADE,
  benefit_grant_id uuid NOT NULL REFERENCES benefit_grants(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_claim_id, benefit_grant_id)
);

ALTER TABLE benefit_grants
  ALTER COLUMN capability DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS plan_code mezip_plan_code,
  ADD COLUMN IF NOT EXISTS membership_days integer,
  ADD COLUMN IF NOT EXISTS storage_bytes bigint,
  ADD COLUMN IF NOT EXISTS badge_code text,
  ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES coupons(id),
  ADD COLUMN IF NOT EXISTS redemption_code_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE benefit_grants
  DROP CONSTRAINT IF EXISTS benefit_grants_capability_check,
  DROP CONSTRAINT IF EXISTS benefit_grants_source_check;
ALTER TABLE benefit_grants
  ADD CONSTRAINT benefit_grants_source_check CHECK (source IN (
    'PURCHASE', 'TRIAL', 'COUPON', 'REDEMPTION', 'CAMPAIGN', 'ADMIN_GRANT',
    'INVITE_REWARD', 'FOUNDER_INTERNAL', 'SYSTEM', 'GIFT', 'SINGLE_BENEFIT',
    'TEMPORARY', 'GRAY_ROLLOUT', 'FOUNDER', 'PROMO'
  )),
  ADD CONSTRAINT benefit_grants_shape_check CHECK (
    (benefit_type IN ('CAPABILITY', 'TEMP_ENTITLEMENT', 'FEATURE_ACCESS') AND capability IS NOT NULL)
    OR (benefit_type = 'MEMBERSHIP_DAYS' AND membership_days > 0 AND plan_code IS NOT NULL)
    OR (benefit_type = 'STORAGE_BYTES' AND storage_bytes > 0)
    OR (benefit_type = 'COUPON' AND coupon_id IS NOT NULL)
    OR (benefit_type = 'BADGE' AND badge_code IS NOT NULL)
  );
CREATE INDEX IF NOT EXISTS benefit_grants_storage_window_idx ON benefit_grants (user_id, storage_bytes, starts_at, ends_at) WHERE storage_bytes IS NOT NULL;

ALTER TABLE coupons
  ALTER COLUMN capability DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS discount_kind text NOT NULL DEFAULT 'FIXED_FEN',
  ADD COLUMN IF NOT EXISTS discount_value integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS applicable_plan_codes mezip_plan_code[] NOT NULL DEFAULT ARRAY['GO', 'PLUS', 'PRO', 'PRO_MAX']::mezip_plan_code[],
  ADD COLUMN IF NOT EXISTS redeemed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE coupons
  DROP CONSTRAINT IF EXISTS coupons_capability_check,
  ADD CONSTRAINT coupons_discount_check CHECK (
    (discount_kind = 'FIXED_FEN' AND discount_value > 0)
    OR (discount_kind = 'PERCENTAGE' AND discount_value BETWEEN 1 AND 100)
  ),
  ADD CONSTRAINT coupons_applicable_plans_check CHECK (cardinality(applicable_plan_codes) > 0),
  ADD CONSTRAINT coupons_redemption_count_check CHECK (redeemed_count >= 0);

CREATE TABLE IF NOT EXISTS redemption_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  code_prefix text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'EXHAUSTED', 'EXPIRED', 'REVOKED')),
  max_redemptions integer NOT NULL DEFAULT 1 CHECK (max_redemptions > 0),
  redeemed_count integer NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0),
  membership_days integer CHECK (membership_days IS NULL OR membership_days > 0),
  plan_code mezip_plan_code,
  storage_bytes bigint CHECK (storage_bytes IS NULL OR storage_bytes > 0),
  capability text,
  badge_code text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  created_by_admin_id uuid REFERENCES admin_identities(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (membership_days IS NOT NULL OR storage_bytes IS NOT NULL OR capability IS NOT NULL OR badge_code IS NOT NULL),
  CHECK (membership_days IS NULL OR plan_code IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS redemption_codes_active_idx ON redemption_codes (status, starts_at, ends_at);

ALTER TABLE benefit_grants
  ADD CONSTRAINT benefit_grants_redemption_code_fk FOREIGN KEY (redemption_code_id) REFERENCES redemption_codes(id);

ALTER TABLE redemptions
  ALTER COLUMN coupon_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS redemption_code_id uuid REFERENCES redemption_codes(id),
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE redemptions
  ADD CONSTRAINT redemptions_target_check CHECK (coupon_id IS NOT NULL OR redemption_code_id IS NOT NULL),
  ADD CONSTRAINT redemptions_order_coupon_check CHECK (order_id IS NULL OR coupon_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS redemptions_code_user_once_unique
  ON redemptions (redemption_code_id, user_id) WHERE redemption_code_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS redemptions_order_coupon_once_unique
  ON redemptions (order_id) WHERE order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS redemption_benefit_grants (
  redemption_id uuid NOT NULL REFERENCES redemptions(id) ON DELETE CASCADE,
  benefit_grant_id uuid NOT NULL REFERENCES benefit_grants(id) ON DELETE CASCADE,
  PRIMARY KEY (redemption_id, benefit_grant_id)
);

CREATE TABLE IF NOT EXISTS badges (
  code text PRIMARY KEY,
  display_name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_badges (
  user_id uuid NOT NULL REFERENCES users(id),
  badge_code text NOT NULL REFERENCES badges(code),
  benefit_grant_id uuid REFERENCES benefit_grants(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (user_id, badge_code)
);

CREATE TABLE IF NOT EXISTS invite_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id uuid NOT NULL REFERENCES users(id),
  invited_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invited_user_id),
  CHECK (inviter_user_id <> invited_user_id)
);
CREATE TABLE IF NOT EXISTS invite_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_relationship_id uuid NOT NULL REFERENCES invite_relationships(id),
  benefit_grant_id uuid NOT NULL REFERENCES benefit_grants(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invite_relationship_id, benefit_grant_id)
);

CREATE TABLE IF NOT EXISTS storage_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  benefit_grant_id uuid REFERENCES benefit_grants(id),
  bytes bigint NOT NULL CHECK (bytes > 0),
  source text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS storage_grants_user_window_idx ON storage_grants (user_id, starts_at, ends_at);

-- Append-only admin audit; there is no consumer INSERT/UPDATE/DELETE policy.
CREATE TABLE IF NOT EXISTS membership_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_identity_id uuid NOT NULL REFERENCES admin_identities(id),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  target_user_id uuid REFERENCES users(id),
  capability text NOT NULL CHECK (capability IN (
    'MANAGE_CAMPAIGNS', 'MANAGE_COUPONS', 'MANAGE_REDEMPTIONS', 'GRANT_BENEFITS',
    'MANAGE_MEMBERSHIPS', 'VIEW_PAYMENT_METADATA'
  )),
  action text NOT NULL,
  resource_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS membership_admin_audit_admin_created_idx ON membership_admin_audit (admin_identity_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Entitlement query helpers. Normal members are constrained by a server-set
-- principal; membership is never a privacy audience or cross-owner read rule.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION mezip_phase6_plan_rank(candidate_plan mezip_plan_code)
RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE candidate_plan
    WHEN 'FREE' THEN 0
    WHEN 'GO' THEN 1
    WHEN 'PLUS' THEN 2
    WHEN 'PRO' THEN 3
    WHEN 'PRO_MAX' THEN 4
  END;
$$;

-- Durable audience evaluation shared by coupon reservations and self-service
-- claims. It accepts only server-derived opaque ids and checks the canonical
-- plan, invitation and selected-target relations in PostgreSQL.
CREATE OR REPLACE FUNCTION mezip_phase6_campaign_audience_allowed(
  candidate_campaign_id uuid,
  candidate_user_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH campaign AS (
    SELECT c.id, c.audience
    FROM campaigns c
    WHERE c.id = candidate_campaign_id
      AND c.status = 'ACTIVE'
      AND c.starts_at <= now()
      AND (c.ends_at IS NULL OR c.ends_at > now())
  ), active_plan AS (
    SELECT COALESCE((
      SELECT s.plan_code
      FROM subscriptions s
      WHERE s.owner_id = candidate_user_id
        AND s.status = 'ACTIVE'
        AND s.revoked_at IS NULL
        AND s.starts_at <= now()
        AND s.ends_at > now()
      ORDER BY mezip_phase6_plan_rank(s.plan_code) DESC, s.ends_at DESC
      LIMIT 1
    ), 'FREE'::mezip_plan_code) AS code
  )
  SELECT EXISTS (
    SELECT 1 FROM campaign c, active_plan p
    WHERE c.audience = 'ALL_USERS'
      OR (c.audience = 'FREE_USERS' AND p.code = 'FREE')
      OR (c.audience = 'GO_USERS' AND p.code = 'GO')
      OR (c.audience = 'PLUS_USERS' AND p.code = 'PLUS')
      OR (c.audience = 'PRO_USERS' AND p.code = 'PRO')
      OR (c.audience = 'PRO_MAX_USERS' AND p.code = 'PRO_MAX')
      OR (c.audience = 'SELECTED_USERS' AND EXISTS (
        SELECT 1 FROM campaign_targets ct
        WHERE ct.campaign_id = c.id AND ct.user_id = candidate_user_id
      ))
      OR (c.audience = 'INVITED_USERS' AND EXISTS (
        SELECT 1 FROM invite_relationships ir
        WHERE ir.invited_user_id = candidate_user_id
      ))
      -- NEW_USERS fails closed until a server-owned cohort relation exists.
  );
$$;

-- This helper accepts an explicit candidate user only because the trusted
-- server-side checkout / campaign transaction needs to validate it before it
-- creates a durable grant.  It must never be callable by an ordinary database
-- role: otherwise it could be used to probe selected campaign targets,
-- invitation relationships, or a user's current paid tier.  The migration
-- owner retains execution; a separately deployed server role must receive an
-- explicit, deployment-time EXECUTE grant and no consumer role may receive one.
REVOKE ALL ON FUNCTION mezip_phase6_campaign_audience_allowed(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION mezip_capability_allowed(candidate_capability text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH current_principal AS (
    SELECT mezip_setting_uuid('mezip.principal_id') AS user_id
  ), active_rank AS (
    SELECT COALESCE(MAX(mezip_phase6_plan_rank(s.plan_code)), 0) AS rank
    FROM subscriptions s, current_principal p
    WHERE s.owner_id = p.user_id
      AND s.status = 'ACTIVE'
      AND s.revoked_at IS NULL
      AND s.starts_at <= now()
      AND s.ends_at > now()
  )
  SELECT EXISTS (
    SELECT 1 FROM plan_entitlements pe, active_rank ar
    WHERE pe.code = candidate_capability
      AND mezip_phase6_plan_rank(pe.plan_code) <= ar.rank
  ) OR EXISTS (
    SELECT 1 FROM entitlements e, current_principal p
    WHERE e.owner_id = p.user_id
      AND e.code = candidate_capability
      AND e.valid_from <= now()
      AND (e.valid_until IS NULL OR e.valid_until > now())
      AND e.revoked_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM benefit_grants bg, current_principal p
    WHERE bg.user_id = p.user_id
      AND bg.capability = candidate_capability
      AND bg.starts_at <= now()
      AND (bg.ends_at IS NULL OR bg.ends_at > now())
      AND bg.revoked_at IS NULL
  );
$$;

-- Replaces the Phase 4 function so revocation is effective for Founder
-- published-audience reads. This function still grants no access to private
-- Archive/Media/Messages rows; those remain owner-scoped independently.
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
  SELECT COALESCE(MAX(mezip_phase6_plan_rank(s.plan_code)), 0)
  INTO plan_rank
  FROM subscriptions s
  WHERE s.owner_id = principal_id
    AND s.status = 'ACTIVE'
    AND s.revoked_at IS NULL
    AND s.starts_at <= now()
    AND s.ends_at > now();
  IF plan_rank >= required_rank THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM entitlements e
    WHERE e.owner_id = principal_id
      AND e.code = candidate_audience
      AND e.valid_from <= now()
      AND (e.valid_until IS NULL OR e.valid_until > now())
      AND e.revoked_at IS NULL
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: consumer reads are self-scoped. Payment callbacks and admin operations
-- use a server role and audited API, never a client-selected RLS bypass.
-- ---------------------------------------------------------------------------

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE benefit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemption_benefit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_claim_benefit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_idempotency ENABLE ROW LEVEL SECURITY;

-- Catalog, campaign targeting, coupon definitions and redemption-code hashes
-- are internal-only. Consumer endpoints obtain their safe projections through
-- the server API; no direct policy is installed for these relations. The
-- migration/server role must use a dedicated BYPASSRLS service role for its
-- transactional catalog, callback and Admin writes.
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_entitlements FORCE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons FORCE ROW LEVEL SECURITY;
ALTER TABLE redemption_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemption_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE campaign_benefit_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_benefit_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE campaign_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_targets FORCE ROW LEVEL SECURITY;

ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_events FORCE ROW LEVEL SECURITY;
ALTER TABLE refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE entitlements FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_history FORCE ROW LEVEL SECURITY;
ALTER TABLE benefit_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE redemptions FORCE ROW LEVEL SECURITY;
ALTER TABLE user_badges FORCE ROW LEVEL SECURITY;
ALTER TABLE invite_relationships FORCE ROW LEVEL SECURITY;
ALTER TABLE invite_rewards FORCE ROW LEVEL SECURITY;
ALTER TABLE storage_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_admin_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE redemption_benefit_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE campaign_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE campaign_claim_benefit_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_idempotency FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_owner_read ON subscriptions;
CREATE POLICY subscriptions_owner_read ON subscriptions FOR SELECT
  USING (owner_id = mezip_setting_uuid('mezip.principal_id'));
DROP POLICY IF EXISTS orders_owner_read ON orders;
CREATE POLICY orders_owner_read ON orders FOR SELECT
  USING (owner_id = mezip_setting_uuid('mezip.principal_id'));
DROP POLICY IF EXISTS payment_transactions_owner_read ON payment_transactions;
CREATE POLICY payment_transactions_owner_read ON payment_transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.owner_id = mezip_setting_uuid('mezip.principal_id')));
DROP POLICY IF EXISTS refunds_owner_read ON refunds;
CREATE POLICY refunds_owner_read ON refunds FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.owner_id = mezip_setting_uuid('mezip.principal_id')));
DROP POLICY IF EXISTS entitlements_owner_read ON entitlements;
CREATE POLICY entitlements_owner_read ON entitlements FOR SELECT
  USING (owner_id = mezip_setting_uuid('mezip.principal_id'));
DROP POLICY IF EXISTS membership_history_owner_read ON membership_history;
CREATE POLICY membership_history_owner_read ON membership_history FOR SELECT
  USING (user_id = mezip_setting_uuid('mezip.principal_id'));
DROP POLICY IF EXISTS phase6_benefit_grants_owner_read ON benefit_grants;
DROP POLICY IF EXISTS benefit_grants_owner_policy ON benefit_grants;
CREATE POLICY phase6_benefit_grants_owner_read ON benefit_grants FOR SELECT
  USING (user_id = mezip_setting_uuid('mezip.principal_id'));
DROP POLICY IF EXISTS phase6_redemptions_owner_read ON redemptions;
DROP POLICY IF EXISTS redemptions_owner_policy ON redemptions;
CREATE POLICY phase6_redemptions_owner_read ON redemptions FOR SELECT
  USING (user_id = mezip_setting_uuid('mezip.principal_id'));
DROP POLICY IF EXISTS user_badges_owner_read ON user_badges;
CREATE POLICY user_badges_owner_read ON user_badges FOR SELECT
  USING (user_id = mezip_setting_uuid('mezip.principal_id'));
DROP POLICY IF EXISTS invite_relationships_participant_read ON invite_relationships;
CREATE POLICY invite_relationships_participant_read ON invite_relationships FOR SELECT
  USING (inviter_user_id = mezip_setting_uuid('mezip.principal_id') OR invited_user_id = mezip_setting_uuid('mezip.principal_id'));
DROP POLICY IF EXISTS invite_rewards_owner_read ON invite_rewards;
CREATE POLICY invite_rewards_owner_read ON invite_rewards FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM invite_relationships ir
    WHERE ir.id = invite_relationship_id
      AND (ir.inviter_user_id = mezip_setting_uuid('mezip.principal_id') OR ir.invited_user_id = mezip_setting_uuid('mezip.principal_id'))
  ));
DROP POLICY IF EXISTS storage_grants_owner_read ON storage_grants;
CREATE POLICY storage_grants_owner_read ON storage_grants FOR SELECT
  USING (user_id = mezip_setting_uuid('mezip.principal_id'));
DROP POLICY IF EXISTS campaign_claims_owner_read ON campaign_claims;
CREATE POLICY campaign_claims_owner_read ON campaign_claims FOR SELECT
  USING (user_id = mezip_setting_uuid('mezip.principal_id'));

-- `payment_events`, `membership_admin_audit`, `redemption_benefit_grants`,
-- `campaigns`, `coupons`, `redemption_codes`, `plan_entitlements`, and the
-- catalog are server/internal relations. There is intentionally no consumer
-- direct policy that would disclose callback metadata, code hashes, or audits.
