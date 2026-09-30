CREATE TABLE `racing_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`state_json` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`create_key_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `racing_rooms_create_key_idx` ON `racing_rooms` (`create_key_hash`);--> statement-breakpoint
CREATE INDEX `racing_rooms_expiry_idx` ON `racing_rooms` (`expires_at`);