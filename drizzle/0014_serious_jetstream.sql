CREATE TABLE `compass_days` (
	`scope` text NOT NULL,
	`date` text NOT NULL,
	`habits` text NOT NULL,
	`scores` text NOT NULL,
	`version` integer NOT NULL,
	PRIMARY KEY(`scope`, `date`)
);
--> statement-breakpoint
CREATE TABLE `compass_entries` (
	`scope` text NOT NULL,
	`id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`scope`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_compass_entries_day` ON `compass_entries` (`scope`,`date`,`created`);--> statement-breakpoint
CREATE TABLE `compass_tasks` (
	`scope` text NOT NULL,
	`id` text NOT NULL,
	`text` text NOT NULL,
	`due` text,
	`done` integer NOT NULL,
	`version` integer NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`scope`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_compass_tasks_created` ON `compass_tasks` (`scope`,`created`);