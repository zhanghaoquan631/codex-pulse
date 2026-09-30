CREATE TABLE `website_sync` (
	`id` integer PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `websites` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`first_seen` text NOT NULL,
	`last_seen` text NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	`customized` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `websites_url_unique` ON `websites` (`url`);--> statement-breakpoint
CREATE INDEX `idx_websites_visible_recent` ON `websites` (`hidden`,`last_seen`);