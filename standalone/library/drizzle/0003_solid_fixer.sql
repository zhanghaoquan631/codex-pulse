CREATE TABLE IF NOT EXISTS `jianying_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`pair_hash` text,
	`pair_expires` integer DEFAULT 0 NOT NULL,
	`token_hash` text,
	`created_at` integer NOT NULL,
	`expires_at` integer DEFAULT 0 NOT NULL,
	`last_seen` integer DEFAULT 0 NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `jianying_devices_pair_hash_unique` ON `jianying_devices` (`pair_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `jianying_devices_token_hash_unique` ON `jianying_devices` (`token_hash`);
