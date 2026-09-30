CREATE TABLE `website_events` (
	`id` text PRIMARY KEY NOT NULL,
	`website_id` text NOT NULL,
	`title` text NOT NULL,
	`observed_at` text NOT NULL,
	`record_type` text DEFAULT 'delivery' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_website_events_link_time` ON `website_events` (`website_id`,`observed_at`);--> statement-breakpoint
ALTER TABLE `websites` ADD `box_name` text DEFAULT '' NOT NULL;