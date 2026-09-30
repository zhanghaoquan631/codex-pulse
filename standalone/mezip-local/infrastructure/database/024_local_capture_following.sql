-- ME.zip local capture: explicit follow/unfollow actions on supported public web sites.
-- This migration expands event metadata only. It does not store passwords,
-- cookies, provider tokens, or complete third-party following lists.
BEGIN;

ALTER TABLE x_capture_events
  DROP CONSTRAINT IF EXISTS x_capture_events_platform_check,
  DROP CONSTRAINT IF EXISTS x_capture_events_action_type_check,
  DROP CONSTRAINT IF EXISTS x_capture_events_post_url_check;

ALTER TABLE x_capture_events
  ADD CONSTRAINT x_capture_events_platform_check
    CHECK (platform IN ('X', 'DOUYIN', 'BILIBILI')),
  ADD CONSTRAINT x_capture_events_action_type_check
    CHECK (action_type IN ('like','unlike','bookmark','unbookmark','follow','unfollow','opened','viewed','copied_link','share_to_mezip','manual_save','add_note')),
  ADD CONSTRAINT x_capture_events_post_url_check
    CHECK (post_url ~ '^https://');

COMMIT;
