CREATE TABLE `compass_media` (
	`scope` text NOT NULL,
	`id` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`scope`, `id`)
);
--> statement-breakpoint
CREATE TABLE `compass_memories` (
	`scope` text NOT NULL,
	`id` text NOT NULL,
	`text` text NOT NULL,
	`priority` text NOT NULL,
	`done` integer NOT NULL,
	`remind_at` integer,
	`notified` integer NOT NULL,
	`version` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`scope`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_compass_memories_scope_created` ON `compass_memories` (`scope`,`done`,`created`);--> statement-breakpoint
CREATE TABLE `compass_workspace` (
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer NOT NULL,
	PRIMARY KEY(`scope`, `key`)
);
