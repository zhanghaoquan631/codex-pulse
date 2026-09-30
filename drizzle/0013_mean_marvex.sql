CREATE TABLE `microphone_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`receiver_hash` text NOT NULL,
	`sender_hash` text NOT NULL,
	`offer` text NOT NULL,
	`answer` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `microphone_rooms_owner_unique` ON `microphone_rooms` (`owner`);