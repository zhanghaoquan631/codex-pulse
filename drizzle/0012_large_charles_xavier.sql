CREATE TABLE `quota_official_history` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`payload` text NOT NULL,
	`observed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_quota_official_history_email_time` ON `quota_official_history` (`email`,`observed_at`);--> statement-breakpoint
CREATE TABLE `quota_queries` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`state` text NOT NULL,
	`reason` text NOT NULL,
	`requested_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`verified_email` text,
	`result_code` text,
	`fields` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_quota_queries_state_requested` ON `quota_queries` (`state`,`requested_at`);--> statement-breakpoint
CREATE TABLE `quota_query_control` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`interval_minutes` integer DEFAULT 5 NOT NULL,
	`worker_seen_at` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer DEFAULT 0 NOT NULL
);
