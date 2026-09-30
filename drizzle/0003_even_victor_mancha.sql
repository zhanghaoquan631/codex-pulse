CREATE TABLE `mezip_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`device_id` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`body` text,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires` integer NOT NULL,
	`lease_until` integer NOT NULL,
	`response_status` integer,
	`response_body` text
);
--> statement-breakpoint
CREATE INDEX `idx_mezip_commands_queue` ON `mezip_commands` (`device_id`,`state`,`expires`);--> statement-breakpoint
CREATE TABLE `mezip_connection` (
	`id` integer PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`online` integer NOT NULL,
	`last_seen` integer NOT NULL
);
