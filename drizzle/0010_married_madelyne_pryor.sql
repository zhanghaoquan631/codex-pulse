CREATE TABLE `music_plays` (
	`scope` text NOT NULL,
	`play_id` text NOT NULL,
	`started_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `play_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_music_plays_scope_started` ON `music_plays` (`scope`,`started_at`);--> statement-breakpoint
ALTER TABLE `music_listeners` ADD `started_at` integer DEFAULT 0 NOT NULL;