-- ME.zip Phase 9 — durable Personal AI indexing and export hardening.
--
-- This is additive to 010.  It prepares the database for the server-only
-- owner-scoped repository/worker contract; it does not make a browser, Mini
-- client, migration role, or generic table owner a Personal AI reader.

BEGIN;

-- Earlier local 010 builds may have allowed a derived AI insight truth-layer
-- in sources/citations. It is neither Original nor archive evidence, so clear
-- that derived index residue before enforcing the current allow-list.
DELETE FROM personal_knowledge_sources WHERE truth_layer = 'AI_INSIGHT';
DELETE FROM personal_ai_citations WHERE truth_layer = 'AI_INSIGHT';
ALTER TABLE personal_knowledge_sources
  DROP CONSTRAINT IF EXISTS personal_knowledge_sources_truth_layer_check;
ALTER TABLE personal_knowledge_sources
  ADD CONSTRAINT personal_knowledge_sources_truth_layer_check
  CHECK (truth_layer IN ('ORIGINAL', 'REVISION', 'PUBLISHED_SNAPSHOT'));
ALTER TABLE personal_ai_citations
  DROP CONSTRAINT IF EXISTS personal_ai_citations_truth_layer_check;
ALTER TABLE personal_ai_citations
  ADD CONSTRAINT personal_ai_citations_truth_layer_check
  CHECK (truth_layer IN ('ORIGINAL', 'REVISION', 'PUBLISHED_SNAPSHOT'));

-- A nullable revision in a normal UNIQUE constraint admits multiple NULL
-- rows in PostgreSQL.  This expression index makes the unrevisioned source
-- identity durable and idempotent without changing historical IDs.
CREATE UNIQUE INDEX IF NOT EXISTS personal_knowledge_sources_owner_identity_v2_uq
  ON personal_knowledge_sources (
    owner_user_id,
    source_type,
    source_id,
    truth_layer,
    COALESCE(revision_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

ALTER TABLE personal_knowledge_sources
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS invalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS invalidation_reason text;

ALTER TABLE personal_knowledge_sources
  DROP CONSTRAINT IF EXISTS personal_knowledge_sources_content_hash_check;
ALTER TABLE personal_knowledge_sources
  ADD CONSTRAINT personal_knowledge_sources_content_hash_check
  CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$');

-- Job input must survive process restart and be claimable by exactly one
-- worker lease.  Inputs are IDs and a request digest only: no principal,
-- session, source body, prompt, provider key, or raw media is copied here.
ALTER TABLE personal_index_jobs
  ADD COLUMN IF NOT EXISTS selected_entry_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN IF NOT EXISTS selected_media_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN IF NOT EXISTS include_historical_revisions boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS request_fingerprint text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

ALTER TABLE personal_index_jobs
  DROP CONSTRAINT IF EXISTS personal_index_jobs_request_fingerprint_check;
ALTER TABLE personal_index_jobs
  ADD CONSTRAINT personal_index_jobs_request_fingerprint_check
  CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[a-f0-9]{64}$');
CREATE UNIQUE INDEX IF NOT EXISTS personal_index_jobs_owner_idempotency_uq
  ON personal_index_jobs (owner_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
ALTER TABLE personal_index_jobs
  DROP CONSTRAINT IF EXISTS personal_index_jobs_owner_id_uq;
ALTER TABLE personal_index_jobs
  ADD CONSTRAINT personal_index_jobs_owner_id_uq UNIQUE (owner_user_id, id);
CREATE INDEX IF NOT EXISTS personal_index_jobs_claim_idx
  ON personal_index_jobs (status, available_at, lease_expires_at, created_at)
  WHERE status IN ('PENDING', 'INDEXING');

-- Keep content protected at rest for durable repository implementations.  The
-- legacy `text` column remains for backwards-compatible local fixtures only;
-- a production repository writes the encrypted fields and must not return raw
-- text to a client-facing projection.
ALTER TABLE personal_knowledge_chunks
  ADD COLUMN IF NOT EXISTS text_ciphertext text,
  ADD COLUMN IF NOT EXISTS text_key_reference text,
  ADD COLUMN IF NOT EXISTS encryption_algorithm text,
  ADD COLUMN IF NOT EXISTS encryption_version text;
-- New durable writes are prevented from using the legacy non-null `text`
-- column as a plaintext cache.  Existing 010/local-fixture rows are not
-- retroactively validated here; a deployment must backfill or purge them
-- before VALIDATE CONSTRAINT, while all future writes must be hash-marker plus
-- a complete encrypted envelope.
ALTER TABLE personal_knowledge_chunks
  DROP CONSTRAINT IF EXISTS personal_knowledge_chunks_protected_payload_check;
ALTER TABLE personal_knowledge_chunks
  ADD CONSTRAINT personal_knowledge_chunks_protected_payload_check
  CHECK (
    text ~ '^[a-f0-9]{64}$'
    AND text_ciphertext IS NOT NULL AND length(text_ciphertext) >= 16
    AND text_key_reference IS NOT NULL AND length(text_key_reference) > 0
    AND encryption_algorithm IS NOT NULL AND length(encryption_algorithm) > 0
    AND encryption_version IS NOT NULL AND length(encryption_version) > 0
  ) NOT VALID;

-- Citation records gain a direct owner-composite source relation.  Existing
-- rows are backfilled only where an exact owner/type/source/revision source is
-- available.  Repository migration/rehearsal must resolve any legacy orphan
-- before enforcing NOT NULL for a fully deployed dataset.
ALTER TABLE personal_ai_citations
  ADD COLUMN IF NOT EXISTS source_record_id uuid;
UPDATE personal_ai_citations citation
SET source_record_id = source.id
FROM personal_knowledge_sources source
WHERE citation.source_record_id IS NULL
  AND source.owner_user_id = citation.owner_user_id
  AND source.source_type = citation.source_type
  AND source.source_id = citation.source_id
  AND source.truth_layer = citation.truth_layer
  AND COALESCE(source.revision_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = COALESCE(citation.revision_id, '00000000-0000-0000-0000-000000000000'::uuid);
-- Do not silently ship a weak FK for legacy/orphaned citations.  An operator
-- must resolve or purge any row that cannot be tied to an owner-scoped source
-- before this migration can complete.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM personal_ai_citations WHERE source_record_id IS NULL) THEN
    RAISE EXCEPTION 'Phase 9 migration found Personal AI citations without an owner-scoped source record.';
  END IF;
END $$;
ALTER TABLE personal_ai_citations
  ALTER COLUMN source_record_id SET NOT NULL;
ALTER TABLE personal_ai_citations
  DROP CONSTRAINT IF EXISTS personal_ai_citations_source_owner_fk;
ALTER TABLE personal_ai_citations
  ADD CONSTRAINT personal_ai_citations_source_owner_fk
  FOREIGN KEY (owner_user_id, source_record_id)
  REFERENCES personal_knowledge_sources (owner_user_id, id)
  ON DELETE RESTRICT;
-- The server repository upserts only through owner-composite identities.
-- These constraints make that conflict target legal while the existing global
-- primary key continues to reject accidental cross-owner ID reuse.
ALTER TABLE personal_ai_citations
  DROP CONSTRAINT IF EXISTS personal_ai_citations_owner_id_uq;
ALTER TABLE personal_ai_citations
  ADD CONSTRAINT personal_ai_citations_owner_id_uq UNIQUE (owner_user_id, id);
ALTER TABLE ai_insights
  DROP CONSTRAINT IF EXISTS ai_insights_owner_id_uq;
ALTER TABLE ai_insights
  ADD CONSTRAINT ai_insights_owner_id_uq UNIQUE (owner_user_id, id);

-- Append-only consent history.  Preferences retain the current projection;
-- this table is needed for user export, withdrawal audit, and reauthorization
-- of queued index work after restart.
CREATE TABLE IF NOT EXISTS personal_ai_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_version text,
  event_type text NOT NULL CHECK (event_type IN ('ACCEPTED', 'WITHDRAWN')),
  provider_disclosure_version text,
  policy_hash text CHECK (policy_hash IS NULL OR policy_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS personal_ai_consent_events_owner_idempotency_uq
  ON personal_ai_consent_events (owner_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Transactional outbox.  It contains identifiers/digests only; delivery is
-- at-least-once and a worker must still atomically claim its job lease.
CREATE TABLE IF NOT EXISTS personal_ai_index_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES personal_index_jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('INDEX_JOB_QUEUED', 'INDEX_JOB_RETRY', 'SOURCE_INVALIDATED')),
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DISPATCHING', 'DISPATCHED', 'FAILED')),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  dispatched_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id)
);
ALTER TABLE personal_ai_index_outbox
  DROP CONSTRAINT IF EXISTS personal_ai_index_outbox_job_owner_fk;
ALTER TABLE personal_ai_index_outbox
  ADD CONSTRAINT personal_ai_index_outbox_job_owner_fk
  FOREIGN KEY (owner_user_id, job_id)
  REFERENCES personal_index_jobs (owner_user_id, id)
  ON DELETE CASCADE;
-- A retry must reuse the canonical event for a committed job.  This prevents
-- an implementation error from producing a second queued message with the
-- same identifiers/digest while preserving distinct retry/invalidation event
-- kinds where they are genuinely required.
CREATE UNIQUE INDEX IF NOT EXISTS personal_ai_index_outbox_owner_job_event_fingerprint_uq
  ON personal_ai_index_outbox (owner_user_id, job_id, event_type, payload_fingerprint);
CREATE INDEX IF NOT EXISTS personal_ai_index_outbox_claim_idx
  ON personal_ai_index_outbox (status, available_at, lease_expires_at, created_at)
  WHERE status IN ('PENDING', 'DISPATCHING', 'FAILED');

-- Metadata-only Personal AI export foundation.  The export document never
-- receives raw vectors, chunk text, archive content, prompts, answers, or
-- provider secrets; its result digest is a server artifact reference only.
CREATE TABLE IF NOT EXISTS personal_ai_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED', 'DELETED')),
  format text NOT NULL CHECK (format = 'JSON'),
  include_conversations boolean NOT NULL DEFAULT false,
  include_deleted_insights boolean NOT NULL DEFAULT false,
  requested_sections text[] NOT NULL DEFAULT ARRAY[]::text[],
  result_digest text,
  error_code text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  UNIQUE (owner_user_id, id)
);

-- Existing direct raw tables plus newly introduced tables are FORCE RLS.  No
-- consumer policy is granted here: a reviewed server role/repository is the
-- owner-scoped projection boundary and must be exercised during deployment.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'personal_ai_consent_events',
    'personal_ai_index_outbox',
    'personal_ai_export_jobs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

COMMIT;
