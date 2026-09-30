-- ME.zip Phase 21 — Billing platform/provider completion.
--
-- This migration extends the canonical Phase 6 commerce relations. It does
-- not create a second order, payment or membership system. The application
-- remains responsible for server-side provider verification; these records
-- make platform mapping and reconciliation durable when a production service
-- role is configured.

ALTER TYPE mezip_subscription_status ADD VALUE IF NOT EXISTS 'PAST_DUE';
ALTER TYPE mezip_subscription_status ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE mezip_subscription_status ADD VALUE IF NOT EXISTS 'UNKNOWN';

-- StoreKit uses a product identifier, but no client can turn that identifier
-- into a plan. The server reads this internal registry after verifying the
-- signed transaction. No consumer RLS policy is installed.
CREATE TABLE IF NOT EXISTS billing_provider_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('WECHAT_PAY', 'ALIPAY', 'UNIONPAY', 'APPLE_IAP')),
  platform text NOT NULL CHECK (platform IN ('WEB', 'WECHAT_MINI_PROGRAM', 'IOS', 'ANDROID')),
  plan_code mezip_plan_code NOT NULL CHECK (plan_code <> 'FREE'),
  external_product_id text NOT NULL,
  status text NOT NULL DEFAULT 'NOT_CONFIGURED'
    CHECK (status IN ('NOT_CONFIGURED', 'SANDBOX', 'READY', 'VERIFIED', 'DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, platform, external_product_id),
  UNIQUE (provider, platform, plan_code)
);

-- Phase 6 already captured order/price snapshots and callback receipts. This
-- adds provider/subscription lifecycle metadata without changing the existing
-- non-auto-renewing monthly-pass policy.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS external_subscription_id text,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_provider_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_provider_check
  CHECK (provider IS NULL OR provider IN ('WECHAT_PAY', 'ALIPAY', 'UNIONPAY', 'APPLE_IAP', 'MOCK'));
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_external_unique
  ON subscriptions (provider, external_subscription_id)
  WHERE provider IS NOT NULL AND external_subscription_id IS NOT NULL;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_provider_check;
ALTER TABLE orders ADD CONSTRAINT orders_provider_check
  CHECK (provider IS NULL OR provider IN ('WECHAT_PAY', 'ALIPAY', 'UNIONPAY', 'APPLE_IAP', 'MOCK'));

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_provider_check;
ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_provider_check
  CHECK (provider IN ('WECHAT_PAY', 'ALIPAY', 'UNIONPAY', 'APPLE_IAP', 'MOCK'));

ALTER TABLE payment_events DROP CONSTRAINT IF EXISTS payment_events_provider_check;
ALTER TABLE payment_events ADD CONSTRAINT payment_events_provider_check
  CHECK (provider IN ('WECHAT_PAY', 'ALIPAY', 'UNIONPAY', 'APPLE_IAP', 'MOCK'));

ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_provider_check;
ALTER TABLE refunds ADD CONSTRAINT refunds_provider_check
  CHECK (provider IS NULL OR provider IN ('WECHAT_PAY', 'ALIPAY', 'UNIONPAY', 'APPLE_IAP', 'MOCK'));
ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_status_check;
ALTER TABLE refunds ADD CONSTRAINT refunds_status_check
  CHECK (status IN ('REQUESTED', 'PENDING', 'VERIFIED', 'SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELLED'));

-- Reconciliation is server-worker-only. A provider query can flag an order
-- for verification but cannot itself grant access; only a verified callback or
-- StoreKit transaction enters the canonical payment-events transaction.
CREATE TABLE IF NOT EXISTS billing_reconciliation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text,
  status text NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIALLY_FAILED', 'FAILED')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  idempotency_key text NOT NULL UNIQUE,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS billing_reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES billing_reconciliation_jobs(id) ON DELETE CASCADE,
  payment_transaction_id uuid REFERENCES payment_transactions(id),
  result text NOT NULL CHECK (result IN ('PENDING', 'AWAITING_VERIFICATION', 'CLOSED', 'PROVIDER_UNAVAILABLE', 'FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, payment_transaction_id)
);

ALTER TABLE billing_provider_product_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_provider_product_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_reconciliation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_reconciliation_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_reconciliation_items FORCE ROW LEVEL SECURITY;

-- Do not grant these relations to consumer roles. A dedicated server role
-- performs migration, provider mapping and reconciliation work.
