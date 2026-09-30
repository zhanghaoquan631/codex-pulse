CREATE TABLE `music_history` (
	`scope` text NOT NULL,
	`track_key` text NOT NULL,
	`payload` text NOT NULL,
	`last_played_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `track_key`)
);
--> statement-breakpoint
CREATE INDEX `idx_music_history_listener_time` ON `music_history` (`scope`,`last_played_at`);--> statement-breakpoint
CREATE TABLE `music_listeners` (
	`scope` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer NOT NULL,
	`play_id` text NOT NULL,
	`sequence` integer NOT NULL
);
