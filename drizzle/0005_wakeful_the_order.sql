CREATE TABLE `quota_accounts` (
	`email` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
