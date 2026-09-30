-- ME.zip Phase 5 Messaging. Additive migration; apply after 001--005 through
-- the reviewed migration runner. Consumer clients must never set mezip.*
-- transaction settings. Root private reads go only through the separately
-- authenticated Admin boundary, which writes admin_access_audit first.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES community_groups(id);
-- Explicit Founder Inbox marker. Existing direct conversations remain false;
-- only the authorized Founder-Inbox command may promote/create one.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS founder_inbox boolean NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_id uuid;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_at timestamptz;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_status_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED'));
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_founder_inbox_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_founder_inbox_check CHECK (NOT founder_inbox OR kind = 'DIRECT');
CREATE INDEX IF NOT EXISTS conversations_group_idx ON conversations (group_id) WHERE group_id IS NOT NULL;

-- Canonical unordered direct pair: one DIRECT conversation only, regardless of
-- which participant opened it or which device retried the request.
CREATE TABLE IF NOT EXISTS direct_conversation_pairs (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  user_low_id uuid NOT NULL REFERENCES users(id),
  user_high_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_low_id, user_high_id),
  CHECK (user_low_id <> user_high_id),
  CHECK (user_low_id::text < user_high_id::text)
);

ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS left_at timestamptz;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE conversation_members DROP CONSTRAINT IF EXISTS conversation_members_status_check;
ALTER TABLE conversation_members ADD CONSTRAINT conversation_members_status_check CHECK (status IN ('ACTIVE', 'LEFT', 'REMOVED', 'BANNED'));
CREATE INDEX IF NOT EXISTS conversation_members_user_active_idx ON conversation_members (user_id, updated_at DESC) WHERE status = 'ACTIVE';

-- 001 stored message body as a required JSONB envelope and used reply_to_id.
-- Phase 5 keeps the legacy columns for additive rollout but makes the canonical
-- text/reply fields explicit so media-only messages and erased bodies are valid.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS body_text text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id uuid;
ALTER TABLE messages ALTER COLUMN body DROP NOT NULL;
UPDATE messages
  SET body_text = COALESCE(body_text, NULLIF(body->>'text', ''))
  WHERE body_text IS NULL;
UPDATE messages
  SET reply_to_message_id = reply_to_id
  WHERE reply_to_message_id IS NULL AND reply_to_id IS NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_reply_to_message_fk') THEN
    ALTER TABLE messages ADD CONSTRAINT messages_reply_to_message_fk
      FOREIGN KEY (reply_to_message_id) REFERENCES messages(id);
  END IF;
END $$;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by_user_id uuid REFERENCES users(id);
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE messages ADD CONSTRAINT messages_status_check CHECK (status IN ('ACTIVE', 'DELETED'));
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_body_text_length_check;
ALTER TABLE messages ADD CONSTRAINT messages_body_text_length_check CHECK (body_text IS NULL OR length(body_text) <= 10000);
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_kind_check;
ALTER TABLE messages ADD CONSTRAINT messages_kind_check CHECK (kind IN ('TEXT', 'IMAGE', 'VIDEO', 'VOICE', 'FILE', 'SYSTEM'));
CREATE INDEX IF NOT EXISTS messages_conversation_sequence_idx ON messages (conversation_id, sequence DESC);
DROP INDEX IF EXISTS messages_search_idx;
CREATE INDEX IF NOT EXISTS messages_search_idx ON messages USING gin (to_tsvector('simple', coalesce(body_text, '')));

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_last_message_fk;
ALTER TABLE conversations ADD CONSTRAINT conversations_last_message_fk FOREIGN KEY (last_message_id) REFERENCES messages(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS message_attachments (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES archive_media_assets(id),
  kind text NOT NULL CHECK (kind IN ('IMAGE', 'VIDEO', 'VOICE', 'FILE')),
  ordinal smallint NOT NULL CHECK (ordinal >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, media_id),
  UNIQUE (message_id, ordinal)
);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  type text NOT NULL CHECK (type IN ('LIKE', 'LOVE', 'LAUGH', 'SURPRISED', 'SAD', 'THANKS')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, type)
);

-- Receipt state is independent of content and permits unread counts without
-- exposing a message body. conversation_members.last_read_sequence is retained
-- as the fast projection; this table is the durable per-user cursor source.
CREATE TABLE IF NOT EXISTS message_read_states (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_sequence bigint NOT NULL DEFAULT 0 CHECK (last_read_sequence >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS conversation_settings (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_until timestamptz,
  pinned_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS message_drafts (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text,
  media_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply_to_message_id uuid REFERENCES messages(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id),
  CHECK (body IS NULL OR length(body) <= 10000)
);

CREATE TABLE IF NOT EXISTS message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES users(id),
  message_id uuid NOT NULL REFERENCES messages(id),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  reason text NOT NULL CHECK (reason IN ('SPAM', 'HARASSMENT', 'HATE', 'SEXUAL', 'VIOLENCE', 'SCAM', 'PRIVACY', 'OTHER')),
  details text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWING', 'ACTIONED', 'DISMISSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (details IS NULL OR length(details) <= 4000)
);
CREATE INDEX IF NOT EXISTS message_reports_status_idx ON message_reports (status, created_at DESC);

-- Deliberately body-free notification work items. Delivery providers consume
-- only this metadata; private text/media stays in messages/attachments.
CREATE TABLE IF NOT EXISTS messaging_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('MESSAGE', 'REPLY', 'REACTION', 'MESSAGE_REPORT')),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  summary_code text NOT NULL CHECK (length(btrim(summary_code)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'UNREAD' CHECK (status IN ('UNREAD', 'READ')),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS messaging_notifications_recipient_idx
  ON messaging_notifications (recipient_user_id, status, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS user_presence (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE', 'AWAY', 'OFFLINE')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

-- Durable acknowledgement for offline outbox retries. The messages uniqueness
-- and this receipt pair make client_message_id safe to retry exactly once.
CREATE TABLE IF NOT EXISTS message_outbox (
  sender_id uuid NOT NULL REFERENCES users(id),
  client_message_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  message_id uuid REFERENCES messages(id),
  request_digest text NOT NULL,
  status text NOT NULL DEFAULT 'APPLIED' CHECK (status IN ('PENDING', 'APPLIED', 'FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  PRIMARY KEY (sender_id, client_message_id)
);

CREATE TABLE IF NOT EXISTS messaging_idempotency_keys (
  principal_user_id uuid NOT NULL REFERENCES users(id),
  operation text NOT NULL CHECK (length(btrim(operation)) BETWEEN 1 AND 120),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 256),
  request_digest text NOT NULL,
  result_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (principal_user_id, operation, idempotency_key)
);

CREATE OR REPLACE FUNCTION mezip_messaging_member(candidate_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_members cm
    JOIN conversations c ON c.id = cm.conversation_id
    WHERE cm.conversation_id = candidate_conversation_id
      AND cm.user_id = mezip_setting_uuid('mezip.principal_id')
      AND cm.status = 'ACTIVE'
      AND c.status = 'ACTIVE'
      AND (c.kind <> 'GROUP' OR (c.group_id IS NOT NULL AND mezip_group_member(c.group_id)))
  );
$$;

CREATE OR REPLACE FUNCTION mezip_next_message_sequence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE next_sequence bigint;
BEGIN
  IF NEW.sender_id <> mezip_setting_uuid('mezip.principal_id') THEN
    RAISE EXCEPTION 'message sender must be the authenticated principal' USING ERRCODE = '42501';
  END IF;
  IF NOT mezip_messaging_member(NEW.conversation_id) THEN
    RAISE EXCEPTION 'active conversation membership required' USING ERRCODE = '42501';
  END IF;
  UPDATE conversations SET last_sequence = last_sequence + 1, updated_at = now()
    WHERE id = NEW.conversation_id AND status = 'ACTIVE'
    RETURNING last_sequence INTO next_sequence;
  IF next_sequence IS NULL THEN RAISE EXCEPTION 'conversation unavailable' USING ERRCODE = '42501'; END IF;
  NEW.sequence := next_sequence;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_assign_sequence ON messages;
CREATE TRIGGER messages_assign_sequence BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION mezip_next_message_sequence();

-- RLS can decide who updates a row, but not which columns or state transitions
-- are legal. Keep message identity/ordering immutable and make soft deletion
-- terminal so a broad UPDATE policy cannot rewrite a transcript.
CREATE OR REPLACE FUNCTION mezip_guard_message_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
     OR OLD.sender_id IS DISTINCT FROM NEW.sender_id
     OR OLD.client_message_id IS DISTINCT FROM NEW.client_message_id
     OR OLD.sequence IS DISTINCT FROM NEW.sequence
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.reply_to_message_id IS DISTINCT FROM NEW.reply_to_message_id
     OR OLD.reply_to_id IS DISTINCT FROM NEW.reply_to_id
     OR OLD.quoted_message_id IS DISTINCT FROM NEW.quoted_message_id THEN
    RAISE EXCEPTION 'message identity and reply fields are immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'DELETED' THEN
    RAISE EXCEPTION 'deleted messages are immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'ACTIVE' THEN
    IF NEW.deleted_at IS NOT NULL OR NEW.deleted_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'active messages cannot have delete metadata' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.status = 'DELETED' THEN
    IF NEW.deleted_at IS NULL OR NEW.deleted_by_user_id IS NULL
       OR NEW.body_text IS NOT NULL OR NEW.body IS NOT NULL THEN
      RAISE EXCEPTION 'deleted messages must erase body and record deleter' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid message status transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_guard_update ON messages;
CREATE TRIGGER messages_guard_update BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION mezip_guard_message_update();

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_conversation_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_read_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messaging_conversation_read ON conversations;
CREATE POLICY messaging_conversation_read ON conversations FOR SELECT USING (mezip_messaging_member(id));
DROP POLICY IF EXISTS messaging_member_read ON conversation_members;
CREATE POLICY messaging_member_read ON conversation_members FOR SELECT USING (mezip_messaging_member(conversation_id));
DROP POLICY IF EXISTS messaging_message_read ON messages;
CREATE POLICY messaging_message_read ON messages FOR SELECT USING (mezip_messaging_member(conversation_id));
DROP POLICY IF EXISTS messaging_attachment_read ON message_attachments;
CREATE POLICY messaging_attachment_read ON message_attachments FOR SELECT USING (EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND mezip_messaging_member(m.conversation_id)));
DROP POLICY IF EXISTS messaging_reaction_participant ON message_reactions;
CREATE POLICY messaging_reaction_participant ON message_reactions FOR ALL USING (EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND mezip_messaging_member(m.conversation_id))) WITH CHECK (user_id = mezip_setting_uuid('mezip.principal_id'));
DROP POLICY IF EXISTS messaging_read_state_owner ON message_read_states;
CREATE POLICY messaging_read_state_owner ON message_read_states FOR ALL USING (user_id = mezip_setting_uuid('mezip.principal_id') AND mezip_messaging_member(conversation_id)) WITH CHECK (user_id = mezip_setting_uuid('mezip.principal_id') AND mezip_messaging_member(conversation_id));
DROP POLICY IF EXISTS messaging_conversation_settings_owner ON conversation_settings;
CREATE POLICY messaging_conversation_settings_owner ON conversation_settings FOR ALL USING (user_id = mezip_setting_uuid('mezip.principal_id') AND mezip_messaging_member(conversation_id)) WITH CHECK (user_id = mezip_setting_uuid('mezip.principal_id') AND mezip_messaging_member(conversation_id));
DROP POLICY IF EXISTS messaging_draft_owner ON message_drafts;
CREATE POLICY messaging_draft_owner ON message_drafts FOR ALL USING (user_id = mezip_setting_uuid('mezip.principal_id') AND mezip_messaging_member(conversation_id)) WITH CHECK (user_id = mezip_setting_uuid('mezip.principal_id') AND mezip_messaging_member(conversation_id));
DROP POLICY IF EXISTS messaging_report_owner_or_root ON message_reports;
CREATE POLICY messaging_report_owner_or_root ON message_reports FOR SELECT USING (reporter_user_id = mezip_setting_uuid('mezip.principal_id'));
DROP POLICY IF EXISTS messaging_report_create ON message_reports;
CREATE POLICY messaging_report_create ON message_reports FOR INSERT WITH CHECK (reporter_user_id = mezip_setting_uuid('mezip.principal_id') AND mezip_messaging_member(conversation_id));
DROP POLICY IF EXISTS messaging_notification_recipient ON messaging_notifications;
CREATE POLICY messaging_notification_recipient ON messaging_notifications FOR SELECT
  USING (recipient_user_id = mezip_setting_uuid('mezip.principal_id'));
DROP POLICY IF EXISTS messaging_outbox_owner ON message_outbox;
CREATE POLICY messaging_outbox_owner ON message_outbox FOR ALL USING (sender_id = mezip_setting_uuid('mezip.principal_id')) WITH CHECK (sender_id = mezip_setting_uuid('mezip.principal_id'));
DROP POLICY IF EXISTS messaging_idempotency_owner ON messaging_idempotency_keys;
CREATE POLICY messaging_idempotency_owner ON messaging_idempotency_keys FOR ALL USING (principal_user_id = mezip_setting_uuid('mezip.principal_id')) WITH CHECK (principal_user_id = mezip_setting_uuid('mezip.principal_id'));

-- Consumer writes are limited to the authenticated member's own message,
-- reaction, receipt, draft and preference rows. Direct/group creation and
-- membership fan-out are server commands that run after application-side
-- block/group/entitlement checks; no client RLS policy can self-enroll users.
DROP POLICY IF EXISTS messaging_direct_conversation_create ON conversations;
CREATE POLICY messaging_direct_conversation_create ON conversations FOR INSERT
  WITH CHECK (kind = 'DIRECT' AND created_by = mezip_setting_uuid('mezip.principal_id') AND status = 'ACTIVE');
DROP POLICY IF EXISTS messaging_message_insert ON messages;
CREATE POLICY messaging_message_insert ON messages FOR INSERT
  WITH CHECK (sender_id = mezip_setting_uuid('mezip.principal_id') AND mezip_messaging_member(conversation_id));
DROP POLICY IF EXISTS messaging_message_sender_update ON messages;
CREATE POLICY messaging_message_sender_update ON messages FOR UPDATE
  USING (sender_id = mezip_setting_uuid('mezip.principal_id') AND mezip_messaging_member(conversation_id))
  WITH CHECK (sender_id = mezip_setting_uuid('mezip.principal_id') AND mezip_messaging_member(conversation_id));
DROP POLICY IF EXISTS messaging_attachment_insert ON message_attachments;
CREATE POLICY messaging_attachment_insert ON message_attachments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND m.sender_id = mezip_setting_uuid('mezip.principal_id') AND mezip_messaging_member(m.conversation_id)));
DROP POLICY IF EXISTS messaging_attachment_delete ON message_attachments;
CREATE POLICY messaging_attachment_delete ON message_attachments FOR DELETE
  USING (EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND m.sender_id = mezip_setting_uuid('mezip.principal_id') AND mezip_messaging_member(m.conversation_id)));
DROP POLICY IF EXISTS messaging_reaction_participant ON message_reactions;
DROP POLICY IF EXISTS messaging_reaction_read ON message_reactions;
DROP POLICY IF EXISTS messaging_reaction_insert ON message_reactions;
DROP POLICY IF EXISTS messaging_reaction_delete ON message_reactions;
CREATE POLICY messaging_reaction_read ON message_reactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND mezip_messaging_member(m.conversation_id)));
CREATE POLICY messaging_reaction_insert ON message_reactions FOR INSERT
  WITH CHECK (user_id = mezip_setting_uuid('mezip.principal_id') AND EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND mezip_messaging_member(m.conversation_id)));
CREATE POLICY messaging_reaction_delete ON message_reactions FOR DELETE
  USING (user_id = mezip_setting_uuid('mezip.principal_id') AND EXISTS (SELECT 1 FROM messages m WHERE m.id = message_id AND mezip_messaging_member(m.conversation_id)));

-- No consumer policy exists for direct_conversation_pairs or user_presence;
-- those relations are server/internal-only. Admin readers must use the API
-- adapter, which calls AdminAuthorizationService and appends an audit event.
