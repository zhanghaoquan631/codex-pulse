-- Phase 18: explicit stranger message-request lifecycle on the existing
-- canonical direct-conversation table. This does not create a second DM model.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS request_state text NOT NULL DEFAULT 'ACCEPTED',
  ADD COLUMN IF NOT EXISTS request_recipient_user_id uuid NULL;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_request_state_check
  CHECK (request_state IN ('NONE', 'PENDING', 'ACCEPTED', 'REJECTED', 'BLOCKED'));

ALTER TABLE conversations
  ADD CONSTRAINT conversations_request_recipient_check
  CHECK (
    (request_state = 'PENDING' AND request_recipient_user_id IS NOT NULL)
    OR (request_state <> 'PENDING')
  );

CREATE INDEX IF NOT EXISTS conversations_request_recipient_pending_idx
  ON conversations (request_recipient_user_id, updated_at DESC)
  WHERE request_state = 'PENDING';
