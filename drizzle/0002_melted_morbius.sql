CREATE TABLE `credit_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`balance` text,
	`unlimited` integer DEFAULT 0 NOT NULL,
	`observed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `credit_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`direction` text NOT NULL,
	`amount` text NOT NULL,
	`usd_micros` integer NOT NULL,
	`before_balance` text NOT NULL,
	`after_balance` text NOT NULL,
	`observed_at` text NOT NULL,
	`classification` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_credit_changes_time` ON `credit_changes` (`observed_at`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_date` text NOT NULL,
	`currency` text NOT NULL,
	`amount` text NOT NULL,
	`usd_micros` integer NOT NULL,
	`rate` text NOT NULL,
	`rate_date` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger_sync` (
	`id` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
