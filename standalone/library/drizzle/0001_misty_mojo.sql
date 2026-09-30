CREATE TABLE `capture_files` (
	`grant_id` text NOT NULL,
	`file_id` text NOT NULL,
	PRIMARY KEY(`grant_id`, `file_id`)
);
--> statement-breakpoint
CREATE TABLE `capture_links` (
	`id` text PRIMARY KEY NOT NULL,
	`grant_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`quota_window` integer DEFAULT 0 NOT NULL,
	`preview_count` integer DEFAULT 0 NOT NULL,
	`submission_count` integer DEFAULT 0 NOT NULL,
	`file_count` integer DEFAULT 0 NOT NULL
);
