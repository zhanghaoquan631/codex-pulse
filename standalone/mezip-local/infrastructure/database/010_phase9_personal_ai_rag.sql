-- ME.zip Phase 9 — Personal Knowledge / Ask My Archive foundation.
--
-- Embeddings are derived, owner-isolated data. Every table carries the
-- authenticated owner and is FORCE RLS protected. The schema deliberately has
-- no private-message source, Root read path, plaintext provider credential, or
-- automatic media/OCR ingestion. Original archive rows remain the source of
-- truth; this migration only stores derived index/query/insight metadata.

BEGIN;

CREATE TABLE IF NOT EXISTS personal_ai_index_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE CHECK (version ~ '^[a-z0-9][a-z0-9._-]{1,119}$'),
  chunk_strategy text NOT NULL,
  embedding_model_code text NOT NULL,
  schema_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'RETIRED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personal_knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('LIFE', 'TIMELINE', 'HISTORY', 'FITNESS', 'STEPS', 'DAILY_PACK', 'AI_USAGE', 'TAGS', 'PUBLISHED_SNAPSHOT')),
  source_id uuid NOT NULL,
  canonical_source_id uuid NOT NULL,
  -- Derived AI Insights live only in ai_insights and must never be re-ingested
  -- as Personal Knowledge source truth.
  truth_layer text NOT NULL CHECK (truth_layer IN ('ORIGINAL', 'REVISION', 'PUBLISHED_SNAPSHOT')),
  revision_id uuid,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('PRIVATE', 'SNAPSHOT')),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'TRASHED', 'DELETED')),
  title text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  index_version_id uuid REFERENCES personal_ai_index_versions(id) ON DELETE RESTRICT,
  index_status text NOT NULL CHECK (index_status IN ('PENDING', 'INDEXING', 'READY', 'STALE', 'FAILED', 'DELETED')),
  related_source_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, source_type, source_id, truth_layer, revision_id)
);

CREATE TABLE IF NOT EXISTS personal_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id uuid NOT NULL,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  text text NOT NULL CHECK (length(text) > 0),
  token_estimate integer NOT NULL CHECK (token_estimate > 0),
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  index_version_id uuid NOT NULL REFERENCES personal_ai_index_versions(id) ON DELETE RESTRICT,
  embedding_status text NOT NULL CHECK (embedding_status IN ('PENDING', 'READY', 'FAILED', 'DELETED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, source_id, chunk_index, index_version_id)
);

ALTER TABLE personal_knowledge_chunks
  ADD CONSTRAINT personal_knowledge_chunks_source_owner_fk
  FOREIGN KEY (owner_user_id, source_id)
  REFERENCES personal_knowledge_sources(owner_user_id, id)
  ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS personal_knowledge_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_id uuid NOT NULL,
  embedding_model_code text NOT NULL,
  -- JSON keeps local development deterministic and allows a reviewed vector
  -- extension/provider to replace this column without changing the domain API.
  vector jsonb NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('READY', 'DELETED', 'FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, chunk_id, embedding_model_code)
);

ALTER TABLE personal_knowledge_embeddings
  ADD CONSTRAINT personal_knowledge_embeddings_chunk_owner_fk
  FOREIGN KEY (owner_user_id, chunk_id)
  REFERENCES personal_knowledge_chunks(owner_user_id, id)
  ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS personal_index_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('NONE', 'SELECTED_ENTRY', 'SELECTED_ENTRIES', 'CURRENT_DAY', 'DATE_RANGE', 'LIFE', 'TIMELINE', 'HISTORY', 'FITNESS', 'DAILY_PACK', 'AI_USAGE', 'SELECTED_MEDIA', 'USER_SELECTED_ARCHIVE')),
  date_from timestamptz,
  date_to timestamptz,
  source_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL CHECK (status IN ('PENDING', 'INDEXING', 'READY', 'STALE', 'FAILED', 'DELETED')),
  index_version_id uuid NOT NULL REFERENCES personal_ai_index_versions(id) ON DELETE RESTRICT,
  indexed_source_count integer NOT NULL DEFAULT 0 CHECK (indexed_source_count >= 0),
  indexed_chunk_count integer NOT NULL DEFAULT 0 CHECK (indexed_chunk_count >= 0),
  failed_source_count integer NOT NULL DEFAULT 0 CHECK (failed_source_count >= 0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CHECK (date_to IS NULL OR date_from IS NULL OR date_to >= date_from)
);

CREATE TABLE IF NOT EXISTS personal_ai_preferences (
  owner_user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  archive_mode text NOT NULL DEFAULT 'ARCHIVE_ONLY' CHECK (archive_mode IN ('ARCHIVE_ONLY', 'ARCHIVE_PLUS_GENERAL')),
  default_scope text NOT NULL DEFAULT 'NONE' CHECK (default_scope IN ('NONE', 'SELECTED_ENTRY', 'SELECTED_ENTRIES', 'CURRENT_DAY', 'DATE_RANGE', 'LIFE', 'TIMELINE', 'HISTORY', 'FITNESS', 'DAILY_PACK', 'AI_USAGE', 'SELECTED_MEDIA', 'USER_SELECTED_ARCHIVE')),
  include_historical_revisions boolean NOT NULL DEFAULT false,
  consent_version text,
  consent_accepted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personal_ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_scope text NOT NULL CHECK (current_scope IN ('NONE', 'SELECTED_ENTRY', 'SELECTED_ENTRIES', 'CURRENT_DAY', 'DATE_RANGE', 'LIFE', 'TIMELINE', 'HISTORY', 'FITNESS', 'DAILY_PACK', 'AI_USAGE', 'SELECTED_MEDIA', 'USER_SELECTED_ARCHIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (owner_user_id, id)
);

CREATE TABLE IF NOT EXISTS personal_ai_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid,
  question_hash text NOT NULL CHECK (question_hash ~ '^[a-f0-9]{64}$'),
  scope text NOT NULL CHECK (scope IN ('NONE', 'SELECTED_ENTRY', 'SELECTED_ENTRIES', 'CURRENT_DAY', 'DATE_RANGE', 'LIFE', 'TIMELINE', 'HISTORY', 'FITNESS', 'DAILY_PACK', 'AI_USAGE', 'SELECTED_MEDIA', 'USER_SELECTED_ARCHIVE')),
  archive_mode text NOT NULL CHECK (archive_mode IN ('ARCHIVE_ONLY', 'ARCHIVE_PLUS_GENERAL')),
  status text NOT NULL CHECK (status IN ('SUCCEEDED', 'NO_EVIDENCE', 'REJECTED', 'FAILED')),
  evidence_kind text NOT NULL CHECK (evidence_kind IN ('DIRECT_EVIDENCE', 'INFERRED', 'NO_EVIDENCE')),
  retrieved_chunk_count integer NOT NULL DEFAULT 0 CHECK (retrieved_chunk_count >= 0),
  retrieval_latency_ms integer NOT NULL DEFAULT 0 CHECK (retrieval_latency_ms >= 0),
  generation_latency_ms integer CHECK (generation_latency_ms IS NULL OR generation_latency_ms >= 0),
  model_code text,
  provider_code text,
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  cost_fen integer NOT NULL DEFAULT 0 CHECK (cost_fen >= 0),
  answer_ciphertext text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, conversation_id)
    REFERENCES personal_ai_conversations (owner_user_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS personal_ai_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('LIFE', 'TIMELINE', 'HISTORY', 'FITNESS', 'STEPS', 'DAILY_PACK', 'AI_USAGE', 'TAGS', 'PUBLISHED_SNAPSHOT')),
  source_id uuid NOT NULL,
  revision_id uuid,
  occurred_at timestamptz NOT NULL,
  truth_layer text NOT NULL CHECK (truth_layer IN ('ORIGINAL', 'REVISION', 'PUBLISHED_SNAPSHOT', 'AI_INSIGHT')),
  excerpt_safe text NOT NULL CHECK (length(excerpt_safe) <= 2_000),
  relevance_score numeric NOT NULL CHECK (relevance_score >= 0),
  revoked_at timestamptz,
  FOREIGN KEY (owner_user_id, query_id)
    REFERENCES personal_ai_queries (owner_user_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query_id uuid NOT NULL,
  title text,
  content_ciphertext text NOT NULL,
  truth_layer text NOT NULL DEFAULT 'AI_INSIGHT' CHECK (truth_layer = 'AI_INSIGHT'),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  FOREIGN KEY (owner_user_id, query_id)
    REFERENCES personal_ai_queries (owner_user_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS personal_knowledge_chunks_owner_occurred_idx ON personal_knowledge_chunks (owner_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS personal_knowledge_sources_owner_canonical_idx ON personal_knowledge_sources (owner_user_id, canonical_source_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS personal_ai_queries_owner_created_idx ON personal_ai_queries (owner_user_id, created_at DESC);

INSERT INTO personal_ai_index_versions (version, chunk_strategy, embedding_model_code, schema_version, status)
VALUES ('personal-ai-v1-local', 'semantic-paragraph-entry-boundary-v1', 'DETERMINISTIC_LOCAL_V1', 'personal-ai.v1', 'ACTIVE')
ON CONFLICT (version) DO NOTHING;

-- Privacy is enforced at the database boundary even for a table owner. The
-- application sets app.user_id only after authenticating a consumer session.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'personal_ai_index_versions', 'personal_knowledge_sources',
    'personal_knowledge_chunks', 'personal_knowledge_embeddings',
    'personal_index_jobs', 'personal_ai_preferences',
    'personal_ai_conversations', 'personal_ai_queries',
    'personal_ai_citations', 'ai_insights'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

-- No consumer SQL policy grants direct access to source text, chunks,
-- embeddings, query ciphertext, or citations. The trusted Personal AI service
-- role performs owner-scoped queries after authenticating the principal and is
-- the only role granted these tables in deployment. FORCE RLS prevents a table
-- owner from silently bypassing the boundary; migrations must provision the
-- service role with an audited BYPASSRLS/SECURITY DEFINER path separately.

COMMIT;
