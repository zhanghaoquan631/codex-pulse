-- ME.zip Phase 17 — Quote/Repost relationships.
-- Additive migration: quotes retain a source relation and reposts are a
-- unique user/post relationship. Neither operation duplicates original post,
-- archive, or saved-item content.
BEGIN;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS quoted_post_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_posts_quoted_post_fk'
  ) THEN
    ALTER TABLE community_posts
      ADD CONSTRAINT community_posts_quoted_post_fk
      FOREIGN KEY (quoted_post_id) REFERENCES community_posts(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS community_posts_quoted_post_idx
  ON community_posts (quoted_post_id)
  WHERE quoted_post_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS community_reposts (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS community_reposts_post_time_idx
  ON community_reposts (post_id, created_at DESC);

-- Trusted services make the authoritative mutation decision.  Consumer SQL
-- can only see a repost if the target post itself passes existing post RLS.
ALTER TABLE community_reposts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reposts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_reposts_participant_policy ON community_reposts;
CREATE POLICY community_reposts_participant_policy ON community_reposts
  USING (
    user_id = mezip_setting_uuid('mezip.principal_id')
    OR EXISTS (SELECT 1 FROM community_posts p WHERE p.id = post_id)
    OR mezip_admin_has_capability('ROOT_READ_USER_DATA')
  )
  WITH CHECK (
    user_id = mezip_setting_uuid('mezip.principal_id')
    AND EXISTS (SELECT 1 FROM community_posts p WHERE p.id = post_id)
  );

COMMIT;
