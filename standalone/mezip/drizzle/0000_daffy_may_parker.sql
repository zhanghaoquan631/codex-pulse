CREATE TABLE `account_saved` (
	`user_key` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_key`, `url`)
);
--> statement-breakpoint
CREATE TABLE `account_state` (
	`user_key` text NOT NULL,
	`name` text NOT NULL,
	`value` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_key`, `name`)
);
--> statement-breakpoint
CREATE TABLE `auth_send_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`ip` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_send_created` ON `auth_send_reservations` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_auth_send_ip` ON `auth_send_reservations` (`ip`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_auth_send_email` ON `auth_send_reservations` (`email`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_verify_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`ip` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_verify_ip` ON `auth_verify_reservations` (`ip`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_auth_verify_email` ON `auth_verify_reservations` (`email`,`created_at`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`notes` text NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`ip_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`notification` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bookings_email_created` ON `bookings` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `bookings_ip_created` ON `bookings` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `bookings_owner_created` ON `bookings` (`owner_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `gallery_game_scores` (
	`owner_key` text PRIMARY KEY NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`correct` integer DEFAULT 0 NOT NULL,
	`wrong` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gallery_grants` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `gallery_grants_owner_created` ON `gallery_grants` (`owner_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `gallery_quest_accounts` (
	`owner_key` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`revision` integer NOT NULL,
	`quest_json` text NOT NULL,
	`reset_id` text,
	`history_json` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "gallery_quest_accounts_check_1" CHECK(revision >= 1)
);
--> statement-breakpoint
CREATE TABLE `gallery_storage_usage` (
	`scope` text PRIMARY KEY NOT NULL,
	`used_bytes` integer DEFAULT 0 NOT NULL,
	`file_count` integer DEFAULT 0 NOT NULL,
	`max_bytes` integer NOT NULL,
	`max_files` integer NOT NULL,
	CONSTRAINT "gallery_storage_usage_check_1" CHECK(used_bytes >= 0 AND used_bytes <= max_bytes),
	CONSTRAINT "gallery_storage_usage_check_2" CHECK(file_count >= 0 AND file_count <= max_files)
);
--> statement-breakpoint
CREATE TABLE `gallery_upload_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`object_key` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `gallery_upload_reservations_created` ON `gallery_upload_reservations` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_upload_reservations_object_key_unique` ON `gallery_upload_reservations` (`object_key`);--> statement-breakpoint
CREATE TABLE `gallery_works` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`filename` text NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `gallery_works_owner_created` ON `gallery_works` (`owner_key`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_works_owner_filename` ON `gallery_works` (`owner_key`,`filename`);--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_works_object_key_unique` ON `gallery_works` (`object_key`);--> statement-breakpoint
CREATE TABLE `login_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` blob NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`attempts_remaining` integer NOT NULL,
	`request_ip` text,
	`user_agent` text,
	`transport_message_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_challenges_email_sent` ON `login_challenges` (`email`,`sent_at`);--> statement-breakpoint
CREATE TABLE `login_events` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`event_type` text NOT NULL,
	`success` integer NOT NULL,
	`detail` text,
	`ip` text,
	`user_agent` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_email` ON `login_events` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_events_created` ON `login_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `media_links` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`kind` text NOT NULL,
	`pin_salt` text,
	`pin_hash` text,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`upload_count` integer DEFAULT 0 NOT NULL,
	`failed_pins` integer DEFAULT 0 NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "media_links_check_1" CHECK(kind IN ('owner', 'guest'))
);
--> statement-breakpoint
CREATE INDEX `media_links_owner` ON `media_links` (`owner_key`,`kind`,`expires_at`);--> statement-breakpoint
CREATE TABLE `media_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`original_filename` text NOT NULL,
	`media_type` text NOT NULL,
	`size` integer NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`placement` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`kind` text NOT NULL,
	`link_hash` text,
	`state` text NOT NULL,
	CONSTRAINT "media_objects_check_1" CHECK(size > 0 AND size <= 20971520),
	CONSTRAINT "media_objects_check_2" CHECK(kind IN ('owner', 'guest')),
	CONSTRAINT "media_objects_check_3" CHECK(state IN ('reserved', 'ready'))
);
--> statement-breakpoint
CREATE INDEX `media_objects_link` ON `media_objects` (`link_hash`);--> statement-breakpoint
CREATE INDEX `media_objects_expiry` ON `media_objects` (`owner_key`,`expires_at`);--> statement-breakpoint
CREATE INDEX `media_objects_owner` ON `media_objects` (`owner_key`,`kind`,`state`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_objects_filename_unique` ON `media_objects` (`filename`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_objects_object_key_unique` ON `media_objects` (`object_key`);--> statement-breakpoint
CREATE TABLE `media_pageviews` (
	`day` text NOT NULL,
	`event_id` text NOT NULL,
	`hour` integer NOT NULL,
	`path` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`day`, `event_id`),
	CONSTRAINT "media_pageviews_check_1" CHECK(hour BETWEEN 0 AND 23)
);
--> statement-breakpoint
CREATE INDEX `media_pageviews_hours` ON `media_pageviews` (`day`,`hour`);--> statement-breakpoint
CREATE TABLE `media_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`link_hash` text NOT NULL,
	`owner_key` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_sessions_link` ON `media_sessions` (`link_hash`);--> statement-breakpoint
CREATE INDEX `media_sessions_owner` ON `media_sessions` (`owner_key`,`expires_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` blob NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`ip` text,
	`user_agent` text
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_expires` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer NOT NULL,
	`login_count` integer DEFAULT 1 NOT NULL,
	`last_ip` text,
	`last_user_agent` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);